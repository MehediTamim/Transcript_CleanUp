from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from app.config import Settings
from app.graph.state import GraphState

RESEARCH_SYSTEM = """You are the Research agent for legal/meeting transcripts.
- Infer or normalize speaker roles (e.g. Client, Lawyer) when obvious from labels or context.
- Expand obvious acronyms once in-line where helpful; keep speaker prefixes consistent.
- Do NOT remove filler words, timestamps, or bracketed stage directions yet — the Cleanup agent does that.
- Preserve all substantive dialogue; output only the enriched transcript text (no preamble)."""


CLEANUP_SYSTEM = """You are the Cleanup agent. Output ONLY the cleaned conversation — nothing else.

Rules (non-negotiable):
- Remove filler words (um, uh, ah, like, you know, so, actually, basically, etc.).
- Remove repetitions and stutters.
- Remove bracketed stage directions and sound cues ([laughs], [coughs], etc.).
- Remove timestamps and technical markers like [00:12].
- Remove greetings, goodbyes, and irrelevant small talk.
- Fix grammar, punctuation, and sentence structure; keep tone professional.
- Label each turn with clear speaker lines, e.g. "Client:" and "Lawyer:" (markdown bold optional: **Client:**).
- No metadata, notes, or commentary before or after the dialogue."""


def _research_node(model: ChatOpenAI):
    def research(state: GraphState) -> dict:
        raw = state.get("raw_transcript", "")
        resp = model.invoke(
            [
                SystemMessage(content=RESEARCH_SYSTEM),
                HumanMessage(content=raw),
            ]
        )
        text = (resp.content or "").strip()
        return {"research_enriched": text}

    return research


def _human_node():
    def human_review(state: GraphState) -> dict:
        resume_payload = interrupt(
            {
                "stage": "after_research",
                "research_enriched": state.get("research_enriched", ""),
            }
        )
        base = state.get("research_enriched", "")
        if isinstance(resume_payload, dict) and "edited_text" in resume_payload:
            raw_edit = resume_payload.get("edited_text")
            if raw_edit is not None and str(raw_edit).strip():
                chosen = str(raw_edit).strip()
            else:
                chosen = base
        else:
            chosen = base
        return {"human_edited": chosen}

    return human_review


def _cleanup_node(model: ChatOpenAI):
    def cleanup(state: GraphState) -> dict:
        body = state.get("human_edited") or state.get("research_enriched", "")
        resp = model.invoke(
            [
                SystemMessage(content=CLEANUP_SYSTEM),
                HumanMessage(
                    content="Enriched transcript (edit if needed before final cleanup):\n\n" + body
                ),
            ]
        )
        text = (resp.content or "").strip()
        return {"final_clean": text}

    return cleanup


def build_graph(settings: Settings, checkpointer):
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    model = ChatOpenAI(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        organization=settings.openai_org_id or None,
        temperature=0.2,
    )

    g = StateGraph(GraphState)
    g.add_node("research", _research_node(model))
    g.add_node("human_review", _human_node())
    g.add_node("cleanup", _cleanup_node(model))
    g.add_edge(START, "research")
    g.add_edge("research", "human_review")
    g.add_edge("human_review", "cleanup")
    g.add_edge("cleanup", END)
    return g.compile(checkpointer=checkpointer)
