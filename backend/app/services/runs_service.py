from __future__ import annotations

from typing import Any, Literal

from langgraph.types import Command

from app.models.schemas import InterruptPayload, RunStateResponse


def _interrupt_from_snapshot(st: Any) -> InterruptPayload | None:
    tasks = getattr(st, "tasks", ()) or ()
    for t in tasks:
        intrs = getattr(t, "interrupts", None) or ()
        for intr in intrs:
            val = getattr(intr, "value", None)
            if isinstance(val, dict) and "research_enriched" in val:
                return InterruptPayload(
                    stage=str(val.get("stage", "after_research")),
                    research_enriched=str(val.get("research_enriched", "")),
                )
    return None


def classify_run_status(st: Any) -> Literal["awaiting_human", "running", "completed", "not_found"]:
    values = getattr(st, "values", None) or {}
    nxt = getattr(st, "next", ()) or ()

    if _interrupt_from_snapshot(st) is not None:
        return "awaiting_human"

    if values.get("final_clean"):
        return "completed"

    if not values and not nxt:
        return "not_found"

    if nxt:
        return "running"

    if values.get("raw_transcript") and not values.get("final_clean"):
        return "running"

    return "not_found"


def snapshot_to_response(thread_id: str, st: Any) -> RunStateResponse:
    status = classify_run_status(st)
    values = dict(getattr(st, "values", None) or {})
    intr = _interrupt_from_snapshot(st) if status == "awaiting_human" else None
    return RunStateResponse(thread_id=thread_id, status=status, values=values, interrupt=intr)


class RunOrchestrator:
    def __init__(self, graph: Any):
        self.graph = graph

    def _cfg(self, thread_id: str) -> dict:
        return {"configurable": {"thread_id": thread_id}}

    def start(self, raw_transcript: str) -> tuple[str, dict]:
        import uuid

        thread_id = str(uuid.uuid4())
        out = self.graph.invoke({"raw_transcript": raw_transcript}, self._cfg(thread_id))
        return thread_id, out

    def get_state(self, thread_id: str) -> RunStateResponse:
        st = self.graph.get_state(self._cfg(thread_id))
        return snapshot_to_response(thread_id, st)

    def resume(self, thread_id: str, edited_text: str | None) -> dict:
        payload: dict[str, Any] = {}
        if edited_text is not None:
            payload["edited_text"] = edited_text
        return self.graph.invoke(Command(resume=payload), self._cfg(thread_id))
