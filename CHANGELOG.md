# Changelog

All notable changes made during the production-readiness pass are documented here.

## [Unreleased] — Production Readiness Pass

### Fixed — Critical

- **Student room-code bypass (Root Cause #1)**
  - `backend/routers/session.py` (`submit`, `join`) — submission now requires a verified prior join; rejects with `403` if no join occurred; rejects join/submit against a closed session with `400`.
  - `backend/crud/session.py` — added `get_attempt()` (read-only lookup, no auto-create); `submit_attempt()` now guards against re-scoring an already-submitted attempt (idempotent).
  - `frontend/src/pages/StudentPage.jsx` — added a room-code entry modal; `handleTake` no longer skips straight to the quiz; `onTake` only fires after a successful `POST /sessions/join`.

- **Answer key exposed to students before submission (Root Cause #8)**
  - `backend/schemas/quiz.py` — added `QuestionStudentOut` / `QuizStudentOut` (omit `correct_answer` and `explanation`).
  - `backend/routers/quiz.py` (`published_quizzes`, `get_one`) — now return the student-safe schema for student-role requests, full schema for admins.

- **Inconsistent/duplicate scoring (Root Cause #5)**
  - `backend/schemas/session.py` — added `AnswerResultOut`, `AttemptResultOut`.
  - `backend/crud/session.py` (`submit_attempt`) — now returns `(Attempt, list[per-question result])`.
  - `backend/routers/session.py` (`submit`) — single server-side LLM resolution call; response now includes backend-authoritative per-question correctness.
  - `frontend/src/pages/StudentPage.jsx` (`handleSubmit`) — removed the separate client-side LLM answer-resolution call and local scoring; now uses the backend's `results[]` exclusively.
  - `frontend/src/services/llmService.js` — removed `findCorrectAnswers` (dead code after the above change).
  - `backend/routers/llm.py` — removed the now-unused `POST /llm/find-answer` route (`find_correct_answer` in `services/llm_service.py`, used internally by `resolve_unset_answers`, is unaffected and unchanged).

- **Analytics dashboard rendered blank on first load**
  - `backend/services/analytics_service.py` (`get_quiz_analytics`) — added a `total_submitted` alias so quiz-level analytics matches the field name the frontend gates its render on.

- **Duplicate auto-submit**
  - `frontend/src/components/Quiz/QuizAttempt.jsx` (`doSubmit`) — added a `submittedRef` re-entrancy guard.

- **Password hashing broken on any fresh install**
  - `backend/requirements.txt` — pinned `bcrypt==4.0.1` (passlib 1.7.4 is incompatible with bcrypt ≥ 4.1's stricter 72-byte handling, which previously crashed every register/login call with a 500).

- **Every quiz save with an image failed (`StringDataRightTruncationError`)**
  - `backend/models/all_models.py` — `Question.question_image`, `Question.explanation_image`, `Question.diagram`, `Option.image` changed from `String(500)` to `Text`.
  - `backend/alembic/versions/0002_widen_image_columns.py` — **new migration**, widens the four columns on an existing database.

- **Analytics endpoints returned 500 against a real Postgres database**
  - `backend/models/all_models.py` — `User.role`, `Question.content_type`, `Option.content_type`, `QuizSession.status`, `Attempt.status` changed from `SAEnum(...)` to `String(20)`, matching what the Alembic migration actually creates (this mismatch previously caused SQLAlchemy to compile queries with a Postgres enum-type cast against a plain `VARCHAR` column, which fails with `operator does not exist`).
  - `backend/alembic/versions/0003_drop_orphan_enum_types.py` — **new migration**, drops the four orphan native Postgres enum types that `Base.metadata.create_all()` had silently created to match the (now-corrected) old model declarations.

- **Backend failed to start on a fresh checkout**
  - `backend/main.py` — moved `os.makedirs(...)` for the upload directories to run before `app.mount("/uploads", StaticFiles(...))` (previously ran inside the `lifespan` startup handler, which executes *after* the module-level `StaticFiles` mount already needs the directory to exist).

- **Session/WebSocket reconnect using a stale token**
  - `frontend/src/services/wsService.js` — on an auth-related WS close (codes 4001/4002), the client now calls `POST /auth/refresh` and reconnects with the new token instead of retrying with the expired one.

### Removed — Dead code / duplicate logic / unused imports

- `frontend/src/services/llmService.js` — removed unused `findCorrectAnswers`.
- `backend/routers/llm.py` — removed the unused `/llm/find-answer` route and its `FindAnswerRequest` schema; removed a redundant duplicate DB query in `explain()` (the function queried the same question twice — once without eager-loaded options, immediately discarded, then again with eager loading).
- `backend/services/analytics_service.py` — removed unused `LeaderboardEntry` import.
- `backend/routers/quiz.py` — removed unused `QuizListOut`, `QuizStatus` imports.
- `backend/routers/auth.py` — removed unused `timedelta`, `settings` imports.
- `backend/models/all_models.py` — removed unused `sqlalchemy.dialects.postgresql.UUID` import; removed now-unused `Enum as SAEnum` import after the enum→string column fix above.
- `backend/crud/quiz.py` — removed unused `func`, `QuestionCreate` imports.
- `backend/websocket/manager.py` — removed unused `asyncio`, `Any` imports.
- `backend/websocket/events.py` — removed unused `Any` import.
- `frontend/src/services/wsService.js` — removed two informational `console.log` debug statements (connection status is already exposed via the `ws:connected`/`ws:disconnected` event listeners; `console.error`/`console.warn` calls on genuine error paths were kept).
- Repository cleanup: removed a stray/junk `backend/{database,models,schemas,...}` literal directory and a matching `frontend/src/{components` directory (artifacts of an unexpanded shell brace-expansion), a scratch `backend/BLOCK1_SETUP.md` setup-notes file, all `__pycache__` directories, and the platform-specific `backend/venv` / `frontend/node_modules` dependency trees (both are regenerated from `requirements.txt` / `package.json` at install time, not shipped).

### Added

- `backend/alembic/versions/0002_widen_image_columns.py` — new migration.
- `backend/alembic/versions/0003_drop_orphan_enum_types.py` — new migration.
- `README.md` — full rewrite covering installation, environment variables, database setup, migrations, local dev, production deployment, bugs fixed, new features, and known limitations.
- `CHANGELOG.md` — this file.

### API Changes

| Endpoint | Change |
|---|---|
| `POST /sessions/{id}/submit` | Now returns `AttemptResultOut` (adds `results: [{question_id, selected_option, correct_answer, is_correct, marks_awarded}]`) instead of `AttemptOut`. Now returns `403` if the caller never joined the session, and `400` if the session has already ended. |
| `POST /sessions/join` | Now returns `400` if the target session has already ended (previously allowed joining a closed room). |
| `GET /quizzes/published` | Students now receive `QuizStudentOut` (no `correct_answer`/`explanation` per question); admins unaffected. |
| `GET /quizzes/{quiz_id}` | Same student/admin schema split as above. |
| `GET /quizzes/{quiz_id}/analytics` | Response now also includes `total_submitted` (alias of `total_attempts`) for frontend compatibility. |
| `POST /llm/find-answer` | **Removed** — had zero remaining callers after the scoring-consistency fix above. |

### Frontend Changes

| File | Change |
|---|---|
| `src/pages/StudentPage.jsx` | Added room-code join modal and state (`joinTarget`, `roomCode`, `joinError`, `joining`); `handleTake`, `handleJoinSubmit`, `handleJoinCancel`, `handleLeaveRoom` added/rewritten; `handleSubmit` rewritten to use only backend-returned results. |
| `src/components/Quiz/QuizAttempt.jsx` | Added `submittedRef` re-entrancy guard in `doSubmit`. |
| `src/services/wsService.js` | Added `_refreshToken()`; auth-close-code detection (`AUTH_CLOSE_CODES`); reconnect now `async` and refreshes the token when appropriate; removed 2 debug `console.log` calls. |
| `src/services/llmService.js` | Removed `findCorrectAnswers`. |

### Database Migration Chain

```
0001_initial.py                    Initial schema — all 11 tables
0002_widen_image_columns.py        question_image/explanation_image/diagram/image: VARCHAR(500) → TEXT
0003_drop_orphan_enum_types.py     Drop orphan Postgres ENUM types (userrole, contenttype, sessionstatus, attemptstatus)
```
Run `alembic upgrade head` — all three are required on every environment, including ones already running `0001`.
