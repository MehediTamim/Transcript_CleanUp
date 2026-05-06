from fastapi import APIRouter

from app.api.routes import health, runs, sessions, transcribe, v2_pipeline
from app.api.routes import chunked_pipeline

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(runs.router)
api_router.include_router(transcribe.router)
api_router.include_router(sessions.router)
api_router.include_router(v2_pipeline.router)
api_router.include_router(chunked_pipeline.router)
