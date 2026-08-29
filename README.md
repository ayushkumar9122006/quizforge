<div align="center">

# 📝 QuizForge

**AI-powered Quiz Platform with OCR, Real-time Leaderboards & Analytics**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql)](https://postgresql.org)
[![WebSockets](https://img.shields.io/badge/WebSockets-Real--time-brightgreen?style=flat)](https://fastapi.tiangolo.com/advanced/websockets/)

</div>

---

## 1. Project Overview

QuizForge is a full-stack, real-time quiz platform:

- **Admins** create quizzes (manual questions or OCR-scanned from photos, powered by Tesseract.js in the browser), publish them, and host live sessions behind a 6-digit room code.
- **Students** join a session with the room code, wait in a live Waiting Room, take the quiz against a timer, and see the leaderboard update in real time as classmates submit.
- **AI** (via OpenRouter) generates answer explanations and resolves any question left without a marked correct answer — resolved once, server-side, and reused everywhere so every student and the admin's leaderboard/analytics always agree.

**Stack:** FastAPI (async SQLAlchemy 2.0) · PostgreSQL 16 · Alembic migrations · JWT auth · native WebSockets · React 18 + Vite · Recharts.

---

## 2. Installation

### Prerequisites
- Python 3.12+
- Node.js 18+ and npm
- PostgreSQL 14+ (16 recommended)

### Clone & install
```bash
git clone https://github.com/ayushkumar9122006/quizforge
cd quizforge

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

---

## 3. Environment Variables

Copy `.env.example` → `.env` at the project root (and/or `backend/.env`, `frontend/.env` — both are read independently) and fill in real values before deploying anywhere beyond local development.

### Backend (`backend/.env`)
| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Async Postgres connection string | `postgresql+asyncpg://quizforge:quizforge123@localhost:5432/quizforge_db` |
| `SECRET_KEY` | JWT signing secret — **must** be changed for production | *(placeholder — see Known Limitations)* |
| `ALGORITHM` | JWT signing algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `7` |
| `OPENROUTER_API_KEY` | Real key required for AI explanations/answer-resolution to return genuine model output | *(placeholder)* |
| `OPENROUTER_MODEL` | Model slug used for LLM calls | `meta-llama/llama-3.1-8b-instruct:free` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `UPLOAD_DIR` | Directory for static file mounts (auto-created on boot) | `uploads` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Used by `seed.py` | see `.env.example` |
| `SEED_STUDENT_EMAIL` / `SEED_STUDENT_PASSWORD` | Used by `seed.py` | see `.env.example` |

### Frontend (`frontend/.env`)
| Variable | Description | Default |
|---|---|---|
| `VITE_BACKEND_URL` | Backend base URL (used for both REST and derived WebSocket URL) | `http://localhost:8000` |

---

## 4. Database Setup

```bash
# Create the role and database (adjust to your local Postgres setup)
psql postgres -c "CREATE USER quizforge WITH PASSWORD 'quizforge123';"
psql postgres -c "CREATE DATABASE quizforge_db OWNER quizforge;"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE quizforge_db TO quizforge;"
```

## 5. Migration Commands

```bash
cd backend

# Apply all migrations (run this on every fresh database)
alembic upgrade head

# Check current revision
alembic current

# Create a new migration after changing models/all_models.py
alembic revision -m "describe your change"

# Roll back one revision
alembic downgrade -1
```

The migration chain is `0001` (initial schema) → `0002` (widen image columns) → `0003` (drop orphan enum types). All three are required — always run `alembic upgrade head`, not just `0001`.

Optionally seed a demo admin/student:
```bash
python seed.py
```

---

## 6. Local Development

```bash
# Terminal 1 — backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs

---

## 7. Production Deployment

- `docker-compose.yml`, `backend/Dockerfile`, and `frontend/Dockerfile` are provided for containerized deployment.
- `render.yaml` and `railway.json` are provided for one-click deploys on Render/Railway.
- `frontend/vercel.json` + `frontend/nginx-spa.conf` support static-hosting deployments (Vercel or any nginx-fronted host) — both are SPA-rewrite configs so client-side routing works on refresh/deep-link.
- Before deploying:
  1. Set a strong, unique `SECRET_KEY`.
  2. Set a real `OPENROUTER_API_KEY` if AI explanations/answer-resolution should return genuine model output.
  3. Point `DATABASE_URL` at your production Postgres instance and run `alembic upgrade head` against it.
  4. Set `FRONTEND_URL` (backend) and `VITE_BACKEND_URL` (frontend) to your real deployed origins.
  5. Add a rate limiter in front of `/auth/login` and `/sessions/join` (see Known Limitations) before any public launch.

---

## 8. Bugs Fixed in This Release

All of the following were found via live testing against a real PostgreSQL database (not just static review) and are now fixed and re-verified:

1. **Student quiz-join bypass** — students could reach and submit a quiz without ever entering a room code. Submission now requires a prior verified `/sessions/join` call; enforced server-side.
2. **Answer key exposed to students pre-submission** — `correct_answer`/`explanation` were visible in the quiz payload before a student ever answered. Students now receive a stripped schema; the answer key is only revealed in the post-submission result.
3. **Inconsistent scoring** — the frontend and backend each independently asked the AI to resolve ambiguous correct answers, which could disagree. Scoring is now resolved exactly once, server-side, and returned in the submit response.
4. **Analytics dashboard rendering blank** — a field-name mismatch (`total_attempts` vs. `total_submitted`) meant the default Analytics view never rendered any data.
5. **Duplicate auto-submit** — the countdown timer could fire two submit calls in the same tick; both client- and server-side idempotency guards now prevent double-scoring.
6. **Password hashing completely broken on a fresh install** — `passlib==1.7.4` is incompatible with `bcrypt>=4.1`; every register/login call failed with a 500. Fixed by pinning `bcrypt==4.0.1`.
7. **Every quiz save containing an image failed** — OCR-cropped images (full base64 data URLs) were being saved into `VARCHAR(500)` columns. Widened to `TEXT` (migration `0002`).
8. **Analytics endpoints returned 500 against real Postgres** — five columns were declared as native Postgres `ENUM` types in the ORM model but as plain `VARCHAR` in the actual migration, causing `operator does not exist` errors the moment a query filtered on them. Model aligned to match the real schema; orphan enum types dropped (migration `0003`).
9. **Backend failed to start on a fresh checkout with no `uploads/` folder** — the static file mount ran before the directory-creation code. Directory creation now happens before the mount.
10. Various dead code, duplicate queries, and unused imports removed (see `CHANGELOG.md`).

---

## 9. New Features / Improvements

- Room-code join modal on the student side (previously missing entirely).
- Backend-authoritative, single-source-of-truth result payload (`AttemptResultOut`) returned from `POST /sessions/{id}/submit`, including a per-question correctness breakdown.
- WebSocket auto-reconnect now refreshes an expired access token instead of retrying with a stale one.
- Idempotent submission handling (a duplicate/retried submit is a safe no-op, not a re-score or a crash).
- Role-based quiz schemas (`QuizStudentOut` / `QuestionStudentOut`) so students structurally cannot receive the answer key.

---

## 10. Known Limitations

- **No room-code expiry (TTL)** — a room stays joinable until an admin explicitly ends the session.
- **No quiz-resume** — refreshing mid-quiz loses in-progress answers (all state is in-memory React state).
- **No rate limiting** — `/auth/login` and `/sessions/join` (a 6-digit numeric code) have no throttling; add one (e.g. `slowapi`) before any public deployment.
- **AI explanation/answer-resolution quality depends on a real `OPENROUTER_API_KEY`** — without one, the app degrades gracefully to a templated fallback rather than crashing, but won't produce genuine AI-generated explanations.
- **In-memory WebSocket room state** — `ConnectionManager` holds live participant state in a plain Python dict with no shared backing store, so it will not work correctly across more than one backend worker process/instance without adding a shared pub-sub layer (e.g. Redis).
- **`LeaderboardEntryOut` omits `student_id`** — the "highlight me" affordance on the live leaderboard cannot currently match the logged-in user.
- Two browser tabs open as the same student in the same room will have their WebSocket presence tracked as a single slot; closing one tab can incorrectly appear to remove the other.
