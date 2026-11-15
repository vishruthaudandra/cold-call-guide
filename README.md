# Fieldnote: cold-call guide

A live companion screen for a salesperson on a cold call. It guides the caller through eight stages, captures what happened and the prospect's own words, can suggest a reply with Gemini, and keeps a history of calls in Supabase.

## Live deployment

- App: https://cold-call-guide-cv2s.vercel.app
- Backend health: https://cold-call-guide-hpi8.onrender.com/health
- Source: https://github.com/vishruthaudandra/cold-call-guide

## Project structure

- `frontend/` — Vite single-page app, deployed to Vercel.
- `backend/` — FastAPI API, deployed to Render.
- `sql/schema.sql` — Supabase tables and indexes.
- The supplied 100-call archive was used as research input. The fictionalized source transcripts are not included or reproduced here.

## Run locally

### Backend

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in Supabase and Gemini values in .env
uvicorn main:app --reload --env-file .env
```

The API is at `http://127.0.0.1:8000`. Check `http://127.0.0.1:8000/health`. Make sure `ALLOWED_ORIGINS` in `.env` includes `http://localhost:5173` and `http://127.0.0.1:5173` for the local frontend.

### Frontend

In a second terminal:

```sh
cd frontend
npm install
npm run dev
```

The local frontend uses `http://127.0.0.1:8000` by default. To point it at a different backend, set `VITE_API_BASE_URL` before building or running Vite.

## Deploy

### Render

- Create a Web Service from this repository.
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `ALLOWED_ORIGINS` from `backend/.env.example` as Render environment variables. Set `ALLOWED_ORIGINS` to your Vercel origin.
- Health check path: `/health`

### Vercel

- Import this repository as a Vercel project.
- Root directory: `frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Add `VITE_API_BASE_URL` with the Render service URL (no trailing slash).

## API

- `GET /health` — service health
- `GET /stages` — stage guide content
- `POST /calls` — start a call
- `POST /calls/{id}/stages` — save a stage result
- `POST /calls/{id}/close` — record the call outcome
- `GET /calls` — recent call history
- `POST /suggest` — ask Gemini for a short suggested reply

Never commit `.env` files or service keys. Keep the Supabase service key and Gemini key in the backend environment only.
