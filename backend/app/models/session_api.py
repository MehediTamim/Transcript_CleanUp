from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class SessionCreateRequest(BaseModel):
    initial_transcript: str = Field(..., min_length=1)

    @field_validator("initial_transcript", mode="before")
    @classmethod
    def strip_t(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class SessionCreateResponse(BaseModel):
    session_id: str


class ChatMessageItem(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class SessionDetailResponse(BaseModel):
    session_id: str
    status: str
    initial_transcript: str
    finalized_content: str | None
    created_at: str
    messages: list[ChatMessageItem]


class MessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1)

    @field_validator("content", mode="before")
    @classmethod
    def strip_c(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class FinalizeRequest(BaseModel):
    content: str | None = Field(
        default=None,
        description="Override final text; if omitted, last assistant message is used",
    )

    @field_validator("content", mode="before")
    @classmethod
    def strip_f(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v


class FinalizeResponse(BaseModel):
    final_content: str
