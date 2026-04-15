from __future__ import annotations

from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from app.config import Settings

CHAT_SYSTEM = """You are a careful writing assistant helping the user reshape a transcript.

Rules:
- The user will give instructions (tone, format, legal style, length, structure, etc.). Follow them as closely as you can.
- The **source transcript** in the first system block is the factual ground truth. Do not invent speakers, facts, or quotes that are not supported by it. If something is unclear, say so briefly instead of guessing.
- When the user asks for a full rewrite (e.g. memo, letter, cleaned dialogue), output the **complete** revised document in your reply, ready to copy.
- Prefer clear headings and paragraphs when the user asks for structured output.
- Stay professional; avoid meta-commentary about APIs, models, or tools."""


def _openai_messages(
    *,
    initial_transcript: str,
    history: list[dict[str, Any]],
) -> list[dict[str, str]]:
    system = (
        CHAT_SYSTEM
        + "\n\n## Source transcript\n\n"
        + initial_transcript.strip()
    )
    out: list[dict[str, str]] = [{"role": "system", "content": system}]
    for m in history:
        role = m["role"]
        if role not in ("user", "assistant"):
            continue
        out.append({"role": role, "content": m["content"]})
    return out


async def stream_assistant_tokens(
    *,
    settings: Settings,
    initial_transcript: str,
    history_rows: list[dict[str, Any]],
) -> AsyncIterator[str]:
    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        organization=settings.openai_org_id or None,
    )
    history = [{"role": r["role"], "content": r["content"]} for r in history_rows]
    messages = _openai_messages(
        initial_transcript=initial_transcript, history=history
    )
    stream = await client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        stream=True,
        temperature=settings.openai_chat_temperature,
    )
    async for chunk in stream:
        choice = chunk.choices[0] if chunk.choices else None
        if not choice or not choice.delta:
            continue
        c = choice.delta.content
        if c:
            yield c
