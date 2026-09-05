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

    score = 0.0
    total_marks = sum(float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0)) for q in questions)
    answer_results: list[dict] = []

    for ans_data in submission.answers:
        q = q_map.get(ans_data.question_id)
        if not q:
            continue
        pos = float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0))
        neg = float(getattr(q, "negative_marks", None) if getattr(q, "negative_marks", None) is not None else 0.0)

        if ans_data.selected_option is None:
            is_correct = False
            marks_awarded = 0.0
        elif ans_data.selected_option == q.correct_answer:
            is_correct = True
            marks_awarded = pos
        else:
            is_correct = False
            marks_awarded = -neg

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
    accuracy = max(0.0, score / total_marks) if total_marks > 0 else 0.0
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


async def get_student_attempts(db: AsyncSession, student_id: str) -> List[dict]:
    """
    Returns only completed/submitted attempts belonging strictly to student_id.
    """
    from models.all_models import Quiz, Question, Option, QuizSession
    result = await db.execute(
        select(Attempt)
        .options(
            selectinload(Attempt.session)
            .selectinload(QuizSession.quiz)
            .selectinload(Quiz.questions)
            .selectinload(Question.options),
            selectinload(Attempt.answers),
        )
        .where(
            Attempt.student_id == student_id,
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted]),
        )
        .order_by(Attempt.submitted_at.desc())
    )
    attempts = list(result.scalars().all())
    items = []
    for att in attempts:
        quiz = att.session.quiz if att.session else None
        if not quiz:
            continue
        questions = quiz.questions or []
        q_map = {q.id: q for q in questions}

        answers_dict = {}
        question_times_dict = {}
        for ans in (att.answers or []):
            q = q_map.get(ans.question_id)
            if q:
                idx = q.order_index
                answers_dict[idx] = ans.selected_option
                question_times_dict[idx] = ans.time_taken_sec

        sections = sorted(list(set(q.section or "General" for q in questions)))
        sec_breakdown = []
        for sec in sections:
            sec_qs = [q for q in questions if (q.section or "General") == sec]
            sec_ans = [a for a in (att.answers or []) if q_map.get(a.question_id) and (q_map[a.question_id].section or "General") == sec]
            sec_correct = sum(1 for a in sec_ans if a.is_correct)
            sec_time = sum(a.time_taken_sec or 0 for a in sec_ans)
            sec_score = sum(a.marks_awarded or 0.0 for a in sec_ans)
            sec_total_marks = sum(float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0)) for q in sec_qs)
            sec_breakdown.append({
                "name": sec,
                "section": sec,
                "total": len(sec_qs),
                "correct": sec_correct,
                "score": sec_score,
                "totalMarks": sec_total_marks,
                "timeSpent": sec_time,
                "accuracyPct": round((sec_correct / len(sec_qs)) * 100) if sec_qs else 0,
            })

        resolved_questions = []
        for q in questions:
            user_ans_obj = next((a for a in (att.answers or []) if a.question_id == q.id), None)
            pos_m = float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0))
            neg_m = float(getattr(q, "negative_marks", None) if getattr(q, "negative_marks", None) is not None else 0.0)
            resolved_questions.append({
                "id": q.id,
                "text": q.text,
                "qImage": q.question_image,
                "section": q.section,
                "correct": q.correct_answer,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
                "marks": pos_m,
                "positive_marks": pos_m,
                "negative_marks": neg_m,
                "diagram": q.diagram,
                "isCorrect": user_ans_obj.is_correct if user_ans_obj else False,
                "userAnswer": user_ans_obj.selected_option if user_ans_obj else None,
                "marksAwarded": user_ans_obj.marks_awarded if user_ans_obj else 0.0,
                "timeSpent": user_ans_obj.time_taken_sec if user_ans_obj else 0,
                "options": [
                    {"type": "image", "src": opt.image} if opt.content_type == "image" else opt.text
                    for opt in sorted(q.options or [], key=lambda o: o.order_index)
                ],
            })

        tot_m = float(att.total_marks or sum(float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0)) for q in questions) or 1.0)
        pct = round((float(att.score) / tot_m) * 100, 1) if tot_m > 0 else 0.0

        items.append({
            "id": att.id,
            "session_id": att.session_id,
            "student_id": att.student_id,
            "quiz_id": quiz.id,
            "quiz_title": quiz.title,
            "quizTitle": quiz.title,
            "score": float(att.score),
            "total_marks": tot_m,
            "totalMarks": tot_m,
            "totalQ": len(questions),
            "percentage": pct,
            "status": att.status,
            "auto": att.status == AttemptStatus.auto_submitted,
            "started_at": att.started_at,
            "submitted_at": att.submitted_at,
            "date": att.submitted_at.isoformat() if att.submitted_at else att.started_at.isoformat(),
            "time_taken_sec": att.time_taken_sec,
            "totalTimeSpent": att.time_taken_sec,
            "rank": att.rank,
            "has_solution_pdf": bool(quiz.solution_pdf),
            "solution_pdf": quiz.solution_pdf,
            "solution_pdf_name": quiz.solution_pdf_name,
            "questions": resolved_questions,
            "answers": answers_dict,
            "section_breakdown": sec_breakdown,
            "sectionBreakdown": sec_breakdown,
            "question_times": question_times_dict,
            "questionTimes": question_times_dict,
        })
    return items


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
