from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class RunCreateRequest(BaseModel):
    raw_transcript: str = Field(..., min_length=1, description="Messy transcript text")

    @field_validator("raw_transcript", mode="before")
    @classmethod
    def strip_raw_transcript(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class RunResumeRequest(BaseModel):
    edited_text: str | None = Field(
        default=None,
        description="Human-edited text after research; omit or null to accept research output as-is",
    )


class InterruptPayload(BaseModel):
    stage: str
    research_enriched: str


class RunStateResponse(BaseModel):
    thread_id: str
    status: Literal["awaiting_human", "running", "completed", "not_found"]
    values: dict[str, Any] = Field(default_factory=dict)
    interrupt: InterruptPayload | None = None


class RunCreateResponse(BaseModel):
    thread_id: str
    status: Literal["awaiting_human", "running", "completed", "not_found"]
    interrupt: InterruptPayload | None = None


class TranscriptionSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    transcript: str
    segments: list[TranscriptionSegment] = Field(default_factory=list)
