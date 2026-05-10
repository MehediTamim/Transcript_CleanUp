from __future__ import annotations

import asyncio
import json
import logging

import sentry_sdk
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sentry_sdk import logger as sentry_logger

from app.api.routes.transcribe import _allowed_media_type, _guess_filename
from app.config import get_settings
from app.services.audio_chunker import split_audio_to_chunks
from app.services.court_transcript_stream import stream_court_hearing_transcript
from app.services.transcribe_service import UnsupportedFormatError, transcribe_audio_bytes

router = APIRouter(prefix="/v2", tags=["v2-chunked"])
logger = logging.getLogger(__name__)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/audio-chunked/stream")
async def audio_chunked_stream(
    file: UploadFile = File(..., description="Audio file — any size, any duration"),
    language: str | None = Query(
        default=None,
        description="Optional ISO-639-1 language hint (e.g. en)",
    ),
):
    settings = get_settings()

    if not settings.openai_api_key:
        logger.error("chunked_pipeline: OPENAI_API_KEY is not set — request rejected")
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not set.")

    if not _allowed_media_type(file.content_type):
        logger.warning(
            "chunked_pipeline: unsupported media type",
            extra={"content_type": file.content_type, "filename": file.filename},
        )
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type or 'unknown'}",
        )

    content = await file.read()
    if not content:
        logger.warning("chunked_pipeline: empty file received", extra={"filename": file.filename})
        raise HTTPException(status_code=400, detail="Empty file")

    max_bytes = settings.max_chunked_upload_mb * 1024 * 1024
    size_mb = round(len(content) / (1024 * 1024), 2)

    if len(content) > max_bytes:
        logger.warning(
            "chunked_pipeline: file too large",
            extra={"filename": file.filename, "size_mb": size_mb, "limit_mb": settings.max_chunked_upload_mb},
        )
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.max_chunked_upload_mb} MB limit",
        )

    name = _guess_filename(file)
    logger.info(
        "chunked_pipeline: request accepted",
        extra={"filename": name, "size_mb": size_mb, "content_type": file.content_type, "language": language},
    )
    sentry_sdk.add_breadcrumb(
        category="chunked_pipeline",
        message=f"Upload accepted — {name} ({size_mb} MB, {file.content_type})",
        level="info",
        data={"language": language},
    )

    async def event_gen():
        # ── 1. Split ──────────────────────────────────────────────────────────
        yield _sse({"stage": "splitting"})
        sentry_sdk.add_breadcrumb(category="chunked_pipeline", message="Stage: splitting", level="info")

        try:
            chunks = await asyncio.to_thread(
                split_audio_to_chunks,
                content,
                name,
                settings.chunk_duration_s,
            )
        except Exception as e:
            logger.error(
                "chunked_pipeline: splitting failed",
                extra={"filename": name, "error": str(e)},
            )
            sentry_sdk.capture_exception(e)
            yield _sse({"error": f"Splitting failed: {e!s}"})
            return

        total = len(chunks)
        logger.info("chunked_pipeline: split complete", extra={"filename": name, "total_chunks": total})
        yield _sse({"total_chunks": total})

        # ── 2. Transcribe all chunks in parallel, emit in serial order ────────
        sentry_sdk.add_breadcrumb(
            category="chunked_pipeline",
            message=f"Stage: transcribing ({total} chunks)",
            level="info",
        )
        sem = asyncio.Semaphore(settings.max_parallel_chunks)

        async def transcribe_one(idx: int, chunk_bytes: bytes, chunk_name: str) -> tuple[int, str]:
            async with sem:
                def _run() -> str:
                    tr = transcribe_audio_bytes(
                        settings=settings,
                        filename=chunk_name,
                        content=chunk_bytes,
                        language=language,
                    )
                    text = (tr.transcript or "").strip()
                    if not text and tr.segments:
                        text = " ".join(s.text for s in tr.segments if s.text).strip()
                    return text

                return idx, await asyncio.to_thread(_run)

        tasks = [
            asyncio.create_task(transcribe_one(idx, chunk_bytes, chunk_name))
            for idx, chunk_bytes, chunk_name in chunks
        ]

        results: dict[int, str] = {}
        full_parts: list[str] = [""] * total
        next_emit = 0

        try:
            for fut in asyncio.as_completed(tasks):
                idx, text = await fut
                results[idx] = text
                while next_emit in results:
                    chunk_text = results.pop(next_emit)
                    full_parts[next_emit] = chunk_text
                    sentry_logger.info(
                        "Chunk transcribed",
                        attributes={"filename": name, "chunk_idx": next_emit, "total": total, "chars": len(chunk_text)},
                    )
                    yield _sse({"chunk_done": next_emit, "total": total, "text": chunk_text})
                    next_emit += 1
        except UnsupportedFormatError as e:
            for t in tasks:
                t.cancel()
            logger.warning(
                "chunked_pipeline: unsupported format",
                extra={"filename": name, "error": str(e)},
            )
            yield _sse({"error": str(e)})
            return
        except Exception as e:
            for t in tasks:
                t.cancel()
            logger.error(
                "chunked_pipeline: transcription failed",
                extra={"filename": name, "error": str(e), "chunks_done": next_emit, "total": total},
            )
            sentry_sdk.capture_exception(e)
            yield _sse({"error": f"Transcription failed: {e!s}"})
            return

        full_transcript = "\n\n".join(p for p in full_parts if p).strip()
        if not full_transcript:
            logger.warning("chunked_pipeline: no speech detected", extra={"filename": name})
            sentry_sdk.capture_message(
                f"No speech detected in uploaded file: {name}",
                level="warning",
            )
            yield _sse({"error": "No speech detected in the audio."})
            return

        logger.info(
            "chunked_pipeline: all chunks transcribed",
            extra={"filename": name, "total_chars": len(full_transcript)},
        )

        # ── 3. Format as court transcript (auto, no button needed) ───────────
        yield _sse({"stage": "formatting"})
        sentry_sdk.add_breadcrumb(
            category="chunked_pipeline",
            message="Stage: formatting court transcript",
            level="info",
        )

        try:
            async for token in stream_court_hearing_transcript(
                settings=settings,
                raw_transcript=full_transcript,
            ):
                yield _sse({"delta": token})
            sentry_logger.info(
                "Pipeline complete",
                attributes={"filename": name, "total_chunks": total},
            )
            yield _sse({"done": True})
        except Exception as e:
            logger.error(
                "chunked_pipeline: formatting failed",
                extra={"filename": name, "error": str(e)},
            )
            sentry_sdk.capture_exception(e)
            yield _sse({"error": str(e)})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
