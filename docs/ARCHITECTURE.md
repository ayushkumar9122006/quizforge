# QuizForge — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Student/Admin)                   │
│                                                                   │
│   React + Vite + Tesseract.js                                    │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│   │  Login   │  │  Admin   │  │ Student  │  │  Analytics   │   │
│   │  Screen  │  │Dashboard │  │  Quiz    │  │  Dashboard   │   │
│   └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                   │
│   services/api.js (Axios + JWT interceptor)                      │
│   services/wsService.js (WebSocket + auto-reconnect)             │
└──────────────────┬──────────────────────────┬────────────────────┘
                   │ HTTP/REST                 │ WebSocket
                   ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                      │
│                                                                   │
│  routers/          services/           utils/                    │
│  ├ auth.py         ├ llm_service.py    ├ security.py (JWT/bcrypt)│
│  ├ quiz.py         ├ analytics_service ├ dependencies.py         │
│  ├ session.py      └ ...               └ openrouter.py           │
│  ├ llm.py                                                         │
│  └ ws.py           websocket/                                    │
│                    ├ manager.py (ConnectionManager)              │
│                    └ events.py  (event factory functions)        │
│                                                                   │
│  SQLAlchemy ORM (async) + Alembic migrations                     │
└──────────────────┬──────────────────────────┬────────────────────┘
                   │                           │
                   ▼                           ▼
┌──────────────────────┐         ┌─────────────────────────────┐
│   PostgreSQL DB       │         │   OpenRouter API (LLM)       │
│                       │         │   meta-llama/llama-3.1-8b   │
│   9 tables            │         │   (free tier)               │
│   (see ER below)      │         └─────────────────────────────┘
└──────────────────────┘
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

quiz_sessions
├── id (PK)
├── quiz_id (FK → quizzes)
├── room_code (UNIQUE, 6-digit)
├── status  [waiting | active | completed]
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

## Real-time Flow (WebSockets)

```
Admin creates room (POST /sessions/)
        │ room_code returned
        ▼
Admin connects WS /ws/{room_code}?token=...
        │
Students join (POST /sessions/join)
        │
Students connect WS /ws/{room_code}?token=...
        │ server broadcasts room:joined to all
        │ admin sees participant list update live
        ▼
Admin clicks Start (POST /sessions/{id}/start)
        │ server broadcasts quiz:started to all
        ▼
All students enter QuizAttempt simultaneously
        │
Each student submits (POST /sessions/{id}/submit)
        │ server scores, updates leaderboard table
        │ broadcasts leaderboard:update to ALL
        │ broadcasts student:submitted to ADMIN only
        ▼
Admin sees live leaderboard + submission toasts
Students see live leaderboard update after their submit
        │
Admin ends session (POST /sessions/{id}/end)
        │ broadcasts quiz:ended
        ▼
All clients show final results
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Recharts, Tesseract.js, Axios |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Real-time | FastAPI WebSockets |
| LLM | OpenRouter (meta-llama/llama-3.1-8b-instruct:free) |
| Deployment | Docker, Render / Railway / Vercel |
