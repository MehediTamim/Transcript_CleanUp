from __future__ import annotations

import io
from typing import Any

from openai import APIError, OpenAI

from app.config import Settings
from app.models.schemas import TranscribeResponse, TranscriptionSegment


def _segments_from_verbose(tr: Any) -> list[TranscriptionSegment]:
    out: list[TranscriptionSegment] = []
    raw = getattr(tr, "segments", None) or []
    for seg in raw:
        try:
            out.append(
                TranscriptionSegment(
                    start=float(getattr(seg, "start", 0.0)),
                    end=float(getattr(seg, "end", 0.0)),
                    text=str(getattr(seg, "text", "")).strip(),
                )
            )
        except (TypeError, ValueError):
            continue
    return out


def transcribe_audio_bytes(
    *,
    settings: Settings,
    filename: str,
    content: bytes,
    language: str | None = None,
) -> TranscribeResponse:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    max_bytes = max(1, settings.max_audio_upload_mb) * 1024 * 1024
    if len(content) > max_bytes:
        raise ValueError(f"Audio exceeds max size ({settings.max_audio_upload_mb} MB)")

    client = OpenAI(
        api_key=settings.openai_api_key,
        organization=settings.openai_org_id or None,
    )

    buf = io.BytesIO(content)
    buf.name = filename or "audio.webm"

    kwargs: dict[str, Any] = {
        "model": settings.openai_transcription_model,
        "file": buf,
    }
    if language:
        kwargs["language"] = language

    try:
        tr = client.audio.transcriptions.create(
            **kwargs,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    except APIError:
        buf2 = io.BytesIO(content)
        buf2.name = filename or "audio.webm"
        kwargs["file"] = buf2
        tr = client.audio.transcriptions.create(**kwargs, response_format="json")

    segments = _segments_from_verbose(tr) if hasattr(tr, "segments") else []
    text = (getattr(tr, "text", None) or "").strip()
    if not text and segments:
        text = " ".join(s.text for s in segments if s.text).strip()
    return TranscribeResponse(transcript=text, segments=segments)
