from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_transcription_model: str = "whisper-1"
    openai_org_id: str | None = None
    max_audio_upload_mb: int = 24
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    checkpoint_sqlite_path: str = str(_BACKEND_DIR / "data" / "checkpoints.db")


def get_settings() -> Settings:
    return Settings()


def parse_cors_origins(raw: str) -> list[str]:
    return [o.strip() for o in raw.split(",") if o.strip()]
