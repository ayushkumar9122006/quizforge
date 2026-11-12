"""
Progress analytics — turns every submitted test into a long-term picture of a
JEE student's preparation.

Three views are built from the same per-attempt summaries:

  • attempt report   — one test: rank, NTA-style percentile, subject-wise rank vs
                       topper/average, and where marks were lost (by chapter).
  • student progress — all tests of one student: score/percentile curve, whether
                       they are improving, chapters they get wrong test after test,
                       and a rule-based study plan.
  • batch insights   — all students: chapters the whole batch keeps getting wrong,
                       per-test averages, and a student list with trend labels.

Answer classification (per question in an attempt):
  correct  — is_correct
  partial  — not fully correct but positive marks (multi-correct partial credit)
  wrong    — attempted, zero / negative marks
  skipped  — not attempted (no option, no response text)
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.all_models import (
    Answer, Attempt, AttemptStatus, Question, Quiz, QuizSession, User,
)
from services.jee_syllabus import SUBJECTS, infer_subject

DONE = [AttemptStatus.submitted.value, AttemptStatus.auto_submitted.value]
UNTAGGED = "Untagged"
OTHER_SUBJECT = "Other"

# Trend thresholds (percentage points per test)
TREND_EPS = 1.5
RECENT_WINDOW = 3


# ── small helpers ─────────────────────────────────────────────────────────────

def _r(x: float, nd: int = 1) -> float:
    return round(float(x), nd)


def _pct(num: float, den: float, nd: int = 1) -> float:
    return _r(100.0 * num / den, nd) if den else 0.0


def _max_marks(q: dict) -> float:
    pm = q.get("positive_marks")
    return float(pm if pm is not None else (q.get("marks") or 1.0))


def _is_attempted(selected_option, response_text) -> bool:
    if selected_option is not None:
        return True
    if response_text is None:
        return False
    t = str(response_text).strip()
    if t == "":
        return False
    if t.startswith("["):
        try:
            return len(json.loads(t)) > 0
        except Exception:
            return True
    return True


def _classify(ans: Optional[dict]) -> str:
    if not ans or not _is_attempted(ans["selected_option"], ans["response_text"]):
        return "skipped"
    if ans["is_correct"]:
        return "correct"
    if (ans["marks_awarded"] or 0) > 0:
        return "partial"
    return "wrong"


def _blank_bucket() -> dict:
    return {
        "questions": 0, "attempted": 0, "correct": 0, "partial": 0, "wrong": 0, "skipped": 0,
        "score": 0.0, "max": 0.0, "negative": 0.0, "time_sec": 0,
    }


def _add(bucket: dict, kind: str, marks: float, max_m: float, t: int) -> None:
    bucket["questions"] += 1
    bucket[kind] += 1
    if kind != "skipped":
        bucket["attempted"] += 1
    bucket["score"] += marks
    bucket["max"] += max_m
    if marks < 0:
        bucket["negative"] += -marks
    bucket["time_sec"] += int(t or 0)


def _finish(bucket: dict) -> dict:
    b = dict(bucket)
    b["score"] = _r(b["score"], 2)
    b["max"] = _r(b["max"], 2)
    b["negative"] = _r(b["negative"], 2)
    b["score_pct"] = _pct(b["score"], b["max"])
    b["accuracy"] = _pct(b["correct"], b["attempted"])
    b["mistake_pct"] = _pct(b["wrong"], b["attempted"])
    b["skip_pct"] = _pct(b["skipped"], b["questions"])
    b["marks_lost"] = _r(b["max"] - b["score"], 2)
    b["avg_time_sec"] = _r(b["time_sec"] / b["questions"], 1) if b["questions"] else 0.0
    return b


def _slope(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    xs = list(range(n))
    mx, my = sum(xs) / n, sum(values) / n
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, values)) / den if den else 0.0


def _trend(values: list[float]) -> dict:
    """Label a series as improving / declining / steady."""
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return {"label": "not_enough_data", "slope": 0.0, "last_vs_prev": None, "tests": len(vals)}
    window = vals[-6:]  # recent form matters more than first-ever test
    s = _slope(window)
    prev = vals[-1 - RECENT_WINDOW:-1] or vals[:-1]
    last_vs_prev = vals[-1] - sum(prev) / len(prev)
    if s > TREND_EPS or (len(vals) == 2 and last_vs_prev > 3):
        label = "improving"
    elif s < -TREND_EPS or (len(vals) == 2 and last_vs_prev < -3):
        label = "declining"
    else:
        label = "steady"
    return {"label": label, "slope": _r(s, 2), "last_vs_prev": _r(last_vs_prev, 1), "tests": len(vals)}


# ── data loading ──────────────────────────────────────────────────────────────

async def _load(db: AsyncSession, quiz_ids: Optional[Iterable[str]] = None) -> dict:
    """
    Load everything needed for analytics in a handful of flat queries.
    quiz_ids=None means all quizzes that have at least one submitted attempt.
    """
    att_q = (
        select(
            Attempt.id, Attempt.student_id, Attempt.session_id, Attempt.score, Attempt.total_marks,
            Attempt.time_taken_sec, Attempt.submitted_at, Attempt.started_at, Attempt.status,
            QuizSession.quiz_id,
        )
        .join(QuizSession, Attempt.session_id == QuizSession.id)
        .where(Attempt.status.in_(DONE))
    )
    if quiz_ids is not None:
        quiz_ids = list(set(quiz_ids))
        if not quiz_ids:
            return {"quizzes": {}, "questions": {}, "attempts": [], "answers": {}, "users": {}}
        att_q = att_q.where(QuizSession.quiz_id.in_(quiz_ids))
    attempts = [dict(r._mapping) for r in (await db.execute(att_q)).all()]
    qids = sorted({a["quiz_id"] for a in attempts})

    quizzes = {}
    questions: dict[str, list[dict]] = defaultdict(list)
    if qids:
        for r in (await db.execute(
            select(Quiz.id, Quiz.title, Quiz.subject, Quiz.created_at, Quiz.availability_start).where(Quiz.id.in_(qids))
        )).all():
            quizzes[r.id] = dict(r._mapping)
        for r in (await db.execute(
            select(
                Question.id, Question.quiz_id, Question.order_index, Question.section, Question.subject,
                Question.chapter, Question.chapter_source, Question.question_type, Question.marks,
                Question.positive_marks, Question.negative_marks, Question.created_at,
            ).where(Question.quiz_id.in_(qids)).order_by(Question.quiz_id, Question.order_index)
        )).all():
            q = dict(r._mapping)
            q["subject_key"] = q["subject"] or infer_subject(q["section"], quizzes.get(q["quiz_id"], {}).get("subject")) or OTHER_SUBJECT
            q["chapter_key"] = q["chapter"] or UNTAGGED
            questions[q["quiz_id"]].append(q)

    answers: dict[str, dict[str, dict]] = defaultdict(dict)
    att_ids = [a["id"] for a in attempts]
    for i in range(0, len(att_ids), 2000):
        chunk = att_ids[i:i + 2000]
        for r in (await db.execute(
            select(
                Answer.attempt_id, Answer.question_id, Answer.selected_option, Answer.response_text,
                Answer.is_correct, Answer.marks_awarded, Answer.time_taken_sec,
            ).where(Answer.attempt_id.in_(chunk))
        )).all():
            answers[r.attempt_id][r.question_id] = dict(r._mapping)

    student_ids = sorted({a["student_id"] for a in attempts})
    users = {}
    if student_ids:
        for r in (await db.execute(
            select(User.id, User.name, User.email).where(User.id.in_(student_ids))
        )).all():
            users[r.id] = dict(r._mapping)

    return {"quizzes": quizzes, "questions": questions, "attempts": attempts, "answers": answers, "users": users}


# ── per-attempt summary ───────────────────────────────────────────────────────

def _summarize(att: dict, qs: list[dict], ans_map: dict[str, dict]) -> dict:
    submitted = att["submitted_at"] or att["started_at"]
    total = _blank_bucket()
    subjects: dict[str, dict] = defaultdict(_blank_bucket)
    chapters: dict[tuple[str, str], dict] = defaultdict(_blank_bucket)
    qtypes: dict[str, dict] = defaultdict(_blank_bucket)
    per_question = []
    for q in qs:
        # Questions appended to a quiz after this attempt was submitted don't count against it
        if submitted and q["created_at"] and q["created_at"] > submitted and q["id"] not in ans_map:
            continue
        a = ans_map.get(q["id"])
        kind = _classify(a)
        marks = float(a["marks_awarded"] or 0) if a else 0.0
        mm = _max_marks(q)
        t = int(a["time_taken_sec"] or 0) if a else 0
        _add(total, kind, marks, mm, t)
        _add(subjects[q["subject_key"]], kind, marks, mm, t)
        _add(chapters[(q["subject_key"], q["chapter_key"])], kind, marks, mm, t)
        _add(qtypes[q["question_type"] or "single_correct"], kind, marks, mm, t)
        per_question.append({"question_id": q["id"], "kind": kind, "marks": marks, "max": mm})

    tot = _finish(total)
    score = float(att["score"] or 0)
    max_total = float(att["total_marks"] or 0) or tot["max"]
    return {
        "attempt_id": att["id"],
        "student_id": att["student_id"],
        "quiz_id": att["quiz_id"],
        "session_id": att["session_id"],
        "date": submitted,
        "score": _r(score, 2),
        "total_marks": _r(max_total, 2),
        "score_pct": _pct(score, max_total),
        "time_taken_sec": int(att["time_taken_sec"] or 0),
        "auto_submitted": att["status"] == AttemptStatus.auto_submitted.value,
        "totals": tot,
        "subjects": {k: _finish(v) for k, v in subjects.items()},
        "chapters": {k: _finish(v) for k, v in chapters.items()},
        "question_types": {k: _finish(v) for k, v in qtypes.items()},
        "per_question": per_question,
    }


def _rank_and_percentile(values: list[tuple[str, float, int]], target_id: str) -> tuple[Optional[int], Optional[float], int]:
    """values: [(id, score, time)] → (rank, NTA percentile, N). Ties broken by less time."""
    n = len(values)
    me = next((v for v in values if v[0] == target_id), None)
    if not me:
        return None, None, n
    rank = 1 + sum(1 for v in values if v[1] > me[1] or (v[1] == me[1] and v[2] < me[2]))
    percentile = _r(100.0 * sum(1 for v in values if v[1] <= me[1]) / n, 2) if n else None
    return rank, percentile, n


class Cohorts:
    """All submitted attempts grouped per quiz, each with its summary."""

    def __init__(self, data: dict):
        self.data = data
        self.by_quiz: dict[str, list[dict]] = defaultdict(list)
        self.by_attempt: dict[str, dict] = {}
        for att in data["attempts"]:
            s = _summarize(att, data["questions"].get(att["quiz_id"], []), data["answers"].get(att["id"], {}))
            self.by_quiz[att["quiz_id"]].append(s)
            self.by_attempt[att["id"]] = s

    def quiz_title(self, quiz_id: str) -> str:
        return (self.data["quizzes"].get(quiz_id) or {}).get("title") or "Test"

    def standing(self, s: dict) -> dict:
        """Overall + subject-wise rank, percentile, topper and average for one summary."""
        cohort = self.by_quiz[s["quiz_id"]]
        rank, perc, n = _rank_and_percentile(
            [(c["attempt_id"], c["score"], c["time_taken_sec"]) for c in cohort], s["attempt_id"]
        )
        scores = [c["score"] for c in cohort]
        subj = {}
        for name, mine in s["subjects"].items():
            vals = [(c["attempt_id"], c["subjects"].get(name, {}).get("score", 0.0), c["subjects"].get(name, {}).get("time_sec", 0)) for c in cohort]
            r, p, _ = _rank_and_percentile(vals, s["attempt_id"])
            sv = [v[1] for v in vals]
            subj[name] = {
                **mine,
                "rank": r,
                "percentile": p,
                "topper_score": _r(max(sv), 2) if sv else 0.0,
                "average_score": _r(sum(sv) / len(sv), 2) if sv else 0.0,
            }
        return {
            "rank": rank,
            "percentile": perc,
            "participants": n,
            "topper_score": _r(max(scores), 2) if scores else 0.0,
            "average_score": _r(sum(scores) / len(scores), 2) if scores else 0.0,
            "subjects": subj,
        }

    def chapter_batch_accuracy(self, quiz_id: str) -> dict[tuple[str, str], float]:
        agg: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
        for c in self.by_quiz[quiz_id]:
            for k, b in c["chapters"].items():
                agg[k][0] += b["correct"]
                agg[k][1] += b["attempted"]
        return {k: _pct(v[0], v[1]) for k, v in agg.items()}


def _subject_order(names: Iterable[str]) -> list[str]:
    order = {s: i for i, s in enumerate(SUBJECTS + [OTHER_SUBJECT])}
    return sorted(names, key=lambda n: (order.get(n, 99), n))


# ── attempt report ────────────────────────────────────────────────────────────

async def attempt_report(db: AsyncSession, attempt_id: str) -> Optional[dict]:
    row = (await db.execute(
        select(QuizSession.quiz_id).join(Attempt, Attempt.session_id == QuizSession.id).where(Attempt.id == attempt_id)
    )).first()
    if not row:
        return None
    cohorts = Cohorts(await _load(db, [row.quiz_id]))
    s = cohorts.by_attempt.get(attempt_id)
    if not s:
        return None
    st = cohorts.standing(s)
    batch_acc = cohorts.chapter_batch_accuracy(s["quiz_id"])

    chapters = []
    for (subj, ch), b in s["chapters"].items():
        chapters.append({
            "subject": subj, "chapter": ch, **b,
            "batch_accuracy": batch_acc.get((subj, ch), 0.0),
        })
    chapters.sort(key=lambda c: (-c["marks_lost"], c["subject"], c["chapter"]))

    t = s["totals"]
    negative = t["negative"]
    wrong_lost = sum(max(p["max"] - max(p["marks"], 0), 0) for p in s["per_question"] if p["kind"] in ("wrong", "partial"))
    skipped_lost = sum(p["max"] for p in s["per_question"] if p["kind"] == "skipped")

    return {
        "attempt_id": s["attempt_id"],
        "student_id": s["student_id"],
        "quiz_id": s["quiz_id"],
        "quiz_title": cohorts.quiz_title(s["quiz_id"]),
        "date": s["date"],
        "score": s["score"],
        "total_marks": s["total_marks"],
        "score_pct": s["score_pct"],
        "time_taken_sec": s["time_taken_sec"],
        "rank": st["rank"],
        "percentile": st["percentile"],
        "participants": st["participants"],
        "topper_score": st["topper_score"],
        "average_score": st["average_score"],
        "counts": {k: t[k] for k in ("questions", "attempted", "correct", "partial", "wrong", "skipped")},
        "accuracy": t["accuracy"],
        "mistakes": {
            "negative_marks": _r(negative, 2),
            "marks_lost_to_wrong": _r(wrong_lost, 2),
            "marks_left_in_skipped": _r(skipped_lost, 2),
        },
        "subjects": [{"subject": k, **st["subjects"][k]} for k in _subject_order(st["subjects"].keys())],
        "chapters": chapters,
        "question_types": [{"question_type": k, **v} for k, v in s["question_types"].items()],
        "untagged_questions": sum(c["questions"] for c in chapters if c["chapter"] == UNTAGGED),
    }


# ── student progress ──────────────────────────────────────────────────────────

def _diagnose(c: dict) -> tuple[str, str]:
    if c["skip_pct"] >= 50:
        return "avoiding", "You skip most questions here. Revise the core concepts and practise easy questions until you can attempt them confidently."
    if c["mistake_pct"] >= 50:
        return "concept_gap", "You attempt but get most of them wrong. Re-read the theory (NCERT first), then solve chapter-wise PYQs and check each solution."
    if c["recurring"]:
        return "repeat_errors", "Mistakes keep repeating across tests. Keep an error log for this chapter and re-solve your wrong questions before the next test."
    if c["negative"] >= 4:
        return "guessing", "Negative marks are piling up here. Attempt only when you can eliminate at least two options."
    return "low_accuracy", "Accuracy is below target. Do one timed mixed practice set from this chapter every week."


def _student_view(cohorts: Cohorts, student_id: str) -> dict:
    mine = sorted(
        (s for s in cohorts.by_attempt.values() if s["student_id"] == student_id),
        key=lambda s: s["date"] or datetime.min,
    )

    timeline = []
    for s in mine:
        st = cohorts.standing(s)
        timeline.append({
            "attempt_id": s["attempt_id"],
            "quiz_id": s["quiz_id"],
            "quiz_title": cohorts.quiz_title(s["quiz_id"]),
            "date": s["date"],
            "score": s["score"],
            "total_marks": s["total_marks"],
            "score_pct": s["score_pct"],
            "accuracy": s["totals"]["accuracy"],
            "negative_marks": s["totals"]["negative"],
            "rank": st["rank"],
            "participants": st["participants"],
            "percentile": st["percentile"],
            "subjects": {k: {"score_pct": v["score_pct"], "accuracy": v["accuracy"], "rank": st["subjects"][k]["rank"]} for k, v in s["subjects"].items()},
        })

    # Percentile normalises for paper difficulty, but is meaningless in tiny batches.
    # Use it only for tests with a meaningful cohort; fall back to score % otherwise.
    big = [t for t in timeline if (t["participants"] or 0) >= 5]
    if len(big) >= 2:
        overall_trend = {**_trend([t["percentile"] for t in big]), "metric": "percentile"}
    else:
        overall_trend = {**_trend([t["score_pct"] for t in timeline]), "metric": "score_pct"}

    subj_names = _subject_order({k for t in timeline for k in t["subjects"]})
    subject_trends = []
    for name in subj_names:
        series = [t["subjects"][name]["score_pct"] for t in timeline if name in t["subjects"]]
        subject_trends.append({
            "subject": name,
            "series": [{"attempt_id": t["attempt_id"], "score_pct": t["subjects"][name]["score_pct"], "accuracy": t["subjects"][name]["accuracy"]} for t in timeline if name in t["subjects"]],
            "average_score_pct": _r(sum(series) / len(series)) if series else 0.0,
            "trend": _trend(series),
        })

    # Chapter aggregation across all tests
    agg: dict[tuple[str, str], dict] = defaultdict(_blank_bucket)
    per_test: dict[tuple[str, str], list[dict]] = defaultdict(list)
    per_test_ids: dict[tuple[str, str], list[str]] = defaultdict(list)
    for s in mine:
        for k, b in s["chapters"].items():
            a = agg[k]
            for f in ("questions", "attempted", "correct", "partial", "wrong", "skipped", "time_sec"):
                a[f] += b[f]
            for f in ("score", "max", "negative"):
                a[f] += b[f]
            per_test[k].append(b)
            per_test_ids[k].append(s["attempt_id"])

    chapters = []
    untagged_q = 0
    total_q = 0
    for (subj, ch), a in agg.items():
        total_q += a["questions"]
        if ch == UNTAGGED:
            untagged_q += a["questions"]
            continue
        f = _finish(a)
        tests = per_test[(subj, ch)]
        with_mistakes = sum(1 for b in tests if b["wrong"] > 0)
        recurring = with_mistakes >= 2 and with_mistakes / len(tests) >= 0.5
        recent = tests[-RECENT_WINDOW:]
        earlier = tests[:-RECENT_WINDOW]
        def acc(bs):
            att = sum(b["attempted"] for b in bs)
            return _pct(sum(b["correct"] for b in bs), att) if att else None
        recent_acc, earlier_acc = acc(recent), acc(earlier)
        if earlier_acc is None or recent_acc is None:
            ch_trend = "too_early"
        elif recent_acc - earlier_acc >= 15:
            ch_trend = "improving"
        elif earlier_acc - recent_acc >= 15:
            ch_trend = "worsening"
        else:
            ch_trend = "steady"
        c = {
            "subject": subj, "chapter": ch, **f,
            "tests_appeared": len(tests),
            "tests_with_mistakes": with_mistakes,
            "recurring": recurring,
            "recent_accuracy": recent_acc,
            "trend": ch_trend,
            # one cell per test the chapter appeared in → powers the chapter × test grid
            "history": [
                {"attempt_id": aid, "questions": b["questions"], "correct": b["correct"], "partial": b["partial"],
                 "wrong": b["wrong"], "skipped": b["skipped"], "score": b["score"], "max": b["max"]}
                for aid, b in zip(per_test_ids[(subj, ch)], tests)
            ],
        }
        # weakness: share of marks dropped, weighted by how much evidence we have
        loss_share = (c["marks_lost"] / c["max"]) if c["max"] else 0
        c["weakness_score"] = _r(100 * loss_share * math.sqrt(min(c["questions"], 12) / 12) * (1.25 if recurring else 1.0), 1)
        chapters.append(c)

    chapters.sort(key=lambda c: (-c["weakness_score"], c["subject"], c["chapter"]))
    weak = [
        c for c in chapters
        if c["questions"] >= 2 and (c["mistake_pct"] >= 40 or c["skip_pct"] >= 50 or c["score_pct"] < 50)
    ][:8]
    for c in weak:
        c["diagnosis"], c["advice"] = _diagnose(c)
    strong = sorted(
        (c for c in chapters if c["questions"] >= 3 and c["score_pct"] >= 75),
        key=lambda c: -c["score_pct"],
    )[:6]

    # Question-type and habit insights
    qt_agg: dict[str, dict] = defaultdict(_blank_bucket)
    for s in mine:
        for k, b in s["question_types"].items():
            a = qt_agg[k]
            for f in ("questions", "attempted", "correct", "partial", "wrong", "skipped", "time_sec"):
                a[f] += b[f]
            for f in ("score", "max", "negative"):
                a[f] += b[f]
    question_types = [{"question_type": k, **_finish(v)} for k, v in qt_agg.items()]

    insights = []
    if timeline:
        avg_neg = sum(t["negative_marks"] for t in timeline) / len(timeline)
        if avg_neg >= 8:
            insights.append({"kind": "negative_marking", "text": f"You lose about {avg_neg:.0f} marks per test to negative marking. Skipping questions you can only guess on could raise your score right away."})
        if overall_trend["label"] == "improving":
            insights.append({"kind": "trend", "text": "Your recent tests are trending upward. Keep the same revision routine."})
        elif overall_trend["label"] == "declining":
            insights.append({"kind": "trend", "text": "Your recent tests are trending down. Review the weak chapters below before the next full syllabus test."})
        st_sorted = sorted((s for s in subject_trends if s["subject"] != OTHER_SUBJECT), key=lambda s: s["average_score_pct"])
        if len(st_sorted) >= 2 and st_sorted[-1]["average_score_pct"] - st_sorted[0]["average_score_pct"] >= 15:
            insights.append({"kind": "subject_gap", "text": f"{st_sorted[0]['subject']} is your weakest subject (avg {st_sorted[0]['average_score_pct']}% vs {st_sorted[-1]['average_score_pct']}% in {st_sorted[-1]['subject']}). Give it more of your study time."})
        num = qt_agg.get("numerical")
        if num and num["attempted"] >= 4:
            nf = _finish(num)
            if nf["accuracy"] < 50:
                insights.append({"kind": "numerical", "text": f"Numerical-answer accuracy is only {nf['accuracy']}%. Practise calculation-heavy questions without options."})
        if total_q and untagged_q / total_q > 0.3:
            insights.append({"kind": "untagged", "text": "Many questions in your tests have no chapter tag yet, so chapter analysis is incomplete. Ask your admin to tag chapters."})

    study_plan = [
        {
            "priority": i + 1,
            "subject": c["subject"],
            "chapter": c["chapter"],
            "why": f"{c['mistake_pct']}% wrong, {c['skip_pct']}% skipped across {c['tests_appeared']} test{'s' if c['tests_appeared'] != 1 else ''} ({c['marks_lost']} marks lost)",
            "action": c["advice"],
        }
        for i, c in enumerate(weak[:5])
    ]

    best = max(timeline, key=lambda t: t["score_pct"]) if timeline else None
    return {
        "student_id": student_id,
        "tests_taken": len(timeline),
        "summary": {
            "average_score_pct": _r(sum(t["score_pct"] for t in timeline) / len(timeline)) if timeline else 0.0,
            "average_percentile": _r(sum(t["percentile"] or 0 for t in timeline) / len(timeline), 2) if timeline else None,
            "best": {"quiz_title": best["quiz_title"], "score_pct": best["score_pct"], "attempt_id": best["attempt_id"]} if best else None,
            "last": timeline[-1] if timeline else None,
            "trend": overall_trend,
        },
        "timeline": timeline,
        "subject_trends": subject_trends,
        "chapters": chapters,
        "weak_chapters": weak,
        "strong_chapters": strong,
        "question_types": question_types,
        "insights": insights,
        "study_plan": study_plan,
        "untagged_share_pct": _pct(untagged_q, total_q),
    }


async def student_progress(db: AsyncSession, student_id: str) -> dict:
    quiz_ids = (await db.execute(
        select(QuizSession.quiz_id)
        .join(Attempt, Attempt.session_id == QuizSession.id)
        .where(Attempt.student_id == student_id, Attempt.status.in_(DONE))
    )).scalars().all()
    cohorts = Cohorts(await _load(db, quiz_ids))
    view = _student_view(cohorts, student_id)
    user = (await db.execute(select(User.id, User.name, User.email).where(User.id == student_id))).first()
    view["student"] = {"id": user.id, "name": user.name, "email": user.email} if user else {"id": student_id}
    return view


# ── batch (admin) ─────────────────────────────────────────────────────────────

async def batch_insights(db: AsyncSession) -> dict:
    data = await _load(db)
    cohorts = Cohorts(data)

    # Per-test averages, chronological by first submission
    tests = []
    for quiz_id, cohort in cohorts.by_quiz.items():
        dates = [c["date"] for c in cohort if c["date"]]
        pcts = [c["score_pct"] for c in cohort]
        subj = defaultdict(list)
        for c in cohort:
            for k, v in c["subjects"].items():
                subj[k].append(v["score_pct"])
        tests.append({
            "quiz_id": quiz_id,
            "quiz_title": cohorts.quiz_title(quiz_id),
            "date": min(dates) if dates else None,
            "participants": len(cohort),
            "average_score_pct": _r(sum(pcts) / len(pcts)) if pcts else 0.0,
            "topper_score_pct": _r(max(pcts)) if pcts else 0.0,
            "subjects": {k: _r(sum(v) / len(v)) for k, v in subj.items()},
        })
    tests.sort(key=lambda t: t["date"] or datetime.min)

    # Chapters across the whole batch
    agg: dict[tuple[str, str], dict] = defaultdict(_blank_bucket)
    per_student: dict[tuple[str, str], dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    tests_per_chapter: dict[tuple[str, str], set] = defaultdict(set)
    for s in cohorts.by_attempt.values():
        for k, b in s["chapters"].items():
            a = agg[k]
            for f in ("questions", "attempted", "correct", "partial", "wrong", "skipped", "time_sec"):
                a[f] += b[f]
            for f in ("score", "max", "negative"):
                a[f] += b[f]
            ps = per_student[k][s["student_id"]]
            ps[0] += b["wrong"]
            ps[1] += b["attempted"]
            tests_per_chapter[k].add(s["quiz_id"])

    chapters = []
    for (subj, ch), a in agg.items():
        if ch == UNTAGGED:
            continue
        f = _finish(a)
        students = per_student[(subj, ch)]
        struggling = [sid for sid, (w, att) in students.items() if att >= 2 and w / att >= 0.5]
        chapters.append({
            "subject": subj, "chapter": ch, **f,
            "students": len(students),
            "students_struggling": len(struggling),
            "struggling_pct": _pct(len(struggling), len(students)),
            "tests": len(tests_per_chapter[(subj, ch)]),
        })
    chapters.sort(key=lambda c: (-(c["mistake_pct"] + c["skip_pct"] / 2), c["subject"], c["chapter"]))

    # Student list
    students = []
    for sid in {s["student_id"] for s in cohorts.by_attempt.values()}:
        v = _student_view(cohorts, sid)
        u = data["users"].get(sid, {})
        last = v["summary"]["last"] or {}
        students.append({
            "student_id": sid,
            "name": u.get("name") or "Student",
            "email": u.get("email"),
            "tests_taken": v["tests_taken"],
            "average_score_pct": v["summary"]["average_score_pct"],
            "last_score_pct": last.get("score_pct"),
            "last_percentile": last.get("percentile"),
            "last_rank": last.get("rank"),
            "last_date": last.get("date"),
            "trend": v["summary"]["trend"]["label"],
            "top_weak_chapter": (v["weak_chapters"][0]["chapter"] if v["weak_chapters"] else None),
            "spark": [t["score_pct"] for t in v["timeline"][-8:]],
        })
    students.sort(key=lambda s: (-(s["average_score_pct"] or 0), s["name"]))

    total_q = sum(a["questions"] for a in agg.values())
    untagged = sum(a["questions"] for (s, ch), a in agg.items() if ch == UNTAGGED)
    return {
        "students": students,
        "tests": tests,
        "chapters": chapters,
        "trend_counts": {
            lbl: sum(1 for s in students if s["trend"] == lbl)
            for lbl in ("improving", "steady", "declining", "not_enough_data")
        },
        "untagged_share_pct": _pct(untagged, total_q),
    }
