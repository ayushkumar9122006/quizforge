from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models.all_models import (
    QuizSession, Attempt, Answer, LeaderboardEntry,
    SessionStatus, AttemptStatus, Question
)
from schemas.session import AttemptSubmit
from datetime import datetime
from typing import Optional, List
import random
import string


def generate_room_code() -> str:
    """Generate a unique 6-digit alphanumeric room code."""
    return "".join(random.choices(string.digits, k=6))


async def create_session(db: AsyncSession, quiz_id: str, max_students: int = 100) -> QuizSession:
    # Ensure unique room code
    while True:
        code = generate_room_code()
        existing = await db.execute(
            select(QuizSession).where(QuizSession.room_code == code)
        )
        if not existing.scalar_one_or_none():
            break

    session = QuizSession(
        quiz_id=quiz_id,
        room_code=code,
        max_students=max_students,
    )
    db.add(session)
    await db.flush()
    return session


async def get_session_by_code(db: AsyncSession, room_code: str) -> Optional[QuizSession]:
    result = await db.execute(
        select(QuizSession)
        .options(selectinload(QuizSession.quiz))
        .where(QuizSession.room_code == room_code)
    )
    return result.scalar_one_or_none()


async def get_session_by_id(db: AsyncSession, session_id: str) -> Optional[QuizSession]:
    result = await db.execute(
        select(QuizSession)
        .options(selectinload(QuizSession.quiz))
        .where(QuizSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def start_session(db: AsyncSession, session_id: str) -> Optional[QuizSession]:
    session = await get_session_by_id(db, session_id)
    if not session:
        return None
    session.status = SessionStatus.active
    session.started_at = datetime.utcnow()
    await db.flush()
    return session


async def end_session(db: AsyncSession, session_id: str) -> Optional[QuizSession]:
    session = await get_session_by_id(db, session_id)
    if not session:
        return None
    session.status = SessionStatus.completed
    session.ended_at = datetime.utcnow()
    await db.flush()
    return session


async def get_or_create_attempt(db: AsyncSession, session_id: str, student_id: str) -> Attempt:
    result = await db.execute(
        select(Attempt).where(
            Attempt.session_id == session_id,
            Attempt.student_id == student_id,
        )
    )
    attempt = result.scalar_one_or_none()
    if not attempt:
        attempt = Attempt(session_id=session_id, student_id=student_id)
        db.add(attempt)
        await db.flush()
    return attempt


async def get_attempt(db: AsyncSession, session_id: str, student_id: str) -> Optional[Attempt]:
    """
    Read-only lookup — does NOT create an attempt.
    Used to verify a student actually joined this session (via a valid
    room code, through /sessions/join) before allowing a submission.
    """
    result = await db.execute(
        select(Attempt).where(
            Attempt.session_id == session_id,
            Attempt.student_id == student_id,
        )
    )
    return result.scalar_one_or_none()


async def submit_attempt(
    db: AsyncSession,
    attempt_id: str,
    submission: AttemptSubmit,
    questions: List[Question],
    auto: bool = False,
) -> tuple[Attempt, list[dict]]:
    result = await db.execute(select(Attempt).where(Attempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt:
        raise ValueError("Attempt not found")

    if attempt.status != AttemptStatus.in_progress:
        # Already scored — never re-score. Return the existing state so
        # a duplicate/retried submit is idempotent instead of corrupting
        # previously-recorded marks and leaderboard rank.
        q_lookup = {q.id: q for q in questions}
        existing = await db.execute(
            select(Answer).where(Answer.attempt_id == attempt_id)
        )
        existing_results = []
        for a in existing.scalars().all():
            q = q_lookup.get(a.question_id)
            existing_results.append({
                "question_id":     a.question_id,
                "selected_option": a.selected_option,
                "correct_answer":  q.correct_answer if q else None,
                "is_correct":      a.is_correct,
                "marks_awarded":   a.marks_awarded,
            })
        return attempt, existing_results

    # Build question lookup
    q_map = {q.id: q for q in questions}

    score = 0
    total_marks = sum(q.marks for q in questions)
    answer_results: list[dict] = []

    for ans_data in submission.answers:
        q = q_map.get(ans_data.question_id)
        if not q:
            continue
        is_correct = (
            ans_data.selected_option is not None
            and ans_data.selected_option == q.correct_answer
        )
        marks_awarded = q.marks if is_correct else 0
        score += marks_awarded

        answer = Answer(
            attempt_id=attempt_id,
            question_id=ans_data.question_id,
            selected_option=ans_data.selected_option,
            is_correct=is_correct,
            marks_awarded=marks_awarded,
            time_taken_sec=ans_data.time_taken_sec,
        )
        db.add(answer)

        answer_results.append({
            "question_id":     ans_data.question_id,
            "selected_option": ans_data.selected_option,
            "correct_answer":  q.correct_answer,
            "is_correct":      is_correct,
            "marks_awarded":   marks_awarded,
        })

    attempt.score = score
    attempt.total_marks = total_marks
    attempt.status = AttemptStatus.auto_submitted if auto else AttemptStatus.submitted
    attempt.submitted_at = datetime.utcnow()
    attempt.time_taken_sec = submission.time_taken_sec
    await db.flush()

    # Update leaderboard
    accuracy = score / total_marks if total_marks > 0 else 0.0
    existing_lb = await db.execute(
        select(LeaderboardEntry).where(
            LeaderboardEntry.session_id == attempt.session_id,
            LeaderboardEntry.student_id == attempt.student_id,
        )
    )
    lb = existing_lb.scalar_one_or_none()

    # Get student name
    from crud.user import get_user_by_id
    student = await get_user_by_id(db, attempt.student_id)
    student_name = student.name if student else "Unknown"

    if lb:
        lb.score = score
        lb.total_marks = total_marks
        lb.accuracy = accuracy
        lb.time_taken_sec = submission.time_taken_sec
        lb.submitted_at = datetime.utcnow()
    else:
        lb = LeaderboardEntry(
            session_id=attempt.session_id,
            student_id=attempt.student_id,
            student_name=student_name,
            score=score,
            total_marks=total_marks,
            accuracy=accuracy,
            time_taken_sec=submission.time_taken_sec,
            submitted_at=datetime.utcnow(),
        )
        db.add(lb)

    await db.flush()

    # Recompute all ranks for this session
    await _recompute_ranks(db, attempt.session_id)
    return attempt, answer_results


async def _recompute_ranks(db: AsyncSession, session_id: str) -> None:
    result = await db.execute(
        select(LeaderboardEntry)
        .where(LeaderboardEntry.session_id == session_id)
        .order_by(LeaderboardEntry.score.desc(), LeaderboardEntry.time_taken_sec.asc())
    )
    entries = list(result.scalars().all())
    for i, entry in enumerate(entries, start=1):
        entry.rank = i
    await db.flush()


async def get_leaderboard(db: AsyncSession, session_id: str) -> List[LeaderboardEntry]:
    result = await db.execute(
        select(LeaderboardEntry)
        .where(LeaderboardEntry.session_id == session_id)
        .order_by(LeaderboardEntry.rank.asc())
    )
    return list(result.scalars().all())
