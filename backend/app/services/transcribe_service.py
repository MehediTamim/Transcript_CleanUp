from __future__ import annotations

import io
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import sentry_sdk
from openai import APIError, OpenAI

from app.config import Settings
from app.models.schemas import TranscribeResponse, TranscriptionSegment

logger = logging.getLogger(__name__)

# Extensions Whisper accepts natively — anything else gets converted to WAV first.
_WHISPER_NATIVE = {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg", "flac"}


class UnsupportedFormatError(ValueError):
    """Raised when a file extension is not Whisper-native and cannot be converted."""


def _to_whisper_compatible(content: bytes, filename: str) -> tuple[bytes, str]:
    """Convert to WAV via ffmpeg if the extension isn't natively supported by Whisper.

    Raises UnsupportedFormatError if conversion is impossible so the caller can
    surface a clear error to the user instead of passing an unreadable file to Whisper.
    """
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext in _WHISPER_NATIVE:
        return content, filename

    if not shutil.which("ffmpeg"):
        err = UnsupportedFormatError(
            f"Unsupported audio format: .{ext} — "
            "ffmpeg is not installed so it cannot be converted. "
            "Please upload MP3, WAV, M4A, WebM, OGG, FLAC, or AAC."
        )
        logger.error(
            "transcribe: unsupported extension and ffmpeg not available",
            extra={"filename": filename, "ext": ext},
        )
        sentry_sdk.capture_exception(err)
        raise err

    logger.info(
        "transcribe: converting unsupported extension to WAV",
        extra={"filename": filename, "ext": ext},
    )
    sentry_sdk.add_breadcrumb(
        category="transcribe",
        message=f"ffmpeg converting .{ext} → .wav before Whisper",
        level="info",
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        in_path = tmp / f"input.{ext or 'audio'}"
        in_path.write_bytes(content)
        out_path = tmp / "converted.wav"

        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(in_path), str(out_path)],
            capture_output=True,
            timeout=120,
        )

        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace")[-400:]
            err = UnsupportedFormatError(
                f"Unsupported audio format: .{ext} could not be converted. "
                "Please upload MP3, WAV, M4A, WebM, OGG, FLAC, or AAC."
            )
            logger.error(
                "transcribe: ffmpeg conversion failed",
                extra={"filename": filename, "ext": ext, "stderr_tail": stderr},
            )
            sentry_sdk.capture_exception(err)
            raise err

        wav_bytes = out_path.read_bytes()
        wav_name = Path(filename).stem + ".wav"
        logger.info(
            "transcribe: conversion success",
            extra={"original": filename, "converted": wav_name, "size_mb": round(len(wav_bytes) / (1024 * 1024), 2)},
        )
        return wav_bytes, wav_name


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
        err = RuntimeError("OPENAI_API_KEY is not set")
        logger.error("transcribe: OPENAI_API_KEY is not configured")
        sentry_sdk.capture_exception(err)
        raise err

    content, filename = _to_whisper_compatible(content, filename)

    max_bytes = max(1, settings.max_audio_upload_mb) * 1024 * 1024
    size_mb = round(len(content) / (1024 * 1024), 2)

    if len(content) > max_bytes:
        err = ValueError(f"Audio exceeds max size ({settings.max_audio_upload_mb} MB)")
        logger.warning(
            "transcribe: file too large",
            extra={"filename": filename, "size_mb": size_mb, "limit_mb": settings.max_audio_upload_mb},
        )
        raise err

    logger.info(
        "transcribe: calling Whisper API",
        extra={"filename": filename, "size_mb": size_mb, "language": language, "model": settings.openai_transcription_model},
    )
    sentry_sdk.add_breadcrumb(
        category="transcribe",
        message=f"Whisper API call — {filename} ({size_mb} MB)",
        level="info",
        data={"language": language, "model": settings.openai_transcription_model},
    )

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
    except APIError as api_err:
        logger.warning(
            "transcribe: verbose_json failed, retrying with json",
            extra={"filename": filename, "api_error": str(api_err)},
        )
        sentry_sdk.add_breadcrumb(
            category="transcribe",
            message=f"verbose_json rejected ({api_err}), retrying with json",
            level="warning",
        )
        buf2 = io.BytesIO(content)
        buf2.name = filename or "audio.webm"
        kwargs["file"] = buf2
        try:
            tr = client.audio.transcriptions.create(**kwargs, response_format="json")
        except Exception as e:
            logger.error(
                "transcribe: json fallback also failed",
                extra={"filename": filename, "error": str(e)},
            )
            sentry_sdk.capture_exception(e)
            raise
    except Exception as e:
        logger.error(
            "transcribe: unexpected error calling Whisper API",
            extra={"filename": filename, "error": str(e)},
        )
        sentry_sdk.capture_exception(e)
        raise

    segments = _segments_from_verbose(tr) if hasattr(tr, "segments") else []
    text = (getattr(tr, "text", None) or "").strip()
    if not text and segments:
        text = " ".join(s.text for s in segments if s.text).strip()

    logger.info(
        "transcribe: success",
        extra={"filename": filename, "text_chars": len(text), "segment_count": len(segments)},
    )
    sentry_sdk.add_breadcrumb(
        category="transcribe",
        message=f"Transcription done — {len(text)} chars, {len(segments)} segments",
        level="info",
    )
    return TranscribeResponse(transcript=text, segments=segments)
