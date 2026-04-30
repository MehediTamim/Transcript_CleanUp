from __future__ import annotations

from typing import AsyncIterator

from openai import AsyncOpenAI

from app.config import Settings

COURT_HEARING_SYSTEM = """You are a legal transcript formatter. Convert the raw speech-to-text below into a **court hearing / colloquy** transcript that matches the product’s required dialogue shape: **only the conversation**, in clearly labeled turns.

## Required output format (non-negotiable)

- Every spoken turn must begin with a **markdown-bold speaker label** and a colon, on the same line as the start of that turn, e.g. `**The Court:**`, `**Mr. Smith:**`, `**Ms. Jones:**`, `**The Witness:**`, `**The Clerk:**`, or `**Speaker:**` when the role cannot be inferred.
- Put **one speaker block per paragraph**: after each `**Label:**`, write that person’s words in normal prose (may wrap to multiple sentences in the same paragraph). Then a blank line before the next `**Label:**` block.
- Do **not** add headers, page lines, line numbers, title blocks, “TRANSCRIPT OF …”, timestamps, or any commentary — **only** labeled dialogue lines as shown below.

### Example shape (structure only; do not copy this text unless it appears in the source)

**The Court:** Please state your name for the record.

**The Witness:** Jane Doe.

**Mr. Smith:** When did you first meet the defendant?

**The Witness:** In March of last year.

## Content rules

- Infer speaker roles from context when possible; do **not** invent names, facts, or quotes not supported by the source.
- Remove filler words (um, uh, like, you know, etc.), obvious false starts, and repetitions that add no meaning.
- Remove bracketed stage directions and sound cues ([laughs], [coughs], etc.) unless legally material; when in doubt, omit.
- Remove timestamps and markers like [00:12].
- Use formal grammar and punctuation appropriate for a court record.
- Output **only** the formatted transcript — no preamble about the task."""


async def stream_court_hearing_transcript(
    *,
    settings: Settings,
    raw_transcript: str,
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        organization=settings.openai_org_id or None,
    )
    stream = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": COURT_HEARING_SYSTEM},
            {
                "role": "user",
                "content": "Raw transcript to format:\n\n" + raw_transcript.strip(),
            },
        ],
        stream=True,
        temperature=temperature,
    )
    async for chunk in stream:
        choice = chunk.choices[0] if chunk.choices else None
        if not choice or not choice.delta:
            continue
        c = choice.delta.content
        if c:
            yield c
