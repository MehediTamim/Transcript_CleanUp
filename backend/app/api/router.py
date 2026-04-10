from fastapi import APIRouter

from app.api.routes import health, runs, transcribe

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(runs.router)
api_router.include_router(transcribe.router)
