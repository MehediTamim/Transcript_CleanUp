import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.schemas import TranscribeResponse, TranscriptionSegment


def test_transcribe_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "")
    client = TestClient(create_app())
    r = client.post(
        "/api/transcribe/",
        files={"file": ("a.webm", b"x", "audio/webm")},
    )
    assert r.status_code == 503


def test_transcribe_empty_file(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = TestClient(create_app())
    r = client.post(
        "/api/transcribe/",
        files={"file": ("a.webm", b"", "audio/webm")},
    )
    assert r.status_code == 400


def test_transcribe_unsupported_media_type(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = TestClient(create_app())
    r = client.post(
        "/api/transcribe/",
        files={"file": ("x.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 415


def test_transcribe_success_mocked(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    def fake_transcribe(**kwargs):
        return TranscribeResponse(
            transcript="Client: hello",
            segments=[TranscriptionSegment(start=0.0, end=1.0, text="Client: hello")],
        )

    monkeypatch.setattr(
        "app.api.routes.transcribe.transcribe_audio_bytes",
        lambda **kwargs: fake_transcribe(**kwargs),
    )
    client = TestClient(create_app())
    r = client.post(
        "/api/transcribe/",
        files={"file": ("rec.webm", b"not-real-audio", "audio/webm")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["transcript"] == "Client: hello"
    assert len(data["segments"]) == 1
    assert data["segments"][0]["text"] == "Client: hello"


@pytest.fixture
def client_with_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    return TestClient(create_app())


def test_transcribe_requires_file(client_with_key):
    r = client_with_key.post("/api/transcribe/")
    assert r.status_code == 422
