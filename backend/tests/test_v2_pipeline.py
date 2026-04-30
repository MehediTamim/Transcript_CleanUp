import pytest
from fastapi.testclient import TestClient

import app.api.routes.v2_pipeline as v2_mod
from app.main import create_app
from app.models.schemas import TranscribeResponse


def test_v2_stream_requires_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "")
    client = TestClient(create_app())
    r = client.post(
        "/api/v2/audio-to-court/stream",
        files={"file": ("a.webm", b"x", "audio/webm")},
    )
    assert r.status_code == 503


@pytest.fixture
def client_with_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    return TestClient(create_app())


def test_v2_stream_empty_file(client_with_key):
    r = client_with_key.post(
        "/api/v2/audio-to-court/stream",
        files={"file": ("a.webm", b"", "audio/webm")},
    )
    assert r.status_code == 400


def test_v2_stream_unsupported_media(client_with_key):
    r = client_with_key.post(
        "/api/v2/audio-to-court/stream",
        files={"file": ("x.txt", b"hi", "text/plain")},
    )
    assert r.status_code == 415


def test_v2_stream_happy_path_mocked(client_with_key, monkeypatch):
    def fake_transcribe(**kwargs):
        return TranscribeResponse(transcript="Witness: hello there", segments=[])

    async def fake_stream(**kwargs):
        yield "**The Court:** Good morning.\n\n"
        yield "**The Witness:** Hello."

    monkeypatch.setattr(v2_mod, "transcribe_audio_bytes", lambda **kw: fake_transcribe(**kw))
    monkeypatch.setattr(v2_mod, "stream_court_hearing_transcript", fake_stream)

    resp = client_with_key.post(
        "/api/v2/audio-to-court/stream",
        files={"file": ("rec.webm", b"fake", "audio/webm")},
    )
    assert resp.status_code == 200
    body = resp.text
    assert "transcribing" in body
    assert "formatting" in body
    assert "The Court" in body or "delta" in body
    assert "done" in body
    assert "**The Witness:** Hello." in body or "Witness" in body
