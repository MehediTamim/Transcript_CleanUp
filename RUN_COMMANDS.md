# How to run (commands only)

Repo root: `transcript_cleaner_tool`

## Python 3.12 venv (one-time)

```bash
python3.12 -m venv .venv
```

## Activate

Linux / macOS (zsh, bash):

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

## Verify

```bash
python -V
```

## Optional: upgrade pip

```bash
python -m pip install -U pip
```

## Deactivate

```bash
deactivate
```

## Backend (FastAPI)

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# set OPENAI_API_KEY in backend/.env

cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

## Frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev
```

## Backend tests

```bash
cd backend
python -m pytest tests -q
```
