"""
Session Router — quiz rooms, attempts, leaderboard, analytics.
After every submit, broadcasts leaderboard update via WebSocket.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from database.config import get_db
from schemas.session import (
    SessionCreate, SessionOut, JoinSessionRequest,
    AttemptSubmit, AttemptResultOut, AnswerResultOut, LeaderboardEntryOut,
    StudentAttemptHistoryItemOut
)
from crud.session import (
    create_session, get_session_by_code, get_session_by_id,
    start_session, end_session, get_or_create_attempt, get_attempt,
    submit_attempt, get_leaderboard, get_student_attempts
)
from crud.quiz import get_quiz
from utils.dependencies import require_admin, get_current_user
from models.all_models import User, SessionStatus, UserRole
from services.llm_service import resolve_unset_answers
from services.analytics_service import get_session_analytics
from websocket.manager import manager
from websocket.events import evt_leaderboard, evt_student_submitted, evt_quiz_started, evt_quiz_ended
from datetime import datetime, timezone, timedelta
from typing import List

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    quiz = await get_quiz(db, data.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    session = await create_session(db, data.quiz_id, data.max_students)
    return session


@router.post("/join", response_model=SessionOut)
async def join(
    data: JoinSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await get_session_by_code(db, data.room_code.strip())
    if not session:
        raise HTTPException(status_code=404, detail="Room not found. Check the code.")
    if session.status == SessionStatus.completed:
        raise HTTPException(status_code=400, detail="This room has already ended.")
    await get_or_create_attempt(db, session.id, user.id)
    return session


@router.post("/{session_id}/start", response_model=SessionOut)
async def start(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    session = await start_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    quiz = await get_quiz(db, session.quiz_id)

    # Broadcast quiz:started to all clients in the room
    await manager.broadcast(
        session.room_code,
        evt_quiz_started(
            session_id=session.id,
            time_per_q_sec=quiz.time_per_q_sec if quiz else 300,
            total_questions=len(quiz.questions) if quiz else 0,
        )
    )
    return session


@router.post("/{session_id}/submit", response_model=AttemptResultOut)
async def submit(
    session_id: str,
    data: AttemptSubmit,
    auto: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == SessionStatus.completed:
        raise HTTPException(status_code=400, detail="This session has already ended.")

    # The student MUST have already joined this room via a valid room code
    # (POST /sessions/join). We never silently create an attempt here —
    # otherwise any authenticated student could submit against any
    # session_id without ever knowing/entering the room code.
    attempt = await get_attempt(db, session_id, user.id)
    if not attempt:
        raise HTTPException(
            status_code=403,
            detail="You must join this room with a valid room code before submitting.",
        )

    quiz    = await get_quiz(db, session.quiz_id)
    questions = quiz.questions

    # Resolve unset correct answers via LLM before scoring — this is the
    # ONLY place correct answers are ever resolved for scoring purposes.
    await resolve_unset_answers(db, questions)

    # Determine if auto-submission is required by server-authoritative deadline
    total_q = len(questions) or 1
    base_duration_sec = total_q * (quiz.time_per_q_sec or 300)
    started_at_tz = attempt.started_at.replace(tzinfo=timezone.utc) if attempt.started_at.tzinfo is None else attempt.started_at
    deadline = started_at_tz + timedelta(seconds=base_duration_sec)
    if quiz.availability_end:
        end_tz = quiz.availability_end.replace(tzinfo=timezone.utc) if quiz.availability_end.tzinfo is None else quiz.availability_end
        deadline = min(deadline, end_tz)

    now_utc = datetime.now(timezone.utc)
    is_auto = auto or (now_utc > deadline + timedelta(seconds=5))

    attempt, results = await submit_attempt(db, attempt.id, data, questions, auto=is_auto)

    # ── Broadcast real-time updates ───────────────────────────────────────────
    room_code = session.room_code

    # 1. Leaderboard update → everyone in room
    lb_entries = await get_leaderboard(db, session_id)
    lb_payload = [
        {
            "rank":            e.rank,
            "student_name":    e.student_name,
            "score":           e.score,
            "total_marks":     e.total_marks,
            "accuracy":        round(e.accuracy, 3),
            "time_taken_sec":  e.time_taken_sec,
        }
        for e in lb_entries
    ]
    await manager.broadcast(room_code, evt_leaderboard(lb_payload))

    # 2. student:submitted → admin only (shows who just submitted)
    my_entry = next((e for e in lb_entries if e.student_id == user.id), None)
    await manager.broadcast_to_role(
        room_code, "admin",
        evt_student_submitted(
            name=user.name,
            score=attempt.score,
            total=attempt.total_marks,
            rank=my_entry.rank if my_entry else 0,
        )
    )

    return AttemptResultOut(
        id=attempt.id,
        session_id=attempt.session_id,
        student_id=attempt.student_id,
        score=attempt.score,
        total_marks=attempt.total_marks,
        accuracy=attempt.accuracy,
        correct_count=attempt.correct_count,
        incorrect_count=attempt.incorrect_count,
        skipped_count=attempt.skipped_count,
        marked_count=attempt.marked_count,
        total_questions=len(questions),
        attempted_count=attempt.correct_count + attempt.incorrect_count,
        status=attempt.status,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        time_taken_sec=attempt.time_taken_sec,
        rank=attempt.rank,
        results=[AnswerResultOut(**r) for r in results],
    )


@router.get("/attempts/my", response_model=List[StudentAttemptHistoryItemOut])
async def my_attempts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return all completed attempts belonging to the authenticated student."""
    return await get_student_attempts(db, user.id)


@router.get("/my-attempts", response_model=List[StudentAttemptHistoryItemOut])
async def my_attempts_alias(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Alias for /attempts/my."""
    return await get_student_attempts(db, user.id)


@router.get("/{session_id}/leaderboard", response_model=List[LeaderboardEntryOut])
async def leaderboard(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_leaderboard(db, session_id)


@router.get("/{session_id}/analytics")
async def analytics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    student_id = user.id if user.role == UserRole.student else None
    return await get_session_analytics(db, session_id, student_id=student_id)


@router.post("/{session_id}/end", response_model=SessionOut)
async def end(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    session = await end_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Broadcast quiz ended to all in room
    await manager.broadcast(session.room_code, evt_quiz_ended())
    return session


@router.get("/{session_id}/participants")
async def participants(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Return currently connected WebSocket participants for this session."""
    session = await get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "room_code":   session.room_code,
        "participants": manager.get_participants(session.room_code),
        "count":       manager.count(session.room_code),
    }
