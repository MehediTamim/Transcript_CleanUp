from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.api.routes.transcribe import _allowed_media_type, _guess_filename
from app.config import get_settings
from app.models.schemas import TranscribeResponse
from app.services.court_transcript_stream import stream_court_hearing_transcript
from app.services.transcribe_service import transcribe_audio_bytes

router = APIRouter(prefix="/v2", tags=["v2"])


def _transcript_from_response(tr: TranscribeResponse) -> str:
    direct = (tr.transcript or "").strip()
    if direct:
        return direct
    return (
        " ".join(s.text.strip() for s in (tr.segments or []) if s.text)
        .strip()
    )


@router.post("/audio-to-court/stream")
async def audio_to_court_stream(
    file: UploadFile = File(..., description="Audio file (e.g. webm, mp3, wav, m4a)"),
    language: str | None = Query(
        default=None,
        description="Optional ISO-639-1 language hint (e.g. en) for the speech API",
    ),
):
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Pipeline unavailable: OPENAI_API_KEY is not set.",
        )

    if not _allowed_media_type(file.content_type):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type or 'unknown'}",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    name = _guess_filename(file)

    async def event_gen():
        yield f"data: {json.dumps({'stage': 'transcribing'})}\n\n"

        def _do_transcribe():
            return transcribe_audio_bytes(
                settings=settings,
                filename=name,
                content=content,
                language=language,
            )

        try:
            tr = await asyncio.to_thread(_do_transcribe)
        except ValueError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return
        except RuntimeError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Transcription failed: {e!s}'})}\n\n"
            return

        raw_text = _transcript_from_response(tr)
        if not raw_text:
            yield f"data: {json.dumps({'error': 'No speech detected in the audio.'})}\n\n"
            return

        yield f"data: {json.dumps({'stage': 'formatting'})}\n\n"

        try:
            async for token in stream_court_hearing_transcript(
                settings=settings,
                raw_transcript=raw_text,
            ):
                yield f"data: {json.dumps({'delta': token})}\n\n"
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
