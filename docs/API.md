# QuizForge — API Reference

Base URL: `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | None | Register new user |
| POST | `/auth/login` | None | Login, get access + refresh tokens |
| POST | `/auth/refresh` | None | Rotate refresh token, get new access token |
| POST | `/auth/logout` | None | Revoke refresh token |

### POST /auth/register
```json
Request:  { "email": "user@example.com", "name": "Jane", "password": "pass123", "role": "student" }
Response: { "id": "...", "email": "...", "name": "...", "role": "student", "created_at": "..." }
```

### POST /auth/login
```json
Request:  { "email": "user@example.com", "password": "pass123" }
Response: { "access_token": "...", "refresh_token": "...", "token_type": "bearer", "user": {...} }
```

---

## Quizzes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/quizzes/` | Admin | Create a new quiz |
| GET | `/quizzes/my` | Admin | Get all quizzes created by this admin |
| GET | `/quizzes/published` | Any | Get all published quizzes |
| GET | `/quizzes/{id}` | Any | Get one quiz with all questions |
| PATCH | `/quizzes/{id}` | Admin | Update quiz metadata |
| POST | `/quizzes/{id}/publish` | Admin | Publish a draft quiz |
| DELETE | `/quizzes/{id}` | Admin | Delete a quiz |
| GET | `/quizzes/{id}/analytics` | Admin | Aggregate analytics across all sessions |

### POST /quizzes/
```json
Request:
{
  "title": "My Quiz",
  "description": "Optional",
  "time_per_q_sec": 300,
  "is_public": false,
  "tags": ["math"],
  "subject": "Mathematics",
  "difficulty": "medium",
  "questions": [
    {
      "order_index": 0,
      "section": "Section A",
      "text": "What is 2+2?",
      "correct_answer": 0,
      "marks": 1,
      "options": [
        { "order_index": 0, "text": "4", "content_type": "text" },
        { "order_index": 1, "text": "3", "content_type": "text" }
      ]
    }
  ]
}
```

---

## Test sessions

A session is an internal container for the attempts of one quiz; students start it with `POST /quizzes/{id}/start-attempt` (see **Test taking** below).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| PUT | `/sessions/{id}/autosave` | Student | Save in-progress answers without scoring (every ~30 s) |
| POST | `/sessions/{id}/submit` | Student | Submit and score answers (`?auto=true` when the timer ends) |
| GET | `/sessions/attempts/my` | Student | The student's finished attempts |
| GET | `/sessions/attempts/{attempt_id}/response-sheet-pdf` | Owner / Admin | Response sheet PDF |
| GET | `/sessions/{id}/leaderboard` | Any | Ranked results for the test |
| GET | `/sessions/{id}/analytics` | Any | Test analytics (students see their own) |

### POST /sessions/{id}/submit
```json
Request:
{
  "answers": [
    { "question_id": "...", "selected_option": 0, "time_taken_sec": 45 },
    { "question_id": "...", "response_text": "12.5", "time_taken_sec": 60 }
  ],
  "time_taken_sec": 180
}
Query param: ?auto=true  (for auto-submission when timer expires)
```
A submit arriving more than 90 s after the server deadline scores the last autosaved answers.

---

## LLM

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/llm/explain` | Any | AI explanation for a question (cached in DB). Students only after submitting that test |

### POST /llm/explain
```json
Request:  { "question_id": "..." }
Response: { "explanation": "The correct answer is A because..." }
```

---

## Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Returns status, version, model name |

```json
{ "status": "ok", "version": "3.0.0", "model": "meta-llama/llama-3.1-8b-instruct:free" }
```

---

## Progress Analytics (JEE full-syllabus tracking)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/progress/syllabus` | Any | JEE Main subjects → chapters, plus `ai_enabled` |
| GET | `/progress/me` | Any | Own progress across all submitted tests |
| GET | `/progress/attempts/{attempt_id}/report` | Owner / Admin | One test: rank, percentile, subject ranks, mistakes by chapter |
| GET | `/progress/students` | Admin | Every student with trend + weakest chapter |
| GET | `/progress/students/{student_id}` | Admin | One student's full progress (same shape as `/progress/me`) |
| GET | `/progress/batch` | Admin | Students, per-test averages, batch weak chapters |
| POST | `/progress/chapters/suggest` | Admin | Chapter suggestions for up to 60 question texts |
| PUT | `/quizzes/{quiz_id}/chapters` | Admin | Save / confirm subject + chapter per question (`chapter_source = admin`) |
| POST | `/quizzes/{quiz_id}/chapters/auto-tag` | Admin | Suggest chapters for untagged questions (AI, else keywords) |

Definitions used everywhere:
- **Percentile** (NTA style): `100 × (students with score ≤ yours) / students in that test`.
- **Mistake %**: wrong ÷ attempted in that chapter. **Skipped %**: skipped ÷ questions.
- **Recurring weakness 🔁**: wrong in ≥ 2 tests and in at least half of the tests the chapter appeared in.
- **Trend**: least-squares slope over the last 6 tests. It uses percentile across tests with ≥ 5 participants, otherwise score %. ±1.5 pts/test = improving/declining.
- Answers are classified correct / partial (multi-correct partial credit) / wrong / skipped.

### GET /progress/me (abridged)
```json
{
  "tests_taken": 4,
  "summary": { "average_score_pct": 46.4, "average_percentile": 52.23,
               "trend": { "label": "improving", "metric": "percentile", "slope": 12.7, "last_vs_prev": 25.6 } },
  "timeline": [{ "quiz_title": "...", "score": 53, "total_marks": 96, "rank": 4, "participants": 7, "percentile": 71.43,
                 "subjects": { "Physics": { "score_pct": 59.4 } } }],
  "subject_trends": [{ "subject": "Physics", "average_score_pct": 43.0, "trend": { "label": "improving" } }],
  "chapters": [{ "subject": "Physics", "chapter": "Rotational Motion", "mistake_pct": 50, "skip_pct": 50,
                 "tests_with_mistakes": 1, "tests_appeared": 4, "recurring": false, "history": [ ... ] }],
  "weak_chapters": [{ "...": "...", "diagnosis": "concept_gap", "advice": "..." }],
  "study_plan": [{ "priority": 1, "chapter": "...", "why": "...", "action": "..." }],
  "insights": [{ "kind": "negative_marking", "text": "..." }]
}
```


---

## Test taking

Students start published tests directly from their home screen during the availability window.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/quizzes/published` | Any | Lightweight cards: `question_count`, `sections`, `subjects`, `has_solution_pdf`, `in_progress` (no questions/images/PDFs) |
| GET | `/quizzes/my` | Admin | Same cards for the admin, incl. `untagged_count` |
| GET | `/quizzes/{id}` | Any | Full quiz; students get the answer-free schema, never the solution PDF |
| POST | `/quizzes/{id}/start-attempt` | Student | Start or resume; returns `saved_answers` for cross-device resume |
| PUT | `/sessions/{session_id}/autosave` | Owner | Save unscored answers (409 once submitted or > 2 min past deadline) |
| POST | `/sessions/{session_id}/submit` | Owner | Score the attempt; wrong/skipped questions go to the mistake notebook |
| POST | `/llm/explain` | Any | 403 for students until they have submitted that test |

## Mistake notebook, practice, target

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mistakes` | Totals (due / open / mastered) and per-chapter counts |
| GET | `/mistakes/due?chapter=&include_upcoming=` | Questions to re-attempt (no answer key) |
| POST | `/mistakes/{item_id}/answer` | `{selected_option, response_text}` → result, correct answer, next due date |
| POST | `/practice/weak-chapters` | New 15–20 question set from the 3 weakest chapters |
| GET | `/practice` · `/practice/{id}` | Recent sets · one set with revealed results |
| POST | `/practice/{id}/answer` | `{question_id, selected_option, response_text}` → instant feedback |
| GET / PUT | `/progress/target` | `{target_marks}` out of 300 (null clears) |

Schedule: a new mistake is due now; after each re-attempt it returns in 3, 7, then 21 days; a wrong re-attempt returns in 3 days and resets; **mastered after two correct in a row**. Practice only uses tests the student finished or whose window has closed.

Attempt report / progress additions: `time_strategy` (slow-and-wrong > 240 s, rushed-and-wrong < 20 s, time per subject vs topper and batch), `difficulty` (easy ≥ 70 % of takers correct, hard < 30 %, needs ≥ 5 takers), `target` (gap overall and per subject, estimated JEE Main percentile; estimate only).

## Answer keys

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| PUT | `/quizzes/{id}/answer-keys` | Admin | `{updates: [{question_id, correct_answer, raw_answer}]}`. Single / assertion / match: `correct_answer` 0–5. Numerical: `raw_answer` like `12.5`. Multi: `raw_answer` like `A, C`. Re-scores every submitted attempt and returns `{rescored_attempts, missing_key_count, quiz}` |

A question without an answer key is **ungraded**: no marks, no penalty, not counted in `total_marks`, left out of analytics, the notebook and practice. The AI no longer guesses keys (it used to default to option A); it only fills a key when an OpenRouter key is set and its reply is a clear option. `missing_key_count` is on every admin quiz card.

Late submits: a submit more than 90 s past the server deadline (duration from `started_at`, capped by `availability_end`) ignores the posted answers and scores the last autosaved ones, marked `auto_submitted`.

## Streaks, badges, most improved

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/progress/streak` | Any | `current`, `longest`, `daily_goal`, `today {revised, tests, met, remaining}`, `at_risk`, last 14 days, `message` |
| PUT | `/progress/daily-goal` | Any | `{daily_goal: 1–100}` (UI offers 5, 10, 15, 20, 30, 50) |
| GET | `/progress/badges` | Any | All 16 badges with `earned`, `earned_at`, `progress {current, goal, pct}`, `detail`, `new` (earned in the last 3 days) |
| GET | `/progress/leaderboard/improved?limit=10` | Any | Most improved: top N + `me` for students; everyone (with `student_id`) for admins |
| GET | `/progress/students/{id}/motivation` | Admin | One student's streak + badges |

A day counts towards the streak when the student revises their daily goal of questions (notebook re-attempts + practice answers) or submits a test. Days are calendar days in `STREAK_TIMEZONE` (default `Asia/Kolkata`). The streak stays alive through today if yesterday counted.

Most improved = average of the last 2 tests − average of the 2 before (only 2 tests: latest − first), in percentile points when most tests had ≥ 5 takers (only those tests count), otherwise in score % points.
