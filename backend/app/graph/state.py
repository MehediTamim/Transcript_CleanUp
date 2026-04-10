from typing_extensions import TypedDict


class GraphState(TypedDict, total=False):
    """Shared LangGraph state for Research → HITL → Cleanup."""

    raw_transcript: str
    research_enriched: str
    human_edited: str
    final_clean: str
