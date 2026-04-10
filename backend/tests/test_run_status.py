from types import SimpleNamespace

from app.services.runs_service import classify_run_status


def test_classify_not_found_empty():
    st = SimpleNamespace(values={}, next=(), tasks=())
    assert classify_run_status(st) == "not_found"


def test_classify_awaiting_human_interrupt():
    intr = SimpleNamespace(value={"stage": "after_research", "research_enriched": "x"})
    task = SimpleNamespace(interrupts=(intr,))
    st = SimpleNamespace(values={"research_enriched": "x"}, next=("human_review",), tasks=(task,))
    assert classify_run_status(st) == "awaiting_human"


def test_classify_completed():
    st = SimpleNamespace(
        values={"final_clean": "Client: Hi."},
        next=(),
        tasks=(),
    )
    assert classify_run_status(st) == "completed"
