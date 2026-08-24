"""
Analytics Service — Block 4
Computes session-level and quiz-level analytics.
All results are plain dicts — serializable directly as JSON.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models.all_models import (
    Attempt, Answer, Question, QuizSession,
    AttemptStatus
)
from typing import Any


# ── Session analytics ─────────────────────────────────────────────────────────

async def get_session_analytics(db: AsyncSession, session_id: str) -> dict[str, Any]:
    """Full analytics for one quiz session, including per-student and per-section breakdowns."""
    from models.all_models import User
    from sqlalchemy.orm import selectinload

    attempts_q = await db.execute(
        select(Attempt)
        .options(selectinload(Attempt.student), selectinload(Attempt.answers))
        .where(
            Attempt.session_id == session_id,
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted])
        )
    )
    attempts = list(attempts_q.scalars().all())
    total_submitted = len(attempts)

    if total_submitted == 0:
        return {"total_submitted": 0, "message": "No submissions yet"}

    # Fetch all questions for this session's quiz
    sess_res = await db.execute(select(QuizSession).where(QuizSession.id == session_id))
    quiz_sess = sess_res.scalar_one_or_none()
    questions_map = {}
    if quiz_sess:
        q_res = await db.execute(
            select(Question).where(Question.quiz_id == quiz_sess.quiz_id).order_by(Question.order_index)
        )
        questions_map = {q.id: q for q in q_res.scalars().all()}

    scores      = [a.score for a in attempts]
    total_marks = attempts[0].total_marks if attempts else 1
    times       = [a.time_taken_sec for a in attempts]

    avg_score    = round(sum(scores) / total_submitted, 2)
    highest      = max(scores)
    lowest       = min(scores)
    avg_accuracy = round(avg_score / total_marks, 3) if total_marks else 0
    avg_time     = round(sum(times) / total_submitted, 1)

    # ── Score distribution ────────────────────────────────────────────────────
    buckets = [0] * 5       # 0-20, 21-40, 41-60, 61-80, 81-100
    for s in scores:
        pct    = s / total_marks if total_marks else 0
        bucket = min(int(pct * 5), 4)
        buckets[bucket] += 1

    # ── Per-student breakdown ──────────────────────────────────────────────────
    students_list = []
    for att in sorted(attempts, key=lambda a: (-(a.score or 0), a.time_taken_sec or 0)):
        student_name = att.student.name if att.student else "Student"
        sec_breakdown: dict[str, dict] = {}
        q_breakdown = []

        for ans in (att.answers or []):
            q = questions_map.get(ans.question_id)
            sec_name = q.section if q else "General"
            if sec_name not in sec_breakdown:
                sec_breakdown[sec_name] = {
                    "section": sec_name,
                    "score": 0,
                    "total_marks": 0,
                    "correct": 0,
                    "total_questions": 0,
                    "time_taken_sec": 0,
                }
            sec_breakdown[sec_name]["score"] += ans.marks_awarded or 0
            sec_breakdown[sec_name]["total_marks"] += (q.marks if q else 1)
            sec_breakdown[sec_name]["total_questions"] += 1
            sec_breakdown[sec_name]["time_taken_sec"] += ans.time_taken_sec or 0
            if ans.is_correct:
                sec_breakdown[sec_name]["correct"] += 1

            q_breakdown.append({
                "question_id": ans.question_id,
                "order_index": q.order_index if q else 0,
                "section": sec_name,
                "question_text": (q.text[:60] + "…" if q and len(q.text) > 60 else (q.text or "")) if q else "",
                "selected_option": ans.selected_option,
                "correct_answer": q.correct_answer if q else None,
                "is_correct": ans.is_correct,
                "marks_awarded": ans.marks_awarded,
                "time_taken_sec": ans.time_taken_sec or 0,
            })

        for s_data in sec_breakdown.values():
            s_data["accuracy_pct"] = round((s_data["score"] / s_data["total_marks"]) * 100, 1) if s_data["total_marks"] > 0 else 0

        students_list.append({
            "student_id": att.student_id,
            "student_name": student_name,
            "score": att.score,
            "total_marks": att.total_marks,
            "accuracy_pct": round((att.score / (att.total_marks or 1)) * 100, 1),
            "time_taken_sec": att.time_taken_sec,
            "rank": att.rank,
            "submitted_at": att.submitted_at.isoformat() if att.submitted_at else None,
            "section_breakdown": list(sec_breakdown.values()),
            "question_breakdown": sorted(q_breakdown, key=lambda x: x["order_index"]),
        })

    # ── Per-question stats ─────────────────────────────────────────────────────
    answers_q = await db.execute(
        select(
            Answer.question_id,
            func.count(Answer.id).label("total"),
            func.count(Answer.id).filter(Answer.is_correct == True).label("correct_raw"),
            func.count(Answer.id).filter(Answer.selected_option.is_(None)).label("skipped"),
            func.sum(Answer.time_taken_sec).label("total_time"),
        )
        .join(Attempt, Answer.attempt_id == Attempt.id)
        .where(
            Attempt.session_id == session_id,
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted])
        )
        .group_by(Answer.question_id)
    )
    rows = answers_q.all()

    question_stats = []
    section_map: dict[str, dict] = {}

    for row in rows:
        q = questions_map.get(row.question_id)
        if not q:
            q_res = await db.execute(select(Question).where(Question.id == row.question_id))
            q = q_res.scalar_one_or_none()

        total   = row.total or 1
        correct = int(row.correct_raw or 0)
        skipped = int(row.skipped or 0)
        tot_time = int(row.total_time or 0)
        wrong   = total - correct - skipped
        acc     = round(correct / total, 3)
        sec_name = q.section if q else "General"

        question_stats.append({
            "question_id":   row.question_id,
            "question_text": (q.text[:80] + "…" if q and len(q.text) > 80 else (q.text or "")) if q else "",
            "section":       sec_name,
            "total_answers": total,
            "correct":       correct,
            "wrong":         wrong,
            "skipped":       skipped,
            "accuracy":      acc,
            "accuracy_pct":  round(acc * 100, 1),
            "avg_time_sec":  round(tot_time / total, 1),
        })

        if sec_name not in section_map:
            section_map[sec_name] = {
                "section": sec_name,
                "total_questions": 0,
                "correct": 0,
                "total_answers": 0,
                "total_time_sec": 0,
            }
        section_map[sec_name]["total_questions"] += 1
        section_map[sec_name]["correct"] += correct
        section_map[sec_name]["total_answers"] += total
        section_map[sec_name]["total_time_sec"] += tot_time

    section_stats = []
    for s_info in section_map.values():
        tot_ans = s_info["total_answers"] or 1
        section_stats.append({
            "section": s_info["section"],
            "total_questions": s_info["total_questions"],
            "accuracy_pct": round((s_info["correct"] / tot_ans) * 100, 1),
            "avg_time_sec": round(s_info["total_time_sec"] / tot_ans, 1),
        })

    question_stats.sort(key=lambda x: x["accuracy"])

    return {
        "total_submitted":    total_submitted,
        "average_score":      avg_score,
        "highest_score":      highest,
        "lowest_score":       lowest,
        "total_marks":        total_marks,
        "average_accuracy":   avg_accuracy,
        "average_accuracy_pct": round(avg_accuracy * 100, 1),
        "average_time_sec":   avg_time,
        "score_distribution": {
            "labels": ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"],
            "values": buckets,
        },
        "question_stats":   question_stats,
        "section_stats":    section_stats,
        "students":         students_list,
        "hardest_question": question_stats[0]  if question_stats else None,
        "easiest_question": question_stats[-1] if question_stats else None,
        "most_skipped":     max(question_stats, key=lambda x: x["skipped"],  default=None),
        "completion_rate":  round(total_submitted / max(total_submitted, 1), 3),
    }


# ── Quiz-level analytics (across ALL sessions) ────────────────────────────────

async def get_quiz_analytics(db: AsyncSession, quiz_id: str) -> dict[str, Any]:
    """Aggregate analytics for a quiz across all its sessions."""
    from models.all_models import User
    from sqlalchemy.orm import selectinload

    # All sessions for this quiz
    sess_q = await db.execute(
        select(QuizSession).where(QuizSession.quiz_id == quiz_id)
    )
    sessions     = list(sess_q.scalars().all())
    session_ids  = [s.id for s in sessions]
    total_sessions = len(sessions)

    if not session_ids:
        return {"total_sessions": 0, "message": "No sessions yet"}

    # Fetch all questions for this quiz
    q_res = await db.execute(
        select(Question).where(Question.quiz_id == quiz_id).order_by(Question.order_index)
    )
    questions_map = {q.id: q for q in q_res.scalars().all()}

    # All submitted attempts across all sessions
    att_q = await db.execute(
        select(Attempt)
        .options(selectinload(Attempt.student), selectinload(Attempt.answers))
        .where(
            Attempt.session_id.in_(session_ids),
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted])
        )
    )
    attempts       = list(att_q.scalars().all())
    total_attempts = len(attempts)

    if total_attempts == 0:
        return {
            "total_sessions": total_sessions,
            "total_attempts": 0,
            "total_submitted": 0,
            "message": "No submissions yet",
        }

    scores      = [a.score for a in attempts]
    total_marks = attempts[0].total_marks if attempts else 1
    times       = [a.time_taken_sec for a in attempts]

    avg_score    = round(sum(scores) / total_attempts, 2)
    avg_accuracy = round(avg_score / total_marks, 3) if total_marks else 0
    avg_time     = round(sum(times) / total_attempts, 1)

    # Per-session summary (for trend line)
    session_trend = []
    for s in sessions:
        s_atts = [a for a in attempts if a.session_id == s.id]
        if s_atts:
            s_scores = [a.score for a in s_atts]
            session_trend.append({
                "session_id":  s.id,
                "room_code":   s.room_code,
                "date":        s.created_at.isoformat() if s.created_at else "",
                "count":       len(s_atts),
                "avg_score":   round(sum(s_scores) / len(s_scores), 2),
                "avg_pct":     round((sum(s_scores) / len(s_scores)) / total_marks * 100, 1) if total_marks else 0,
            })

    # Students list
    students_list = []
    for att in sorted(attempts, key=lambda a: (-(a.score or 0), a.time_taken_sec or 0)):
        student_name = att.student.name if att.student else "Student"
        sec_breakdown: dict[str, dict] = {}
        for ans in (att.answers or []):
            q = questions_map.get(ans.question_id)
            sec_name = q.section if q else "General"
            if sec_name not in sec_breakdown:
                sec_breakdown[sec_name] = {
                    "section": sec_name,
                    "score": 0,
                    "total_marks": 0,
                    "correct": 0,
                    "total_questions": 0,
                    "time_taken_sec": 0,
                }
            sec_breakdown[sec_name]["score"] += ans.marks_awarded or 0
            sec_breakdown[sec_name]["total_marks"] += (q.marks if q else 1)
            sec_breakdown[sec_name]["total_questions"] += 1
            sec_breakdown[sec_name]["time_taken_sec"] += ans.time_taken_sec or 0
            if ans.is_correct:
                sec_breakdown[sec_name]["correct"] += 1

        for s_data in sec_breakdown.values():
            s_data["accuracy_pct"] = round((s_data["score"] / s_data["total_marks"]) * 100, 1) if s_data["total_marks"] > 0 else 0

        students_list.append({
            "student_id": att.student_id,
            "student_name": student_name,
            "score": att.score,
            "total_marks": att.total_marks,
            "accuracy_pct": round((att.score / (att.total_marks or 1)) * 100, 1),
            "time_taken_sec": att.time_taken_sec,
            "submitted_at": att.submitted_at.isoformat() if att.submitted_at else None,
            "section_breakdown": list(sec_breakdown.values()),
        })

    # Per-question accuracy across all sessions
    all_att_ids = [a.id for a in attempts]
    if all_att_ids:
        ans_q = await db.execute(
            select(
                Answer.question_id,
                func.count(Answer.id).label("total"),
                func.count(Answer.id).filter(Answer.is_correct == True).label("correct"),
                func.count(Answer.id).filter(Answer.selected_option.is_(None)).label("skipped"),
                func.sum(Answer.time_taken_sec).label("total_time"),
            )
            .where(Answer.attempt_id.in_(all_att_ids))
            .group_by(Answer.question_id)
        )
        q_rows = ans_q.all()
    else:
        q_rows = []

    question_stats = []
    section_map: dict[str, dict] = {}

    for row in q_rows:
        q = questions_map.get(row.question_id)
        if not q:
            q_res = await db.execute(select(Question).where(Question.id == row.question_id))
            q = q_res.scalar_one_or_none()

        total   = row.total or 1
        correct = int(row.correct or 0)
        skipped = int(row.skipped or 0)
        tot_time = int(row.total_time or 0)
        acc     = round(correct / total, 3)
        sec_name = q.section if q else "General"

        question_stats.append({
            "question_id":   row.question_id,
            "question_text": (q.text[:70] + "…" if q and len(q.text) > 70 else (q.text or "")) if q else "",
            "section":       sec_name,
            "total_answers": total,
            "correct":       correct,
            "wrong":         total - correct - skipped,
            "skipped":       skipped,
            "accuracy":      acc,
            "accuracy_pct":  round(acc * 100, 1),
            "avg_time_sec":  round(tot_time / total, 1),
        })

        if sec_name not in section_map:
            section_map[sec_name] = {
                "section": sec_name,
                "total_questions": 0,
                "correct": 0,
                "total_answers": 0,
                "total_time_sec": 0,
            }
        section_map[sec_name]["total_questions"] += 1
        section_map[sec_name]["correct"] += correct
        section_map[sec_name]["total_answers"] += total
        section_map[sec_name]["total_time_sec"] += tot_time

    section_stats = []
    for s_info in section_map.values():
        tot_ans = s_info["total_answers"] or 1
        section_stats.append({
            "section": s_info["section"],
            "total_questions": s_info["total_questions"],
            "accuracy_pct": round((s_info["correct"] / tot_ans) * 100, 1),
            "avg_time_sec": round(s_info["total_time_sec"] / tot_ans, 1),
        })

    question_stats.sort(key=lambda x: x["accuracy"])

    # Score distribution
    buckets = [0] * 5
    for s in scores:
        pct    = s / total_marks if total_marks else 0
        bucket = min(int(pct * 5), 4)
        buckets[bucket] += 1

    return {
        "total_sessions":       total_sessions,
        "total_attempts":       total_attempts,
        "total_submitted":      total_attempts,
        "average_score":        avg_score,
        "highest_score":        max(scores),
        "lowest_score":         min(scores),
        "total_marks":          total_marks,
        "average_accuracy":     avg_accuracy,
        "average_accuracy_pct": round(avg_accuracy * 100, 1),
        "average_time_sec":     avg_time,
        "score_distribution": {
            "labels": ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"],
            "values": buckets,
        },
        "session_trend":    session_trend,
        "question_stats":   question_stats,
        "section_stats":    section_stats,
        "students":         students_list,
        "hardest_question": question_stats[0]  if question_stats else None,
        "easiest_question": question_stats[-1] if question_stats else None,
        "most_skipped":     max(question_stats, key=lambda x: x["skipped"], default=None),
    }
