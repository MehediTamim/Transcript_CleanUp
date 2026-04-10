from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.config import get_settings
from app.models.schemas import TranscribeResponse
from app.services.transcribe_service import transcribe_audio_bytes

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

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
        raise HTTPException(
            status_code=503,
            detail="Transcription unavailable: OPENAI_API_KEY is not set.",
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
    try:
        return transcribe_audio_bytes(
            settings=settings,
            filename=name,
            content=content,
            language=language,
        )
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Transcription failed: {e!s}",
        ) from e
