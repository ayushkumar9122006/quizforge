<div align="center">

# 📝 QuizForge

**JEE test platform: PDF/OCR import, ranks & percentiles, and progress analytics that help students improve test after test**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql)](https://postgresql.org)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat)](https://web.dev/progressive-web-apps/)

</div>

---

## 1. Project Overview

QuizForge is a full-stack test platform for JEE coaching:

- **Admins** create quizzes (manual, OCR-scanned from photos, or bulk-imported from PDFs), tag chapters, and publish them with an availability window.
- **Students** start published tests directly within the window (fullscreen, autosaved), then get rank, percentile, chapter-wise mistakes and a long-term progress dashboard.
- **AI** (via OpenRouter, optional) suggests JEE chapters for questions and writes answer explanations, which students can open only after submitting that test. It never guesses answer keys: a question without a key is ungraded until the admin sets one.

**Stack:** FastAPI (async SQLAlchemy 2.0) · PostgreSQL 16 · Alembic migrations · JWT auth · React 18 + Vite · Recharts · installable PWA.

### Built for improving JEE marks
- **Mistake notebook** with spaced re-attempts (3 / 7 / 21 days, mastered after two correct in a row).
- **Practice my weak chapters**: one click, 15–20 questions, instant feedback.
- **Time strategy, easy-question mistakes and a target tracker** with an estimated JEE Main percentile.
- **Autosave every 30 s**, resume on any device, **installable app** with **fullscreen test mode**.
- Optional **Cloudinary** image storage (`CLOUDINARY_URL`), with `backend/migrate_images_to_cloudinary.py` for existing images.
- **Daily streak and goal, 16 badges, and a most-improved leaderboard** that ranks students by how much they improved, not by the top score.
- **Answer keys are never guessed**: questions without a key are ungraded until the admin sets it; setting or fixing a key re-scores every attempt.

### JEE progress analytics
Every question carries a **subject** and a **JEE syllabus chapter**: the AI suggests and the admin confirms. From that, students get a **My Progress** dashboard showing whether they are improving test after test, which chapters they keep getting wrong, and what to revise next. Every result screen shows rank, percentile, subject-wise rank and where the marks were lost. Admins get a **Students & Progress** view with per-student drill-down and the chapters the whole batch struggles with. See `docs/API.md → Progress Analytics`.

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
| `CLOUDINARY_URL` | `cloudinary://<api_key>:<api_secret>@<cloud_name>`. When set, question/option images are stored on Cloudinary instead of the DB | *(unset)* |
| `BREVO_API_KEY` | Brevo **API** key (`xkeysib-…`, not the SMTP key) for password-reset OTP emails. Sent over HTTPS, so it works on hosts that block SMTP (Render free) | *(unset)* |
| `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | Sender verified in Brevo → Senders, and the name students see | *(unset)* / `QuiZee` |
| `RESEND_API_KEY`, `SMTP_*` | Optional fallbacks, tried after Brevo. With no provider set (outside production), the OTP is printed in the backend terminal | *(unset)* |
| `STREAK_TIMEZONE` | Time zone that decides when a streak day starts | `Asia/Kolkata` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Used by `seed.py` | see `.env.example` |
| `SEED_STUDENT_EMAIL` / `SEED_STUDENT_PASSWORD` | Used by `seed.py` | see `.env.example` |

### Frontend (`frontend/.env`)
| Variable | Description | Default |
|---|---|---|
| `VITE_BACKEND_URL` | Backend base URL for the REST API | `http://localhost:8000` |

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

The migration chain runs `0001` → `0011` (`0010` question subject/chapter, `0011` targets, mistake notebook and practice). Always run `alembic upgrade head`.

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
  5. Add a rate limiter in front of `/auth/login` (see Known Limitations) before any public launch.

---

## 8. How a Test Works

1. The admin creates a test (manual, OCR from photos, or **bulk import from a PDF**), checks the answer keys and chapter tags, and publishes it with an availability window.
2. During the window, students start the test straight from their home screen.
3. The test runs in fullscreen with a server-side timer. Answers autosave every 30 s, so a student can resume on any device. Leaving fullscreen counts as a strike.
4. On submit, or automatically when time runs out, the server scores the attempt. A submit arriving more than 90 s late scores the last autosaved answers.
5. The student sees rank, percentile, subject-wise rank, mistakes by chapter and time strategy. Mistakes go into their **mistake notebook** for spaced re-attempts.
6. Over many tests, **My Progress** (student) and **Students & Progress** (admin) show who is improving and which chapters keep going wrong.

Full change history: `CHANGELOG.md`.

---

## 9. Security & Data Rules

- **Students never receive answer keys before submitting**: they get a stripped schema, and keys, explanations and solution PDFs unlock only after they submit that test.
- **Scoring is server-side only**, and a duplicate or retried submit is a safe no-op.
- **Answer keys are never guessed.** Setting or correcting a key re-scores every submitted attempt.
- Passwords are hashed with bcrypt, and forgot-password requests are throttled (60 s cooldown).

---

## 10. Known Limitations

- **No rate limiting on `/auth/login`.** Add one (e.g. `slowapi`) before any public deployment.
- **AI chapter suggestions and explanations need a real `OPENROUTER_API_KEY`.** Without one, chapter tagging falls back to keyword matching and explanations use a template; nothing crashes.
- **PDF import is tuned for "Q1. … (a)–(d) … Correct Answer: X" papers.** Questions with typeset maths are stored as images cut from the PDF, so their wording can't be edited as text. A diagram printed between two lines of text appears after the text.
- **Free hosting tiers sleep when idle**, so the first request after a quiet period can take up to ~50 s on Render's free plan.
- **Images are stored in the database** unless `CLOUDINARY_URL` is set. For large question banks, set it and run `backend/migrate_images_to_cloudinary.py`.
