import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.sqlite import SqliteSaver
from sentry_sdk import logger as sentry_logger
from sentry_sdk.integrations.logging import LoggingIntegration

from app.api.router import api_router
from app.config import get_settings, parse_cors_origins
from app.db.session_store import init_session_schema
from app.graph.workflow import build_graph
from app.services.runs_service import RunOrchestrator

# Routes we care about for success logging — skip health checks and debug endpoints.
_UPLOAD_PREFIXES = ("/api/v2/", "/api/transcribe/")


def _before_send_log(record, hint):
    """Drop health-check and sentry-debug log noise before it reaches Sentry."""
    msg = getattr(record, "message", "") or ""
    if "/health" in msg or "/sentry-debug" in msg:
        return None
    return record


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    ck_path = Path(settings.checkpoint_sqlite_path)
    ck_path.parent.mkdir(parents=True, exist_ok=True)

    app.state.orchestrator = None
    if settings.openai_api_key:
        with SqliteSaver.from_conn_string(str(ck_path)) as checkpointer:
            graph = build_graph(settings, checkpointer)
            app.state.orchestrator = RunOrchestrator(graph)
            yield
    else:
        yield

    app.state.orchestrator = None


def create_app() -> FastAPI:
    settings = get_settings()
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            send_default_pii=True,
            enable_logs=True,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            profile_session_sample_rate=settings.sentry_profile_session_sample_rate,
            profile_lifecycle="trace",
            before_send_log=_before_send_log,
            integrations=[
                # Forward stdlib logging at INFO+ to Sentry Logs.
                LoggingIntegration(
                    level=logging.INFO,        # capture INFO+ as breadcrumbs
                    event_level=logging.ERROR, # only ERROR+ create Sentry Issues
                    sentry_logs_level=logging.INFO,  # INFO+ appear under Explore → Logs
                ),
            ],
        )

    session_path = Path(settings.session_sqlite_path)
    session_path.parent.mkdir(parents=True, exist_ok=True)
    init_session_schema(str(session_path))

    app = FastAPI(title="Transcript Cleanup API", lifespan=lifespan)
    app.state.session_sqlite_path = str(session_path)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=parse_cors_origins(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.middleware("http")
    async def log_upload_requests(request: Request, call_next):
        """Log completed upload/pipeline requests to Sentry Logs."""
        path = request.url.path
        is_upload = any(path.startswith(p) for p in _UPLOAD_PREFIXES)
        start = time.perf_counter()
        response = await call_next(request)
        if is_upload and settings.sentry_dsn:
            duration_ms = round((time.perf_counter() - start) * 1000)
            status = response.status_code
            level = "info" if status < 400 else "warning" if status < 500 else "error"
            log_fn = getattr(sentry_logger, level)
            log_fn(
                f"HTTP {request.method} {path} → {status}",
                attributes={
                    "http.method": request.method,
                    "http.path": path,
                    "http.status_code": status,
                    "duration_ms": duration_ms,
                },
            )
        return response

    if settings.sentry_dsn:

        @app.get("/sentry-debug")
        async def trigger_error():
            _ = 1 / 0

    return app


app = create_app()
