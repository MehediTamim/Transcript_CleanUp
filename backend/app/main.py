from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.sqlite import SqliteSaver

from app.api.router import api_router
from app.config import get_settings, parse_cors_origins
from app.db.session_store import init_session_schema
from app.graph.workflow import build_graph
from app.services.runs_service import RunOrchestrator


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
    return app


app = create_app()
