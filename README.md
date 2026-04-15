# AI Transcript Cleanup Tool

FastAPI backend and Vite + React + Tailwind frontend. **Main flow:** transcribe audio (or paste text) → **chat** with streamed assistant replies (natural-language instructions) → **finalize** and copy/download. A **legacy** LangGraph path (`/api/runs`: Research → human gate → Cleanup) remains for a one-shot “quick pass.” See [project_requirement.md](project_requirement.md) for product rules.

## Security and compliance (short)

- **API key:** Set `OPENAI_API_KEY` only on the **server** (e.g. `backend/.env`). Never put it in the frontend or in client-side env vars that ship to the browser.
- **Zero data retention:** Configure your OpenAI organization / project for the retention policy your legal review requires ([OpenAI data usage](https://platform.openai.com/docs/guides/your-data)).
- **In transit:** Terminate **TLS 1.3** (or modern TLS) at your reverse proxy or platform in front of FastAPI.
- **At rest:** SQLite files (`checkpoints.db`, `sessions.db`) should live on **encrypted volumes** in production. This repo does not implement application-level encryption of transcript payloads by default.

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
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# terminal 2 — UI
cd frontend && npm install && npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Copy `frontend/.env.example` to `frontend/.env` and set **`AI_BASE_URL`** to your API origin (e.g. `http://127.0.0.1:8000`). If unset, the dev server proxies `/api` to `http://127.0.0.1:8000` (see `frontend/vite.config.ts`). You can use **`VITE_API_URL`** instead; `AI_BASE_URL` wins when both are set.

In the UI: **transcribe** into the transcript box → **send commands** in the chat (streamed) → **Finalize** → copy or download `.txt`. Optional **Quick pass (legacy)** uses `/api/runs` without chat.

## API

- `GET /api/health` — liveness
- `POST /api/transcribe/` — multipart field `file`. OpenAI `OPENAI_TRANSCRIPTION_MODEL` (default `whisper-1`). Optional `language` query. Returns `{ "transcript", "segments" }`.
- `POST /api/sessions` — body `{"initial_transcript": "..."}` → `{ "session_id" }`.
- `GET /api/sessions/{session_id}` — session row + chronological `messages` (`user` / `assistant`).
- `POST /api/sessions/{session_id}/messages` — body `{"content":"..."}`; **SSE** stream `data: {"delta":"..."}\n\n` then `data: {"done":true}\n\n` (or `{"error":"..."}`). Persists user + assistant messages.
- `POST /api/sessions/{session_id}/finalize` — optional JSON `{ "content": "..." }` to override; default uses last assistant message. Sets session `finalized`.
- **Legacy:** `POST /api/runs`, `GET /api/runs/{thread_id}`, `POST /api/runs/{thread_id}/resume` — LangGraph pipeline (requires `OPENAI_API_KEY`).

## Tests

```bash
cd backend && python -m pytest tests -q
```

## Phase 2 (optional)

- **Word-level timestamps** in the editor and **click word → play audio** (today: segment-level timestamps from Whisper when supported).
- **Deepgram** or other providers as an alternative to OpenAI-only transcription.
- **Real-time collaboration** (e.g. CRDT + WebSocket) if multiple editors are required.
