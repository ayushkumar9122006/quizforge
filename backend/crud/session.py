from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from models.all_models import (
    QuizSession, Attempt, Answer, LeaderboardEntry,
    SessionStatus, AttemptStatus, Question
)
from schemas.session import AttemptSubmit
from datetime import datetime
from typing import Optional, List
import asyncio
import json
import math
import re


def _pos_neg(q) -> tuple[float, float]:
    pos = float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0))
    neg = float(getattr(q, "negative_marks", None) if getattr(q, "negative_marks", None) is not None else 0.0)
    return pos, neg


def numerical_keys(raw) -> list:
    """Accepted values of a numerical key: "12.5" → [12.5]; "41.56 or 42" → [41.56, 42.0]."""
    out = []
    for part in re.split(r"\s*(?:\||\bor\b|;)\s*", str(raw or ""), flags=re.IGNORECASE):
        m = re.search(r"[-+]?\d+(?:\.\d+)?", part)
        if m:
            try:
                out.append(float(m.group(0)))
            except ValueError:
                pass
    return out


def has_answer_key(q) -> bool:
    """Whether a question has a usable answer key for its type."""
    t = getattr(q, "question_type", "single_correct") or "single_correct"
    raw = str(getattr(q, "raw_answer", None) or "").strip()
    if t == "numerical":
        return bool(re.search(r"[-+]?\d+(?:\.\d+)?", raw))
    if t == "multi_correct":
        return bool(re.search(r"\b[A-Fa-f0-9]\b", raw)) or q.correct_answer is not None
    return q.correct_answer is not None or (len(raw) == 1 and raw.upper() in "ABCDEF")


def evaluate_answer(q, sel_opt, resp_text) -> dict:
    """
    Score one answer exactly like a test submission (shared by tests, the mistake
    notebook and practice sets).
    Returns {"kind": correct|partial|wrong|skipped, "is_correct": bool, "marks": float}.
    """
    pos, neg = _pos_neg(q)
    q_type = getattr(q, "question_type", "single_correct") or "single_correct"

    if not has_answer_key(q):
        # No key yet: never penalise. Counted once the admin sets the key (all attempts re-score).
        return {"kind": "ungraded", "is_correct": False, "marks": 0.0}

    if q_type == "numerical":
        if resp_text is None or str(resp_text).strip() == "":
            return {"kind": "skipped", "is_correct": False, "marks": 0.0}
        val_str = str(resp_text).strip()
        # at most 2 digits after the decimal point
        dec_match = re.search(r"\.(\d+)", val_str)
        student_val = None
        if not (dec_match and len(dec_match.group(1)) > 2):
            try:
                student_val = float(val_str)
            except ValueError:
                student_val = None
        if student_val is None:
            return {"kind": "wrong", "is_correct": False, "marks": -neg}
        accepted = numerical_keys(q.raw_answer)
        if any(abs(student_val - v) <= 0.01 + 1e-7 for v in accepted):
            return {"kind": "correct", "is_correct": True, "marks": pos}
        return {"kind": "wrong", "is_correct": False, "marks": -neg}

    if q_type == "multi_correct":
        selected_set = set()
        if resp_text is not None and str(resp_text).strip() != "":
            try:
                parsed = json.loads(resp_text)
                if isinstance(parsed, list):
                    for x in parsed:
                        if isinstance(x, int):
                            selected_set.add(x)
                        elif isinstance(x, str) and x.strip().isdigit():
                            selected_set.add(int(x.strip()))
                        elif isinstance(x, str) and len(x.strip()) == 1 and x.strip().upper() in "ABCDEF":
                            selected_set.add(ord(x.strip().upper()) - ord('A'))
            except Exception:
                for t in re.findall(r"\b([A-Fa-f0-9])\b", str(resp_text)):
                    selected_set.add(int(t) if t.isdigit() else ord(t.upper()) - ord('A'))
        if sel_opt is not None:
            selected_set.add(sel_opt)
        if not selected_set:
            return {"kind": "skipped", "is_correct": False, "marks": 0.0}
        correct_set = set()
        if q.raw_answer:
            for l in re.findall(r"\b([A-Fa-f0-9])\b", str(q.raw_answer)):
                correct_set.add(int(l) if l.isdigit() else ord(l.upper()) - ord('A'))
        if not correct_set and q.correct_answer is not None:
            correct_set.add(q.correct_answer)
        if selected_set - correct_set:
            # any wrong option selected
            return {"kind": "wrong", "is_correct": False, "marks": -(neg if neg > 0 else 1.0)}
        tot_corr = len(correct_set) if correct_set else 1
        marks = float(math.floor(pos * len(selected_set & correct_set) / tot_corr))
        if selected_set == correct_set:
            return {"kind": "correct", "is_correct": True, "marks": marks}
        return {"kind": "partial", "is_correct": False, "marks": marks}

    # single correct, match the column, assertion-reason
    if sel_opt is None and (resp_text is None or str(resp_text).strip() == ""):
        return {"kind": "skipped", "is_correct": False, "marks": 0.0}
    user_idx = sel_opt
    if user_idx is None and resp_text is not None:
        t = str(resp_text).strip()
        if t.isdigit():
            user_idx = int(t)
        elif len(t) == 1 and t.upper() in "ABCDEF":
            user_idx = ord(t.upper()) - ord('A')
    corr_idx = q.correct_answer
    if corr_idx is None and q.raw_answer and len(str(q.raw_answer).strip()) == 1 and str(q.raw_answer).strip().upper() in "ABCDEF":
        corr_idx = ord(str(q.raw_answer).strip().upper()) - ord('A')
    if user_idx is not None and corr_idx is not None and user_idx == corr_idx:
        return {"kind": "correct", "is_correct": True, "marks": pos}
    return {"kind": "wrong", "is_correct": False, "marks": -neg}


async def get_session_by_id(db: AsyncSession, session_id: str) -> Optional[QuizSession]:
    result = await db.execute(
        select(QuizSession)
        .options(selectinload(QuizSession.quiz))
        .where(QuizSession.id == session_id)
    )
    return result.scalar_one_or_none()


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
    # 1. Lock the attempt row with SELECT ... FOR UPDATE to serialize concurrent submissions
    result = await db.execute(
        select(Attempt).where(Attempt.id == attempt_id).with_for_update()
    )
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
                "question_id":       a.question_id,
                "selected_option":   a.selected_option,
                "response_text":     getattr(a, "response_text", None),
                "marked_for_review": getattr(a, "marked_for_review", False),
                "correct_answer":    q.correct_answer if q else None,
                "is_correct":        a.is_correct,
                "marks_awarded":     a.marks_awarded,
            })
        return attempt, existing_results

    # Build question lookup
    q_map = {q.id: q for q in questions}

    # Atomically clear any existing Answer rows for this attempt before inserting
    await db.execute(delete(Answer).where(Answer.attempt_id == attempt_id))

    score = 0.0
    # Questions without an answer key are dropped from the total until the key is set
    total_marks = sum(_pos_neg(q)[0] for q in questions if has_answer_key(q))
    answer_results: list[dict] = []
    kinds: dict[str, str] = {}
    correct_count = 0
    incorrect_count = 0
    skipped_count = 0
    marked_count = 0
    attempted_count = 0

    for ans_data in submission.answers:
        q = q_map.get(ans_data.question_id)
        if not q:
            continue
        is_marked = bool(getattr(ans_data, "marked_for_review", False))
        if is_marked:
            marked_count += 1
        ev = evaluate_answer(q, getattr(ans_data, "selected_option", None), getattr(ans_data, "response_text", None))
        is_correct, marks_awarded = ev["is_correct"], ev["marks"]
        kinds[q.id] = ev["kind"]
        if ev["kind"] == "ungraded":
            pass  # not scored, not counted
        elif ev["kind"] == "skipped":
            skipped_count += 1
        else:
            attempted_count += 1
            if ev["kind"] == "correct":
                correct_count += 1
            elif ev["kind"] == "wrong":
                incorrect_count += 1
            # "partial" (multi-correct, only correct options chosen) counts as neither, as before
        score += marks_awarded

        answer = Answer(
            attempt_id=attempt_id,
            question_id=ans_data.question_id,
            selected_option=ans_data.selected_option,
            response_text=getattr(ans_data, "response_text", None),
            marked_for_review=is_marked,
            is_correct=is_correct,
            marks_awarded=marks_awarded,
            time_taken_sec=ans_data.time_taken_sec,
        )
        db.add(answer)

        answer_results.append({
            "question_id":       ans_data.question_id,
            "selected_option":   ans_data.selected_option,
            "response_text":     getattr(ans_data, "response_text", None),
            "marked_for_review": is_marked,
            "correct_answer":    q.correct_answer,
            "raw_answer":        q.raw_answer,
            "is_correct":        is_correct,
            "marks_awarded":     marks_awarded,
        })

    accuracy = round((correct_count / attempted_count) * 100, 1) if attempted_count > 0 else 0.0

    attempt.score = score
    attempt.total_marks = total_marks
    attempt.accuracy = accuracy
    attempt.correct_count = correct_count
    attempt.incorrect_count = incorrect_count
    attempt.skipped_count = skipped_count
    attempt.marked_count = marked_count
    attempt.status = AttemptStatus.auto_submitted if auto else AttemptStatus.submitted
    attempt.submitted_at = datetime.utcnow()
    attempt.time_taken_sec = submission.time_taken_sec
    try:
        await db.flush()
    except IntegrityError:
        # Concurrent submit race resolved by database unique constraint:
        # Re-query the committed attempt and return its existing results idempotently
        await db.rollback()
        existing_att = None
        for _ in range(20):
            await asyncio.sleep(0.05)
            await db.rollback()
            db.expire_all()
            existing_att = (await db.execute(select(Attempt).where(Attempt.id == attempt_id))).scalar_one_or_none()
            if existing_att and existing_att.status != AttemptStatus.in_progress:
                break
        if existing_att:
            q_lookup = {q.id: q for q in questions}
            existing = await db.execute(
                select(Answer).where(Answer.attempt_id == attempt_id)
            )
            existing_results = []
            for a in existing.scalars().all():
                q = q_lookup.get(a.question_id)
                existing_results.append({
                    "question_id":       a.question_id,
                    "selected_option":   a.selected_option,
                    "response_text":     getattr(a, "response_text", None),
                    "marked_for_review": getattr(a, "marked_for_review", False),
                    "correct_answer":    q.correct_answer if q else None,
                    "is_correct":        a.is_correct,
                    "marks_awarded":     a.marks_awarded,
                })
            return existing_att, existing_results
        raise

    # Mistake notebook: every wrong / partial / skipped question (incl. ones never answered)
    try:
        from services.notebook_service import record_mistakes
        for q in questions:
            kinds.setdefault(q.id, "skipped")
        kinds = {qid: k for qid, k in kinds.items() if qid in {q.id for q in questions if has_answer_key(q)}}
        if questions:
            async with db.begin_nested():  # savepoint: a notebook error can't poison the submission
                await record_mistakes(db, attempt.student_id, questions[0].quiz_id, attempt.id, kinds)
    except Exception as e:  # never block a submission on the notebook
        print(f"[notebook] could not record mistakes: {e}")

    # Update leaderboard
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

    # Recompute all ranks for this session with deterministic tie breaking
    await _recompute_ranks(db, attempt.session_id)
    await db.commit()
    return attempt, answer_results


async def finalize_expired_attempts_for_student(db: AsyncSession, student_id: str):
    """
    Checks for any in_progress attempts for this student whose deadline has passed,
    and automatically finalizes them as auto_submitted.
    """
    from datetime import datetime, timezone, timedelta
    from models.all_models import Quiz, QuizSession, Option, Question
    from schemas.session import AttemptSubmit, AnswerSubmit
    now = datetime.now(timezone.utc)

    res = await db.execute(
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
            Attempt.status == AttemptStatus.in_progress,
        )
    )
    in_prog = list(res.scalars().all())
    for att in in_prog:
        quiz = att.session.quiz if att.session else None
        if not quiz:
            continue
        total_q = len(quiz.questions) or 1
        base_dur = total_q * (quiz.time_per_q_sec or 300)
        started_at = att.started_at.replace(tzinfo=timezone.utc) if att.started_at.tzinfo is None else att.started_at
        deadline = started_at + timedelta(seconds=base_dur)
        if quiz.availability_end:
            end_tz = quiz.availability_end.replace(tzinfo=timezone.utc) if quiz.availability_end.tzinfo is None else quiz.availability_end
            deadline = min(deadline, end_tz)

        if now >= deadline + timedelta(minutes=2):
            saved_answers = att.answers or []
            if not saved_answers:
                # SAFETY: If no answers were ever saved to the database, do not immediately
                # auto-submit with answers=[] within a 30-minute grace window of the deadline.
                # This protects students whose submit failed due to token expiration or network drop,
                # allowing them to log back in and submit the answers preserved in their browser.
                # Only if the attempt is expired by more than 30 minutes (abandoned attempt)
                # do we finalize it.
                if now < deadline + timedelta(minutes=30):
                    continue

            sub = AttemptSubmit(
                answers=[
                    AnswerSubmit(
                        question_id=a.question_id,
                        selected_option=a.selected_option,
                        marked_for_review=a.marked_for_review,
                        response_text=a.response_text,
                        time_taken_sec=a.time_taken_sec or 0,
                    )
                    for a in saved_answers
                ],
                time_taken_sec=min(int((now - started_at).total_seconds()), int((deadline - started_at).total_seconds())),
            )
            await submit_attempt(db, att.id, sub, quiz.questions, auto=True)


async def get_student_attempts(db: AsyncSession, student_id: str) -> List[dict]:
    """
    Returns only completed/submitted attempts belonging strictly to student_id.
    """
    await finalize_expired_attempts_for_student(db, student_id)
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
                user_val = ans.response_text if (ans.response_text is not None and ans.response_text != "") else ans.selected_option
                answers_dict[idx] = user_val
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
            user_ans_val = (user_ans_obj.response_text if (user_ans_obj and user_ans_obj.response_text is not None and user_ans_obj.response_text != "") else (user_ans_obj.selected_option if user_ans_obj else None))
            resolved_questions.append({
                "id": q.id,
                "text": q.text,
                "qImage": q.question_image,
                "section": q.section,
                "correct": q.correct_answer,
                "correct_answer": q.correct_answer,
                "raw_answer": q.raw_answer,
                "question_type": q.question_type or "single_correct",
                "explanation": q.explanation,
                "marks": pos_m,
                "positive_marks": pos_m,
                "negative_marks": neg_m,
                "diagram": q.diagram,
                "isCorrect": user_ans_obj.is_correct if user_ans_obj else False,
                "userAnswer": user_ans_val,
                "marked_for_review": user_ans_obj.marked_for_review if user_ans_obj else False,
                "response_text": user_ans_obj.response_text if user_ans_obj else None,
                "marksAwarded": user_ans_obj.marks_awarded if user_ans_obj else 0.0,
                "timeSpent": user_ans_obj.time_taken_sec if user_ans_obj else 0,
                "options": [
                    {"type": "image", "src": opt.image} if opt.content_type == "image" else opt.text
                    for opt in sorted(q.options or [], key=lambda o: o.order_index)
                ],
            })

        tot_m = float(att.total_marks or sum(float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0)) for q in questions) or 1.0)
        pct = round((float(att.score) / tot_m) * 100, 1) if tot_m > 0 else 0.0

        participants_count = len(
            (
                await db.execute(
                    select(Attempt.id).where(
                        Attempt.session_id == att.session_id,
                        Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted]),
                    )
                )
            ).scalars().all()
        )

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
            "total_questions": len(questions),
            "attempted_count": att.correct_count + att.incorrect_count,
            "correct_count": att.correct_count,
            "incorrect_count": att.incorrect_count,
            "skipped_count": att.skipped_count,
            "marked_count": att.marked_count,
            "accuracy": att.accuracy,
            "percentage": pct,
            "status": att.status,
            "auto": att.status == AttemptStatus.auto_submitted,
            "started_at": att.started_at,
            "submitted_at": att.submitted_at,
            "date": att.submitted_at.isoformat() if att.submitted_at else att.started_at.isoformat(),
            "time_taken_sec": att.time_taken_sec,
            "totalTimeSpent": att.time_taken_sec,
            "rank": att.rank,
            "total_participants": max(1, participants_count),
            "has_solution_pdf": bool(quiz.solution_pdf),
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
        .order_by(
            LeaderboardEntry.score.desc(),
            LeaderboardEntry.time_taken_sec.asc(),
            LeaderboardEntry.submitted_at.asc(),
            LeaderboardEntry.student_id.asc(),
        )
    )
    entries = list(result.scalars().all())
    for i, entry in enumerate(entries, start=1):
        entry.rank = i
        att_res = await db.execute(
            select(Attempt).where(
                Attempt.session_id == session_id,
                Attempt.student_id == entry.student_id,
                Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted]),
            )
        )
        att = att_res.scalar_one_or_none()
        if att:
            att.rank = i
    await db.flush()


async def get_leaderboard(db: AsyncSession, session_id: str) -> List[LeaderboardEntry]:
    result = await db.execute(
        select(LeaderboardEntry)
        .where(LeaderboardEntry.session_id == session_id)
        .order_by(LeaderboardEntry.rank.asc())
    )
    return list(result.scalars().all())


async def has_finished_quiz(db: AsyncSession, student_id: str, quiz_id: str) -> bool:
    """True once the student has a submitted / auto-submitted attempt for this quiz."""
    res = await db.execute(
        select(Attempt.id)
        .join(QuizSession, Attempt.session_id == QuizSession.id)
        .where(
            QuizSession.quiz_id == quiz_id,
            Attempt.student_id == student_id,
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted]),
        )
        .limit(1)
    )
    return res.first() is not None


async def autosave_attempt(db: AsyncSession, attempt: Attempt, submission: AttemptSubmit, valid_question_ids: set) -> int:
    """Replace the attempt's saved (unscored) answers with the latest snapshot."""
    await db.execute(delete(Answer).where(Answer.attempt_id == attempt.id))
    n = 0
    for a in submission.answers:
        if a.question_id not in valid_question_ids:
            continue
        db.add(Answer(
            attempt_id=attempt.id,
            question_id=a.question_id,
            selected_option=a.selected_option,
            response_text=a.response_text,
            marked_for_review=bool(a.marked_for_review),
            is_correct=False,
            marks_awarded=0.0,
            time_taken_sec=a.time_taken_sec or 0,
        ))
        n += 1
    attempt.time_taken_sec = int(submission.time_taken_sec or 0)
    await db.flush()
    return n


async def rescore_quiz(db: AsyncSession, quiz_id: str) -> int:
    """
    Re-score every submitted attempt of a quiz with the current answer keys (used
    after an admin sets a missing key or corrects a wrong one), then refresh
    leaderboards and ranks. Returns the number of attempts re-scored.
    """
    from models.all_models import Quiz
    quiz = (await db.execute(
        select(Quiz).options(selectinload(Quiz.questions)).where(Quiz.id == quiz_id)
    )).scalar_one_or_none()
    if not quiz:
        return 0
    q_map = {q.id: q for q in quiz.questions}
    total_marks = sum(_pos_neg(q)[0] for q in quiz.questions if has_answer_key(q))
    attempts = (await db.execute(
        select(Attempt).options(selectinload(Attempt.answers))
        .join(QuizSession, Attempt.session_id == QuizSession.id)
        .where(
            QuizSession.quiz_id == quiz_id,
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted]),
        )
    )).scalars().all()
    sessions = set()
    for att in attempts:
        score = 0.0
        correct = incorrect = skipped = attempted = 0
        kinds: dict[str, str] = {}
        seen = set()
        for ans in att.answers:
            q = q_map.get(ans.question_id)
            if not q:
                continue
            seen.add(q.id)
            ev = evaluate_answer(q, ans.selected_option, ans.response_text)
            ans.is_correct, ans.marks_awarded = ev["is_correct"], ev["marks"]
            kinds[q.id] = ev["kind"]
            if ev["kind"] == "ungraded":
                continue
            if ev["kind"] == "skipped":
                skipped += 1
                continue
            attempted += 1
            correct += ev["kind"] == "correct"
            incorrect += ev["kind"] == "wrong"
            score += ev["marks"]
        for q in quiz.questions:  # questions the student never saw an answer row for
            if q.id not in seen and has_answer_key(q):
                skipped += 1
                kinds[q.id] = "skipped"
        att.score = score
        att.total_marks = total_marks
        att.correct_count, att.incorrect_count, att.skipped_count = correct, incorrect, skipped
        att.accuracy = round((correct / attempted) * 100, 1) if attempted else 0.0
        lb = (await db.execute(select(LeaderboardEntry).where(
            LeaderboardEntry.session_id == att.session_id, LeaderboardEntry.student_id == att.student_id
        ))).scalar_one_or_none()
        if lb:
            lb.score, lb.total_marks, lb.accuracy = score, total_marks, att.accuracy
        sessions.add(att.session_id)
        try:
            from services.notebook_service import record_mistakes
            async with db.begin_nested():
                await record_mistakes(db, att.student_id, quiz_id, att.id,
                                      {k: v for k, v in kinds.items() if has_answer_key(q_map[k])}, reopen=False)
        except Exception as e:
            print(f"[notebook] rescore capture failed: {e}")
    quiz.total_marks = total_marks
    await db.flush()
    for sid in sessions:
        await _recompute_ranks(db, sid)
    return len(attempts)
