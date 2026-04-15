from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.db.session_store import SessionStore
from app.models.session_api import (
    ChatMessageItem,
    FinalizeRequest,
    FinalizeResponse,
    MessageCreateRequest,
    SessionCreateRequest,
    SessionCreateResponse,
    SessionDetailResponse,
)
from app.services.chat_stream import stream_assistant_tokens

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _store(request: Request) -> SessionStore:
    path = getattr(request.app.state, "session_sqlite_path", None)
    if not path:
        raise HTTPException(status_code=500, detail="Session store not configured.")
    return SessionStore(path)


def _require_key() -> None:
    if not get_settings().openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Chat is unavailable until the service is configured.",
        )


@router.post("", response_model=SessionCreateResponse)
def create_session(request: Request, body: SessionCreateRequest):
    store = _store(request)
    sid = store.create_session(body.initial_transcript)
    return SessionCreateResponse(session_id=sid)


@router.get("/{session_id}", response_model=SessionDetailResponse)
def get_session(request: Request, session_id: str):
    store = _store(request)
    row = store.get_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    msgs = store.list_messages(session_id)
    return SessionDetailResponse(
        session_id=row["id"],
        status=row["status"],
        initial_transcript=row["initial_transcript"],
        finalized_content=row["finalized_content"],
        created_at=row["created_at"],
        messages=[
            ChatMessageItem(
                id=m["id"], role=m["role"], content=m["content"], created_at=m["created_at"]
            )
            for m in msgs
            if m["role"] in ("user", "assistant")
        ],
    )


@router.post("/{session_id}/messages")
async def append_message_stream(request: Request, session_id: str, body: MessageCreateRequest):
    _require_key()
    settings = get_settings()
    store = _store(request)
    row = store.get_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    if row["status"] == "finalized":
        raise HTTPException(
            status_code=409,
            detail="This session is already finalized. Start a new one to keep chatting.",
        )

    async def event_gen():
        def add_user() -> None:
            store.add_message(session_id, "user", body.content)

        await asyncio.to_thread(add_user)
        history = await asyncio.to_thread(store.list_messages, session_id)
        parts: list[str] = []
        try:
            async for token in stream_assistant_tokens(
                settings=settings,
                initial_transcript=row["initial_transcript"],
                history_rows=history,
            ):
                parts.append(token)
                yield f"data: {json.dumps({'delta': token})}\n\n"
            assistant_text = "".join(parts)

            def save_assistant() -> None:
                store.add_message(session_id, "assistant", assistant_text)

            await asyncio.to_thread(save_assistant)
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/finalize", response_model=FinalizeResponse)
def finalize_session(
    request: Request,
    session_id: str,
    body: FinalizeRequest | None = Body(default=None),
):
    store = _store(request)
    row = store.get_session(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found.")
    b = body or FinalizeRequest()
    override = b.content
    if override is not None and override.strip():
        content = override.strip()
    else:
        content = store.get_last_assistant_content(session_id)
    if not content:
        raise HTTPException(
            status_code=400,
            detail="There is no assistant reply to finalize yet. Send a message first.",
        )
    store.finalize(session_id, content)
    return FinalizeResponse(final_content=content)
