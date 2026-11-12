"""
Mistake notebook + "practice my weak chapters".

Mistake notebook
  • Every wrong / partially-correct / skipped question from a submitted test (or a
    practice set) is collected automatically, grouped by subject → chapter.
  • A new mistake is due immediately. After each re-attempt it comes back on a
    spaced schedule: 3, 7, then 21 days (by review number). A wrong re-attempt
    brings it back in 3 days and resets the count.
  • Mastered after two correct re-attempts in a row. A fresh mistake on the same
    question in a later test re-opens it.

Practice sets
  • 15–20 questions from the student's 3 weakest chapters (from progress analytics),
    untimed, instant feedback; never counted in rank, percentile or score trend.
  • Only questions from tests the student has finished, or whose window has closed,
    are used — practice must never reveal answers of a test that is still open.
"""
from __future__ import annotations

import random
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.all_models import (
    Answer, Attempt, AttemptStatus, MistakeItem, MistakeReview, PracticeAnswer, PracticeSet,
    Question, Quiz, QuizSession, QuizStatus,
)

INTERVALS_DAYS = [3, 7, 21]
MASTERY_STREAK = 2
MISTAKE_KINDS = ("wrong", "partial", "skipped")
DONE = [AttemptStatus.submitted.value, AttemptStatus.auto_submitted.value]
PRACTICE_SIZE, PRACTICE_MIN, PRACTICE_MAX = 18, 15, 20


def _now() -> datetime:
    return datetime.utcnow()


# ── shared payloads ───────────────────────────────────────────────────────────

def question_payload(q: Question) -> dict:
    """Student-safe question (no answer key)."""
    return {
        "id": q.id,
        "text": q.text,
        "question_image": q.question_image,
        "diagram": q.diagram,
        "question_type": q.question_type or "single_correct",
        "match_data": q.match_data,
        "subject": q.subject,
        "chapter": q.chapter,
        "positive_marks": q.positive_marks,
        "negative_marks": q.negative_marks,
        "options": [
            {"order_index": o.order_index, "text": o.text, "image": o.image, "content_type": o.content_type}
            for o in sorted(q.options or [], key=lambda o: o.order_index)
        ],
    }


def answer_reveal(q: Question) -> dict:
    exp = q.explanation if q.explanation and not str(q.explanation).startswith("PDF Page") else None
    return {"correct_answer": q.correct_answer, "raw_answer": q.raw_answer, "explanation": exp}


def _kind_of(ans: Optional[Answer]) -> str:
    if ans is None:
        return "skipped"
    attempted = ans.selected_option is not None or (ans.response_text not in (None, "", "[]"))
    if not attempted:
        return "skipped"
    if ans.is_correct:
        return "correct"
    return "partial" if (ans.marks_awarded or 0) > 0 else "wrong"


# ── capture ───────────────────────────────────────────────────────────────────

async def record_mistakes(db: AsyncSession, student_id: str, quiz_id: str, attempt_id: Optional[str],
                          kinds: dict[str, str], reopen: bool = True) -> int:
    """
    Upsert notebook items for {question_id: kind}. Mistakes (wrong/partial/skipped)
    create or (if reopen) re-open items; correct answers leave existing items alone.
    """
    misses = {qid: k for qid, k in kinds.items() if k in MISTAKE_KINDS}
    if not misses:
        return 0
    existing = {
        m.question_id: m for m in (await db.execute(
            select(MistakeItem).where(MistakeItem.student_id == student_id, MistakeItem.question_id.in_(list(misses)))
        )).scalars().all()
    }
    now = _now()
    n = 0
    for qid, kind in misses.items():
        item = existing.get(qid)
        if item is None:
            db.add(MistakeItem(
                student_id=student_id, question_id=qid, quiz_id=quiz_id, source_attempt_id=attempt_id,
                origin=kind, status="open", correct_streak=0, review_count=0, next_due_at=now,
            ))
            n += 1
        elif reopen:
            item.status = "open"
            item.correct_streak = 0
            item.next_due_at = now
            item.origin = kind
            item.source_attempt_id = attempt_id or item.source_attempt_id
            n += 1
    await db.flush()
    return n


async def sync_from_history(db: AsyncSession, student_id: str) -> int:
    """Backfill the notebook from tests submitted before it existed (never re-opens)."""
    attempts = (await db.execute(
        select(Attempt.id, QuizSession.quiz_id)
        .join(QuizSession, Attempt.session_id == QuizSession.id)
        .where(Attempt.student_id == student_id, Attempt.status.in_(DONE))
    )).all()
    if not attempts:
        return 0
    known = set((await db.execute(
        select(MistakeItem.question_id).where(MistakeItem.student_id == student_id)
    )).scalars().all())
    quiz_ids = list({a.quiz_id for a in attempts})
    from crud.session import has_answer_key
    q_by_quiz = defaultdict(list)
    for q in (await db.execute(select(Question).where(Question.quiz_id.in_(quiz_ids)))).scalars().all():
        if has_answer_key(q):
            q_by_quiz[q.quiz_id].append(q.id)
    answers = defaultdict(dict)
    for a in (await db.execute(select(Answer).where(Answer.attempt_id.in_([x.id for x in attempts])))).scalars().all():
        answers[a.attempt_id][a.question_id] = a
    added = 0
    for att_id, quiz_id in attempts:
        kinds = {
            qid: _kind_of(answers[att_id].get(qid))
            for qid in q_by_quiz[quiz_id] if qid not in known
        }
        added += await record_mistakes(db, student_id, quiz_id, att_id, kinds, reopen=False)
        known |= set(kinds)
    return added


# ── notebook views ────────────────────────────────────────────────────────────

async def notebook_summary(db: AsyncSession, student_id: str) -> dict:
    await sync_from_history(db, student_id)
    now = _now()
    rows = (await db.execute(
        select(MistakeItem.status, MistakeItem.next_due_at, MistakeItem.origin, Question.subject, Question.chapter)
        .join(Question, Question.id == MistakeItem.question_id)
        .where(MistakeItem.student_id == student_id)
    )).all()
    chapters: dict[tuple, dict] = {}
    totals = {"open": 0, "due": 0, "mastered": 0}
    next_due = None
    for status, due_at, origin, subject, chapter in rows:
        key = (subject or "Other", chapter or "Untagged")
        c = chapters.setdefault(key, {"subject": key[0], "chapter": key[1], "open": 0, "due": 0, "mastered": 0, "wrong": 0, "skipped": 0})
        if status == "mastered":
            c["mastered"] += 1
            totals["mastered"] += 1
            continue
        c["open"] += 1
        totals["open"] += 1
        c["wrong" if origin != "skipped" else "skipped"] += 1
        if due_at <= now:
            c["due"] += 1
            totals["due"] += 1
        elif next_due is None or due_at < next_due:
            next_due = due_at
    order = {"Physics": 0, "Chemistry": 1, "Mathematics": 2}
    return {
        **totals,
        "next_due_at": next_due,
        "chapters": sorted(chapters.values(), key=lambda c: (-c["due"], -c["open"], order.get(c["subject"], 9), c["chapter"])),
        "schedule_days": INTERVALS_DAYS,
        "mastery_streak": MASTERY_STREAK,
    }


async def due_items(db: AsyncSession, student_id: str, chapter: Optional[str] = None,
                    include_upcoming: bool = False, limit: int = 30) -> list[dict]:
    await sync_from_history(db, student_id)
    q = (
        select(MistakeItem, Question)
        .join(Question, Question.id == MistakeItem.question_id)
        .options(selectinload(Question.options))
        .where(MistakeItem.student_id == student_id, MistakeItem.status == "open")
        .order_by(MistakeItem.next_due_at.asc(), MistakeItem.created_at.asc())
    )
    if not include_upcoming:
        q = q.where(MistakeItem.next_due_at <= _now())
    if chapter:
        q = q.where(Question.chapter == chapter) if chapter != "Untagged" else q.where(Question.chapter.is_(None))
    rows = (await db.execute(q.limit(limit))).all()
    return [
        {
            "item_id": m.id, "origin": m.origin, "times_right": m.correct_streak, "needed": MASTERY_STREAK,
            "review_count": m.review_count, "next_due_at": m.next_due_at, "last_result": m.last_result,
            "question": question_payload(qq),
        }
        for m, qq in rows
    ]


async def review_item(db: AsyncSession, student_id: str, item_id: str, selected_option, response_text) -> Optional[dict]:
    from crud.session import evaluate_answer  # local import: avoids a cycle

    row = (await db.execute(
        select(MistakeItem, Question)
        .join(Question, Question.id == MistakeItem.question_id)
        .where(MistakeItem.id == item_id, MistakeItem.student_id == student_id)
    )).first()
    if not row:
        return None
    item, q = row
    ev = evaluate_answer(q, selected_option, response_text)
    now = _now()
    item.review_count += 1
    item.last_reviewed_at = now
    if ev["kind"] == "correct":
        item.correct_streak += 1
        item.last_result = "correct"
        if item.correct_streak >= MASTERY_STREAK:
            item.status = "mastered"
        else:
            item.next_due_at = now + timedelta(days=INTERVALS_DAYS[min(item.review_count - 1, len(INTERVALS_DAYS) - 1)])
    else:
        item.correct_streak = 0
        item.last_result = "wrong"
        item.next_due_at = now + timedelta(days=INTERVALS_DAYS[0])
    db.add(MistakeReview(student_id=student_id, item_id=item.id, question_id=q.id,
                         result=item.last_result, reviewed_at=now))
    await db.flush()
    return {
        **ev, **answer_reveal(q),
        "status": item.status, "times_right": item.correct_streak, "needed": MASTERY_STREAK,
        "next_due_at": item.next_due_at if item.status == "open" else None,
    }


# ── practice sets ─────────────────────────────────────────────────────────────

async def _eligible_quiz_ids(db: AsyncSession, student_id: str) -> set[str]:
    """Tests whose answers the student may see: ones they finished, or whose window has closed."""
    finished = set((await db.execute(
        select(QuizSession.quiz_id).join(Attempt, Attempt.session_id == QuizSession.id)
        .where(Attempt.student_id == student_id, Attempt.status.in_(DONE))
    )).scalars().all())
    now_tz = datetime.now(timezone.utc)
    closed = set()
    for qid, end in (await db.execute(
        select(Quiz.id, Quiz.availability_end).where(Quiz.status == QuizStatus.published.value, Quiz.availability_end.isnot(None))
    )).all():
        end_tz = end.replace(tzinfo=timezone.utc) if end.tzinfo is None else end
        if end_tz < now_tz:
            closed.add(qid)
    # never anything the student is in the middle of
    in_progress = set((await db.execute(
        select(QuizSession.quiz_id).join(Attempt, Attempt.session_id == QuizSession.id)
        .where(Attempt.student_id == student_id, Attempt.status == AttemptStatus.in_progress.value)
    )).scalars().all())
    return (finished | closed) - (in_progress - finished)


async def create_weak_chapter_set(db: AsyncSession, student_id: str) -> dict:
    from services.progress_service import student_progress

    prog = await student_progress(db, student_id)
    weak = [(c["subject"], c["chapter"]) for c in prog.get("weak_chapters", [])]
    if len(weak) < 3:  # top up with the lowest-scoring chapters
        for c in sorted(prog.get("chapters", []), key=lambda c: (c["score_pct"], -c["questions"])):
            key = (c["subject"], c["chapter"])
            if key not in weak:
                weak.append(key)
    if not weak:
        raise ValueError("Take at least one test with chapter-tagged questions first.")

    eligible = await _eligible_quiz_ids(db, student_id)
    if not eligible:
        raise ValueError("Practice unlocks after your first submitted test.")

    # questions per chapter from eligible tests
    from crud.session import has_answer_key
    rows = (await db.execute(
        select(Question).where(Question.quiz_id.in_(list(eligible)), Question.chapter.isnot(None))
    )).scalars().all()
    pool = defaultdict(list)
    for q in rows:
        if has_answer_key(q):  # practice must always be able to show the right answer
            pool[q.chapter].append(q.id)

    # history: what the student already got right
    right = set((await db.execute(
        select(Answer.question_id).join(Attempt, Attempt.id == Answer.attempt_id)
        .where(Attempt.student_id == student_id, Attempt.status.in_(DONE), Answer.is_correct.is_(True))
    )).scalars().all())
    recent_practice = set()
    for ids in (await db.execute(
        select(PracticeSet.question_ids).where(PracticeSet.student_id == student_id)
        .order_by(PracticeSet.created_at.desc()).limit(3)
    )).scalars().all():
        recent_practice |= set(ids or [])

    def ranked(ids):
        random.shuffle(ids)
        # not yet answered correctly first, then not practised recently
        return sorted(ids, key=lambda q: (q in right, q in recent_practice))

    chosen_chapters = [w for w in weak if pool.get(w[1])][:3]
    if not chosen_chapters:
        raise ValueError("No practice questions are available for your weak chapters yet.")
    per = max(5, PRACTICE_SIZE // len(chosen_chapters))
    picked: list[str] = []
    for _, ch in chosen_chapters:
        picked += ranked(list(pool[ch]))[:per]
    # top up from the next weak chapters if the first three were small
    for subj, ch in weak[3:]:
        if len(picked) >= PRACTICE_MIN:
            break
        if pool.get(ch):
            extra = [q for q in ranked(list(pool[ch])) if q not in picked][: PRACTICE_MIN - len(picked)]
            if extra:
                picked += extra
                chosen_chapters.append((subj, ch))
    picked = picked[:PRACTICE_MAX]
    if len(picked) < 5:
        raise ValueError("Not enough tagged questions in your weak chapters yet (need at least 5).")

    ps = PracticeSet(
        student_id=student_id,
        chapters=[{"subject": s_, "chapter": c_} for s_, c_ in chosen_chapters],
        question_ids=picked,
    )
    db.add(ps)
    await db.flush()
    return await get_practice_set(db, student_id, ps.id)


async def get_practice_set(db: AsyncSession, student_id: str, set_id: str) -> Optional[dict]:
    ps = (await db.execute(
        select(PracticeSet).where(PracticeSet.id == set_id, PracticeSet.student_id == student_id)
    )).scalar_one_or_none()
    if not ps:
        return None
    qs = {
        q.id: q for q in (await db.execute(
            select(Question).options(selectinload(Question.options)).where(Question.id.in_(ps.question_ids or []))
        )).scalars().all()
    }
    answered = {
        a.question_id: a.kind for a in (await db.execute(
            select(PracticeAnswer).where(PracticeAnswer.set_id == ps.id)
        )).scalars().all()
    }
    items = []
    for qid in ps.question_ids or []:
        q = qs.get(qid)
        if not q:
            continue
        entry = {"question": question_payload(q), "result": None}
        if qid in answered:
            entry["result"] = {"kind": answered[qid], "is_correct": answered[qid] == "correct", **answer_reveal(q)}
        items.append(entry)
    correct = sum(1 for k in answered.values() if k == "correct")
    return {
        "id": ps.id, "chapters": ps.chapters, "created_at": ps.created_at, "completed_at": ps.completed_at,
        "total": len(items), "answered": len(answered), "correct": correct, "items": items,
    }


async def answer_practice(db: AsyncSession, student_id: str, set_id: str, question_id: str,
                          selected_option, response_text) -> Optional[dict]:
    from crud.session import evaluate_answer

    ps = (await db.execute(
        select(PracticeSet).where(PracticeSet.id == set_id, PracticeSet.student_id == student_id)
    )).scalar_one_or_none()
    if not ps or question_id not in (ps.question_ids or []):
        return None
    q = (await db.execute(select(Question).where(Question.id == question_id))).scalar_one()
    prev = (await db.execute(
        select(PracticeAnswer).where(PracticeAnswer.set_id == set_id, PracticeAnswer.question_id == question_id)
    )).scalar_one_or_none()
    if prev:  # answers are final once revealed
        return {"kind": prev.kind, "is_correct": prev.kind == "correct", "marks": None, **answer_reveal(q), "already_answered": True}
    ev = evaluate_answer(q, selected_option, response_text)
    db.add(PracticeAnswer(set_id=set_id, question_id=question_id, kind=ev["kind"]))
    if ev["kind"] in MISTAKE_KINDS:
        await record_mistakes(db, student_id, q.quiz_id, None, {question_id: ev["kind"]})
    await db.flush()
    done = (await db.execute(select(func.count(PracticeAnswer.id)).where(PracticeAnswer.set_id == set_id))).scalar_one()
    if done >= len(ps.question_ids or []) and not ps.completed_at:
        ps.completed_at = _now()
        await db.flush()
    return {**ev, **answer_reveal(q)}


async def list_practice_sets(db: AsyncSession, student_id: str, limit: int = 10) -> list[dict]:
    sets = (await db.execute(
        select(PracticeSet).where(PracticeSet.student_id == student_id).order_by(PracticeSet.created_at.desc()).limit(limit)
    )).scalars().all()
    out = []
    for ps in sets:
        kinds = (await db.execute(select(PracticeAnswer.kind).where(PracticeAnswer.set_id == ps.id))).scalars().all()
        out.append({
            "id": ps.id, "chapters": ps.chapters, "created_at": ps.created_at, "completed_at": ps.completed_at,
            "total": len(ps.question_ids or []), "answered": len(kinds), "correct": sum(1 for k in kinds if k == "correct"),
        })
    return out
