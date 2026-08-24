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

## Sessions (Rooms)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/sessions/` | Admin | Create a room session for a quiz |
| POST | `/sessions/join` | Student | Join a room by 6-digit code |
| POST | `/sessions/{id}/start` | Admin | Start the quiz (broadcasts via WS) |
| POST | `/sessions/{id}/submit` | Student | Submit answers |
| GET | `/sessions/{id}/leaderboard` | Any | Get sorted leaderboard |
| GET | `/sessions/{id}/analytics` | Admin | Get session analytics |
| GET | `/sessions/{id}/participants` | Admin | Get currently connected WS users |
| POST | `/sessions/{id}/end` | Admin | End session (broadcasts via WS) |

### POST /sessions/join
```json
Request:  { "room_code": "123456" }
Response: { "id": "...", "quiz_id": "...", "room_code": "123456", "status": "waiting" }
```

### POST /sessions/{id}/submit
```json
Request:
{
  "answers": [
    { "question_id": "...", "selected_option": 0, "time_taken_sec": 45 },
    { "question_id": "...", "selected_option": null, "time_taken_sec": 0 }
  ],
  "time_taken_sec": 180
}
Query param: ?auto=true  (for auto-submission when timer expires)
```

---

## LLM

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/llm/explain` | Any | Get AI explanation for a question (cached in DB) |
| POST | `/llm/find-answer` | Any | Ask LLM to identify correct option |

### POST /llm/explain
```json
Request:  { "question_id": "..." }
Response: { "explanation": "The correct answer is A because..." }
```

---

## WebSocket

### WS /ws/{room_code}?token={access_token}

Connect to a live quiz room. Token is passed as query param (browser WebSocket limitation).

**Server → Client events:**

| Event type | Payload | When |
|------------|---------|------|
| `room:participants` | `{ participants: [{user_id, name, role}] }` | On connect |
| `room:joined` | `{ user_id, name, role }` | User joins |
| `room:left` | `{ user_id, name }` | User disconnects |
| `quiz:started` | `{ session_id, time_per_q_sec, total_questions }` | Admin starts quiz |
| `quiz:ended` | `{}` | Admin ends session |
| `leaderboard:update` | `{ entries: [{rank, student_name, score, ...}] }` | After each submit |
| `student:submitted` | `{ name, score, total, rank }` | Admin only — who just submitted |
| `error` | `{ message }` | Auth or room error |

**Client → Server events:**

| Event type | When |
|------------|------|
| `ping` | Keep-alive (sent every 25s by client) |

---

## Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Returns status, version, model name |

```json
{ "status": "ok", "version": "3.0.0", "model": "meta-llama/llama-3.1-8b-instruct:free" }
```
