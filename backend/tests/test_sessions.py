import pytest
from fastapi.testclient import TestClient

import app.api.routes.sessions as sessions_route
from app.main import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


def test_create_and_get_session(client):
    r = client.post("/api/sessions", json={"initial_transcript": "  hello world  "})
    assert r.status_code == 200
    sid = r.json()["session_id"]
    g = client.get(f"/api/sessions/{sid}")
    assert g.status_code == 200
    data = g.json()
    assert data["initial_transcript"] == "hello world"
    assert data["messages"] == []


def test_create_session_empty_body(client):
    r = client.post("/api/sessions", json={"initial_transcript": ""})
    assert r.status_code == 422


def test_get_unknown_session(client):
    assert client.get("/api/sessions/00000000-0000-0000-0000-000000000000").status_code == 404


def test_finalize_without_assistant(client):
    r = client.post("/api/sessions", json={"initial_transcript": "only source"})
    sid = r.json()["session_id"]
    f = client.post(f"/api/sessions/{sid}/finalize", json={})
    assert f.status_code == 400


def test_message_stream_then_finalize(client, monkeypatch):
    async def fake_stream(**kwargs):
        yield "Draft "
        yield "done."

    monkeypatch.setattr(sessions_route, "stream_assistant_tokens", fake_stream)

    r = client.post("/api/sessions", json={"initial_transcript": "Speaker A: hi"})
    sid = r.json()["session_id"]

    resp = client.post(
        f"/api/sessions/{sid}/messages",
        json={"content": "Make it one line."},
    )
    assert resp.status_code == 200
    assert "done" in resp.text
    assert "Draft" in resp.text

    g = client.get(f"/api/sessions/{sid}")
    roles = [m["role"] for m in g.json()["messages"]]
    assert roles == ["user", "assistant"]
    assert g.json()["messages"][1]["content"] == "Draft done."

    fin = client.post(f"/api/sessions/{sid}/finalize", json={})
    assert fin.status_code == 200
    assert fin.json()["final_content"] == "Draft done."

    g2 = client.get(f"/api/sessions/{sid}")
    assert g2.json()["status"] == "finalized"
    assert g2.json()["finalized_content"] == "Draft done."


def test_finalize_with_override(client, monkeypatch):
    async def fake_stream(**kwargs):
        yield "A"

    monkeypatch.setattr(sessions_route, "stream_assistant_tokens", fake_stream)
    r = client.post("/api/sessions", json={"initial_transcript": "x"})
    sid = r.json()["session_id"]
    client.post(f"/api/sessions/{sid}/messages", json={"content": "go"})
    fin = client.post(
        f"/api/sessions/{sid}/finalize",
        json={"content": "  Custom final  "},
    )
    assert fin.status_code == 200
    assert fin.json()["final_content"] == "Custom final"


def test_message_after_finalized(client, monkeypatch):
    async def fake_stream(**kwargs):
        yield "x"

    monkeypatch.setattr(sessions_route, "stream_assistant_tokens", fake_stream)
    r = client.post("/api/sessions", json={"initial_transcript": "y"})
    sid = r.json()["session_id"]
    client.post(f"/api/sessions/{sid}/messages", json={"content": "z"})
    client.post(f"/api/sessions/{sid}/finalize", json={})
    r2 = client.post(f"/api/sessions/{sid}/messages", json={"content": "more"})
    assert r2.status_code == 409
