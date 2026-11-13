"""
Session Router — attempts, autosave, results, leaderboard, analytics.

Students start tests directly (POST /quizzes/{id}/start-attempt); a session is
an internal container for the attempts of one quiz. The old room-code / live
room flow (join, start, end, WebSocket broadcasts) has been removed.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import re
from database.config import get_db
from schemas.session import (
    AutosaveOut,
    AttemptSubmit, AttemptResultOut, AnswerResultOut, LeaderboardEntryOut,
    StudentAttemptHistoryItemOut
)
from crud.session import (
    get_session_by_id, get_attempt, autosave_attempt,
    submit_attempt, get_leaderboard, get_student_attempts
)
from crud.quiz import get_quiz
from utils.dependencies import get_current_user
from models.all_models import User, SessionStatus, UserRole, AttemptStatus, Attempt
from services.llm_service import resolve_unset_answers
from services.analytics_service import get_session_analytics
from services.response_sheet_service import generate_response_sheet_pdf
from datetime import datetime, timezone, timedelta
from typing import List

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.put("/{session_id}/autosave", response_model=AutosaveOut)
async def autosave(
    session_id: str,
    data: AttemptSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Save in-progress answers without scoring (called every ~30 s by the test page).
    If the browser dies, the student can resume on any device, and an abandoned
    attempt is auto-submitted with these answers after the deadline.
    """
    attempt = await get_attempt(db, session_id, user.id)
    if not attempt:
        raise HTTPException(status_code=404, detail="No attempt for this test")
    if attempt.status != AttemptStatus.in_progress:
        raise HTTPException(status_code=409, detail="This test has already been submitted.")
    session = await get_session_by_id(db, session_id)
    quiz = await get_quiz(db, session.quiz_id) if session else None
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    deadline = _attempt_deadline(attempt, quiz)
    if datetime.now(timezone.utc) > deadline + timedelta(minutes=2):
        raise HTTPException(status_code=409, detail="Time is over for this test.")
    saved = await autosave_attempt(db, attempt, data, {q.id for q in quiz.questions})
    return AutosaveOut(saved=saved, saved_at=datetime.now(timezone.utc))


LATE_GRACE = timedelta(seconds=90)   # network / clock slack for the client's own deadline submit


def _attempt_deadline(attempt, quiz):
    base = int(round(quiz.effective_total_duration_minutes * 60))
    started = attempt.started_at.replace(tzinfo=timezone.utc) if attempt.started_at.tzinfo is None else attempt.started_at
    deadline = started + timedelta(seconds=base)
    if quiz.availability_end:
        end = quiz.availability_end.replace(tzinfo=timezone.utc) if quiz.availability_end.tzinfo is None else quiz.availability_end
        deadline = min(deadline, end)
    return deadline


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

    attempt = await get_attempt(db, session_id, user.id)
    if not attempt:
        raise HTTPException(
            status_code=403,
            detail="You must join this room with a valid room code before submitting.",
        )

    # Idempotent response: If the attempt has already been submitted, return existing result
    if attempt.status != AttemptStatus.in_progress:
        quiz = await get_quiz(db, session.quiz_id)
        attempt, results = await submit_attempt(db, attempt.id, data, quiz.questions, auto=auto)
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
            total_questions=len(quiz.questions),
            attempted_count=attempt.correct_count + attempt.incorrect_count,
            status=attempt.status,
            started_at=attempt.started_at,
            submitted_at=attempt.submitted_at,
            time_taken_sec=attempt.time_taken_sec,
            rank=attempt.rank,
            results=[AnswerResultOut(**r) for r in results],
        )

    if session.status == SessionStatus.completed:
        raise HTTPException(status_code=400, detail="This session has already ended.")

    quiz    = await get_quiz(db, session.quiz_id)
    questions = quiz.questions

    # Resolve unset correct answers via LLM before scoring — this is the
    # ONLY place correct answers are ever resolved for scoring purposes.
    await resolve_unset_answers(db, questions)

    # Server-authoritative deadline (same rule as start-attempt and autosave)
    deadline = _attempt_deadline(attempt, quiz)
    now_utc = datetime.now(timezone.utc)
    is_auto = auto or (now_utc > deadline + timedelta(seconds=5))
    if now_utc > deadline + LATE_GRACE:
        # Too late: ignore the late payload and score what was saved before time ran out
        from models.all_models import Answer
        from schemas.session import AnswerSubmit
        saved = (await db.execute(select(Answer).where(Answer.attempt_id == attempt.id))).scalars().all()
        started = attempt.started_at.replace(tzinfo=timezone.utc) if attempt.started_at.tzinfo is None else attempt.started_at
        data = AttemptSubmit(
            answers=[
                AnswerSubmit(question_id=a.question_id, selected_option=a.selected_option, response_text=a.response_text,
                             marked_for_review=a.marked_for_review, time_taken_sec=a.time_taken_sec or 0)
                for a in saved
            ],
            time_taken_sec=int((deadline - started).total_seconds()),
        )
        is_auto = True

    attempt, results = await submit_attempt(db, attempt.id, data, questions, auto=is_auto)

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


@router.get("/attempts/{attempt_id}/response-sheet-pdf")
async def get_response_sheet_pdf(
    attempt_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Generate and stream an authoritative student response-sheet PDF in memory.
    PDF is generated on-demand without any permanent file storage.
    Available ONLY while the quiz and attempt still exist.
    Students can download ONLY their own response sheet.
    """
    # 1. Fetch attempt with answers
    att_res = await db.execute(
        select(Attempt)
        .options(selectinload(Attempt.answers))
        .where(Attempt.id == attempt_id)
    )
    attempt = att_res.scalar_one_or_none()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz attempt not found or has been deleted"
        )

    # 2. Authorization check: Student can only download their own attempt
    if user.role != UserRole.admin and attempt.student_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only download your own response sheet"
        )

    # 3. Check session
    session = await get_session_by_id(db, attempt.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz session not found or has been deleted"
        )

    # 4. Check quiz exists (critical rule: deleted quiz makes PDF return 404)
    quiz = await get_quiz(db, session.quiz_id)
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The associated quiz has been deleted and its response sheet is no longer accessible"
        )

    # 5. Fetch student user info if downloaded by admin, or use current user
    student_user = user
    if attempt.student_id != user.id:
        student_res = await db.execute(
            select(User).where(User.id == attempt.student_id)
        )
        found_student = student_res.scalar_one_or_none()
        if found_student:
            student_user = found_student

    # 6. Count total participants in this session
    participants_res = await db.execute(
        select(Attempt.id).where(
            Attempt.session_id == attempt.session_id,
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted]),
        )
    )
    participants_count = len(participants_res.scalars().all())

    # 7. Generate in-memory PDF bytes
    try:
        pdf_bytes = generate_response_sheet_pdf(
            attempt=attempt,
            quiz=quiz,
            student_user=student_user,
            total_participants=max(1, participants_count),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate response sheet PDF: {str(e)}"
        )

    # 8. Stream response as attachment
    safe_title = re.sub(r"[^a-zA-Z0-9_\-]", "_", quiz.title)[:30] or "quiz"
    filename = f"response_sheet_{safe_title}_{attempt.id[:8]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


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
