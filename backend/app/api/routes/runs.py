import asyncio

from fastapi import APIRouter, HTTPException, Request

from app.models.schemas import RunCreateRequest, RunCreateResponse, RunResumeRequest, RunStateResponse
from app.services.runs_service import RunOrchestrator

router = APIRouter(prefix="/runs", tags=["runs"])


def _orch(request: Request) -> RunOrchestrator:
    orch = getattr(request.app.state, "orchestrator", None)
    if orch is None:
        raise HTTPException(
            status_code=503,
            detail="Transcript pipeline is unavailable (missing OPENAI_API_KEY or startup error).",
        )
    return orch


@router.post("", response_model=RunCreateResponse)
async def create_run(request: Request, body: RunCreateRequest):
    orch = _orch(request)
    thread_id, _out = await asyncio.to_thread(orch.start, body.raw_transcript)
    st = await asyncio.to_thread(orch.get_state, thread_id)
    return RunCreateResponse(thread_id=thread_id, status=st.status, interrupt=st.interrupt)


@router.get("/{thread_id}", response_model=RunStateResponse)
async def get_run(request: Request, thread_id: str):
    orch = _orch(request)
    st = await asyncio.to_thread(orch.get_state, thread_id)
    if st.status == "not_found":
        raise HTTPException(status_code=404, detail="Run not found")
    return st


@router.post("/{thread_id}/resume", response_model=RunStateResponse)
async def resume_run(request: Request, thread_id: str, body: RunResumeRequest):
    orch = _orch(request)
    pre = await asyncio.to_thread(orch.get_state, thread_id)
    if pre.status == "not_found":
        raise HTTPException(status_code=404, detail="Run not found")
    if pre.status != "awaiting_human":
        raise HTTPException(
            status_code=409,
            detail=f"Run is not awaiting human review (status={pre.status}).",
        )

    def _resume() -> None:
        orch.resume(thread_id, body.edited_text)

    await asyncio.to_thread(_resume)
    return await asyncio.to_thread(orch.get_state, thread_id)
