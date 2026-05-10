import logging

import sentry_sdk
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.config import get_settings
from app.models.schemas import TranscribeResponse
from app.services.transcribe_service import UnsupportedFormatError, transcribe_audio_bytes

router = APIRouter(prefix="/transcribe", tags=["transcribe"])
logger = logging.getLogger(__name__)

def _allowed_media_type(content_type: str | None) -> bool:
    if not content_type:
        return True
    base = content_type.split(";")[0].strip().lower()
    if base.startswith("audio/"):
        return True
    if base in ("video/webm", "application/ogg"):
        return True
    return False


def _guess_filename(upload: UploadFile) -> str:
    name = upload.filename or "audio.webm"
    return name.split("/")[-1] or "audio.webm"


@router.post("/", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file (e.g. webm, mp3, wav, m4a)"),
    language: str | None = Query(
        default=None,
        description="Optional ISO-639-1 language hint (e.g. en) for the speech API",
    ),
):
    settings = get_settings()
    if not settings.openai_api_key:
        logger.error("transcribe route: OPENAI_API_KEY is not set — request rejected")
        raise HTTPException(
            status_code=503,
            detail="Transcription unavailable: OPENAI_API_KEY is not set.",
        )

    if not _allowed_media_type(file.content_type):
        logger.warning(
            "transcribe route: unsupported media type",
            extra={"content_type": file.content_type, "filename": file.filename},
        )
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type or 'unknown'}",
        )

    content = await file.read()
    if not content:
        logger.warning("transcribe route: empty file received", extra={"filename": file.filename})
        raise HTTPException(status_code=400, detail="Empty file")

    name = _guess_filename(file)
    size_mb = round(len(content) / (1024 * 1024), 2)
    logger.info(
        "transcribe route: request accepted",
        extra={"filename": name, "size_mb": size_mb, "content_type": file.content_type, "language": language},
    )
    sentry_sdk.add_breadcrumb(
        category="transcribe_route",
        message=f"Upload accepted — {name} ({size_mb} MB)",
        level="info",
    )

    try:
        result = transcribe_audio_bytes(
            settings=settings,
            filename=name,
            content=content,
            language=language,
        )
        logger.info(
            "transcribe route: success",
            extra={"filename": name, "text_chars": len(result.transcript or "")},
        )
        return result
    except UnsupportedFormatError as e:
        logger.warning("transcribe route: unsupported format", extra={"filename": name, "error": str(e)})
        raise HTTPException(status_code=415, detail=str(e)) from e
    except ValueError as e:
        logger.warning("transcribe route: file too large", extra={"filename": name, "error": str(e)})
        raise HTTPException(status_code=413, detail=str(e)) from e
    except RuntimeError as e:
        logger.error("transcribe route: runtime error", extra={"filename": name, "error": str(e)})
        sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.error("transcribe route: unexpected error", extra={"filename": name, "error": str(e)})
        sentry_sdk.capture_exception(e)
        raise HTTPException(
            status_code=502,
            detail=f"Transcription failed: {e!s}",
        ) from e
