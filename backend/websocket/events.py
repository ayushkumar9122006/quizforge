"""
WebSocket Event Definitions

All events are plain dicts with a "type" key.
Client and server both use the same event shapes.

Server → Client events:
  room:joined          user joined the waiting room
  room:left            user left
  room:participants    full participant list (on connect)
  quiz:started         admin started the quiz
  quiz:ended           quiz ended (time up or admin ended)
  leaderboard:update   new leaderboard snapshot after a submit
  timer:sync           server sends remaining seconds
  student:submitted    a student submitted (admin only)
  error                something went wrong

Client → Server events:
  ping                 keep-alive
"""


def evt_participants(participants: list) -> dict:
    return {"type": "room:participants", "participants": participants}


def evt_joined(user_id: str, name: str, role: str) -> dict:
    return {"type": "room:joined", "user_id": user_id, "name": name, "role": role}


def evt_left(user_id: str, name: str) -> dict:
    return {"type": "room:left", "user_id": user_id, "name": name}


def evt_quiz_started(session_id: str, time_per_q_sec: int, total_questions: int) -> dict:
    return {
        "type": "quiz:started",
        "session_id": session_id,
        "time_per_q_sec": time_per_q_sec,
        "total_questions": total_questions,
    }


def evt_quiz_ended() -> dict:
    return {"type": "quiz:ended"}


def evt_leaderboard(entries: list) -> dict:
    return {"type": "leaderboard:update", "entries": entries}


def evt_timer_sync(remaining_sec: int) -> dict:
    return {"type": "timer:sync", "remaining_sec": remaining_sec}


def evt_student_submitted(name: str, score: int, total: int, rank: int) -> dict:
    return {
        "type": "student:submitted",
        "name": name,
        "score": score,
        "total": total,
        "rank": rank,
    }


def evt_error(message: str) -> dict:
    return {"type": "error", "message": message}
