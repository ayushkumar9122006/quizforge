# QuizForge — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              BROWSER / INSTALLED PWA (Student · Admin)           │
│                                                                   │
│   React 18 + Vite + Recharts + Tesseract.js (OCR)                │
│   Admin: tests, PDF import, answer keys & chapters, batch view   │
│   Student: fullscreen test, report, My Progress, notebook,       │
│            weak-chapter practice, streaks & badges               │
│                                                                   │
│   services/api.js (Axios + JWT refresh)                          │
│   attemptStorage.js (local copy) + autosave every 30 s           │
│   sw.js (service worker: app shell only)                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / REST (JSON)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                      │
│                                                                   │
│  routers/            services/                                   │
│  ├ auth.py           ├ pdf_importer_service + pdf_layout_parser  │
│  ├ quiz.py           ├ progress_service (rank, percentile, trend)│
│  ├ session.py        ├ notebook_service (spaced re-attempts)     │
│  ├ progress.py       ├ motivation_service (streaks, badges)      │
│  ├ notebook.py       ├ chapter_tagger + jee_syllabus             │
│  ├ motivation.py     ├ response_sheet_service (PDF)              │
│  ├ notice.py         ├ media_service (Cloudinary, optional)      │
│  └ llm.py            └ llm_service (OpenRouter, optional)        │
│                                                                   │
│  SQLAlchemy 2.0 (async) + Alembic migrations                     │
└──────────────┬──────────────────────────────┬───────────────────┘
               ▼                              ▼
┌──────────────────────────┐   ┌─────────────────────────────────┐
│ PostgreSQL 16 (Neon)     │   │ OpenRouter (AI chapter tags,     │
│ 17 tables (see below)    │   │ explanations) · Cloudinary       │
└──────────────────────────┘   │ (images) · Resend (email OTP)    │
                               └─────────────────────────────────┘
```

---

## Database ER Diagram

```
users
├── id (PK)
├── email (UNIQUE)
├── name
├── hashed_password
├── role  [admin | student]
├── is_active
└── created_at

refresh_tokens
├── id (PK)
├── token (UNIQUE)
├── user_id (FK → users)
├── expires_at
└── revoked

quizzes
├── id (PK)
├── title
├── creator_id (FK → users)
├── status  [draft | published | archived]
├── time_per_q_sec
├── total_marks
├── tags (JSON)
└── created_at

questions
├── id (PK)
├── quiz_id (FK → quizzes)
├── order_index
├── section
├── text
├── question_image  (file path)
├── correct_answer  (0-based index, nullable)
├── marks
└── diagram  (file path)

options
├── id (PK)
├── question_id (FK → questions)
├── order_index
├── text
├── image  (file path)
└── content_type  [text | image | both]

quiz_sessions          (internal container for one quiz's attempts)
├── id (PK)
├── quiz_id (FK → quizzes)
├── status  [active | completed]
├── started_at
└── ended_at

attempts
├── id (PK)
├── session_id (FK → quiz_sessions)
├── student_id (FK → users)
├── score
├── total_marks
├── status  [in_progress | submitted | auto_submitted]
└── UNIQUE(session_id, student_id)

answers
├── id (PK)
├── attempt_id (FK → attempts)
├── question_id (FK → questions)
├── selected_option  (nullable = skipped)
├── is_correct
├── marks_awarded
└── UNIQUE(attempt_id, question_id)

leaderboard
├── id (PK)
├── session_id (FK → quiz_sessions)
├── student_id (FK → users)
├── student_name
├── score
├── accuracy
├── rank
└── UNIQUE(session_id, student_id)

explanations
├── id (PK)
├── question_id (FK → questions, UNIQUE)
├── text
└── is_ai
```

---

## OCR Pipeline

```
Admin uploads image
        │
        ▼
ImageCropper (canvas crop — browser, no network)
        │
        ▼
Admin chooses modes:
  Question mode: Text | Image
  Option  mode: Text | Image
        │
  ┌─────┴──────┐
  │            │
  ▼            ▼
Text mode    Image mode
Tesseract.js  Store dataUrl
(local OCR)   directly
  │
  ▼
Raw text string
  │
  ▼ (only for Text mode)
Auto-detect option labels (A)(B)(C)(D)
Crop each option region
  │
  ├── Text mode: Tesseract OCR each crop → fill text fields
  └── Image mode: store crop dataUrl → show as thumbnail
        │
        ▼
Admin reviews extracted content
Edits if needed → Save & Publish
```

---

## Test Flow

```
Admin publishes a test with an availability window
        │
Student opens it from Home (POST /quizzes/{id}/start-attempt)
        │ server creates/reuses the quiz session and the student's attempt,
        │ returns questions (no answer keys) + any autosaved answers
        ▼
Fullscreen test page
        │ answers kept locally and autosaved (PUT /sessions/{id}/autosave, ~30 s)
        │ exiting fullscreen = strike; resume works on any device
        ▼
Submit (POST /sessions/{id}/submit) — or auto-submit at the deadline
        │ server-side deadline (+90 s grace, else last autosave is scored)
        │ scores, ranks, updates leaderboard, files mistakes into the notebook
        ▼
Report: rank, percentile, subject ranks, chapter mistakes, time strategy
        │
My Progress / Students & Progress update across tests
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Recharts, Tesseract.js, Axios |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Offline / mobile | Installable PWA, service worker, fullscreen test mode |
| LLM | OpenRouter (meta-llama/llama-3.1-8b-instruct:free) |
| Deployment | Docker, Render / Railway / Vercel |
