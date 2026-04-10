from fastapi.testclient import TestClient

from app.main import create_app


def test_create_run_without_openai_key_returns_503(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "")
    client = TestClient(create_app())
    r = client.post("/api/runs", json={"raw_transcript": "hello"})
    assert r.status_code == 503
