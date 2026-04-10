# AI Transcript Cleanup Tool

FastAPI backend (OpenAI speech-to-text, then LangGraph: Research → human-in-the-loop → Cleanup) and a Vite + React + Tailwind frontend. See [project_requirement.md](project_requirement.md) for product rules.

## Security and compliance (short)

- **API key:** Set `OPENAI_API_KEY` only on the **server** (e.g. `backend/.env`). Never put it in the frontend or in client-side env vars that ship to the browser.
- **Zero data retention:** Configure your OpenAI organization / project for the retention policy your legal review requires ([OpenAI data usage](https://platform.openai.com/docs/guides/your-data)).
- **In transit:** Terminate **TLS 1.3** (or modern TLS) at your reverse proxy or platform in front of FastAPI.
- **At rest:** Checkpoint SQLite and any future databases should live on **encrypted volumes** (e.g. AES-256 at the disk or cloud volume layer). This repo does not implement application-level encryption of transcript payloads by default.

## How to run

Python 3.12+ recommended.

```bash
cd /home/dev/project/P_projects/transcript_cleaner_tool
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# edit backend/.env — add OPENAI_API_KEY

# terminal 1 — API (working directory must be backend for imports)
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

# terminal 2 — UI
cd frontend && npm install && npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Copy `frontend/.env.example` to `frontend/.env` and set **`AI_BASE_URL`** to your API origin (e.g. `http://127.0.0.1:8001` if uvicorn listens on port 8001). If unset, the dev server proxies `/api` to `http://127.0.0.1:8001` (see `frontend/vite.config.ts`). You can use **`VITE_API_URL`** instead; `AI_BASE_URL` wins when both are set.

In the UI you can **upload an audio file** or **record from the microphone**, then **Transcribe to text** (fills the editor) or **Transcribe & run cleanup** (transcribe then start the same pipeline as pasted text).

## API

- `GET /api/health` — liveness
- `POST /api/runs` — body `{"raw_transcript": "..."}`; returns `thread_id`, pauses at human review when research finishes
- `GET /api/runs/{thread_id}` — status and values
- `POST /api/runs/{thread_id}/resume` — body `{"edited_text": "..."}` or `{}` / `{"edited_text": null}` to accept research output unchanged
- `POST /api/transcribe/` — multipart form field `file` (audio). Uses OpenAI (`OPENAI_TRANSCRIPTION_MODEL`, default `whisper-1`). Optional query `language` (e.g. `en`). Returns JSON `{ "transcript": "...", "segments": [ { "start", "end", "text" } ] }` when the API supports verbose segments.

## Tests

```bash
cd backend && python -m pytest tests -q
```

## Phase 2 (optional)

- **Word-level timestamps** in the editor and **click word → play audio** (today: segment-level timestamps from Whisper when supported).
- **Deepgram** or other providers as an alternative to OpenAI-only transcription.
- **Real-time collaboration** (e.g. CRDT + WebSocket) if multiple editors are required.
