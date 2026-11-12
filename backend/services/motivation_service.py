"""
Streaks, daily goal, badges and the "most improved" leaderboard.

  • Daily goal / streak — a day counts when the student revises at least their
    daily goal of questions (mistake-notebook re-attempts + weak-chapter
    practice answers) OR submits a test that day. Days are calendar days in
    STREAK_TIMEZONE (default Asia/Kolkata). The streak stays alive through
    today if yesterday counted, so a student isn't shown "0" at breakfast.
  • Badges — computed on the fly from existing data (nothing to keep in sync):
    test milestones, mistakes mastered, streak lengths, beating the target,
    personal bests, top-10 %, big percentile jumps, no easy-question mistakes,
    practice sets finished.
  • Most improved — average of the last 2 tests minus the average of the 2
    tests before those, on percentile when the batch is big enough (≥5 took
    most tests) and on score % otherwise. Needs ≥2 tests per student.
"""
from __future__ import annotations

import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.all_models import (
    Attempt, MistakeItem, MistakeReview, PracticeAnswer, PracticeSet, User, UserRole,
)
from services.jee_percentile import scale_to_300
from services.progress_service import DONE, Cohorts, _load, _r

DEFAULT_DAILY_GOAL = 10
GOAL_CHOICES = (5, 10, 15, 20, 30, 50)
HISTORY_DAYS = 14
NEW_BADGE_DAYS = 3
IMPROVE_WINDOW = 2
MIN_COHORT_FOR_PERCENTILE = 5

try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo(os.getenv("STREAK_TIMEZONE", "Asia/Kolkata"))
except Exception:  # no tz database on this machine
    _TZ = timezone(timedelta(hours=5, minutes=30))


def _local_day(ts: Optional[datetime]) -> Optional[date]:
    """Stored timestamps are naive UTC."""
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(_TZ).date()


def _today() -> date:
    return datetime.now(timezone.utc).astimezone(_TZ).date()


# ── activity ──────────────────────────────────────────────────────────────────

async def _activity(db: AsyncSession, student_id: str) -> tuple[dict[date, int], dict[date, int], list[datetime]]:
    """→ (revised questions per day, tests submitted per day, test submit times)."""
    revised: dict[date, int] = defaultdict(int)
    tests: dict[date, int] = defaultdict(int)

    for (ts,) in (await db.execute(
        select(MistakeReview.reviewed_at).where(MistakeReview.student_id == student_id)
    )).all():
        revised[_local_day(ts)] += 1

    for (ts,) in (await db.execute(
        select(PracticeAnswer.answered_at)
        .join(PracticeSet, PracticeSet.id == PracticeAnswer.set_id)
        .where(PracticeSet.student_id == student_id, PracticeAnswer.kind != "skipped")
    )).all():
        revised[_local_day(ts)] += 1

    submits = [ts for (ts,) in (await db.execute(
        select(Attempt.submitted_at).where(Attempt.student_id == student_id, Attempt.status.in_(DONE))
    )).all() if ts]
    for ts in submits:
        tests[_local_day(ts)] += 1
    return revised, tests, sorted(submits)


def _streaks(good: set[date], today: date) -> dict:
    """Current streak (alive if today or yesterday counted), longest, and the day each length was first reached."""
    if not good:
        return {"current": 0, "longest": 0, "reached": {}}
    days = sorted(good)
    longest, run, reached = 0, 0, {}
    prev = None
    for d in days:
        run = run + 1 if prev and (d - prev).days == 1 else 1
        prev = d
        if run > longest:
            longest = run
        reached.setdefault(run, d)
    anchor = today if today in good else today - timedelta(days=1)
    current = 0
    while anchor in good:
        current += 1
        anchor -= timedelta(days=1)
    return {"current": current, "longest": longest, "reached": reached}


async def streak_status(db: AsyncSession, user: User) -> dict:
    goal = int(user.daily_goal or DEFAULT_DAILY_GOAL)
    revised, tests, _ = await _activity(db, user.id)
    good = {d for d, n in revised.items() if n >= goal} | set(tests)
    today = _today()
    st = _streaks(good, today)
    done_today = revised.get(today, 0)
    met_today = today in good
    history = []
    for i in range(HISTORY_DAYS - 1, -1, -1):
        d = today - timedelta(days=i)
        history.append({
            "date": d.isoformat(), "weekday": d.strftime("%a"),
            "revised": revised.get(d, 0), "tests": tests.get(d, 0), "met": d in good,
        })
    if met_today:
        message = f"Today's goal done — {st['current']}-day streak! 🔥"
    elif st["current"]:
        left = max(0, goal - done_today)
        message = f"Revise {left} more question{'s' if left != 1 else ''} today to keep your {st['current']}-day streak."
    else:
        message = f"Revise {goal} questions from your notebook or practice today to start a streak."
    return {
        "current": st["current"],
        "longest": st["longest"],
        "daily_goal": goal,
        "goal_choices": list(GOAL_CHOICES),
        "today": {"date": today.isoformat(), "revised": done_today, "tests": tests.get(today, 0),
                  "met": met_today, "remaining": 0 if met_today else max(0, goal - done_today)},
        "at_risk": bool(st["current"]) and not met_today,
        "history": history,
        "message": message,
        "rule": "A day counts when you revise your daily goal of questions (mistake notebook + weak-chapter practice) or submit a test.",
    }


async def set_daily_goal(db: AsyncSession, user: User, goal: int) -> dict:
    user.daily_goal = int(goal)
    await db.flush()
    return await streak_status(db, user)


# ── badges ────────────────────────────────────────────────────────────────────

BADGES = [
    # id, icon, title, description, group
    ("first_test", "🎯", "First test", "Submitted your first test", "tests"),
    ("tests_5", "📚", "Regular", "Took 5 tests", "tests"),
    ("tests_10", "🏋️", "Test machine", "Took 10 tests", "tests"),
    ("tests_25", "🏛️", "Marathoner", "Took 25 tests", "tests"),
    ("mastered_10", "🧠", "Mastered 10 mistakes", "Got 10 notebook questions right twice in a row", "notebook"),
    ("mastered_50", "💡", "Mastered 50 mistakes", "Mastered 50 notebook questions", "notebook"),
    ("mastered_100", "🦉", "Mistake slayer", "Mastered 100 notebook questions", "notebook"),
    ("streak_3", "🔥", "3-day streak", "Hit your daily goal 3 days in a row", "streak"),
    ("streak_7", "⚡", "7-day streak", "A full week without a break", "streak"),
    ("streak_30", "🌟", "30-day streak", "A month of daily revision", "streak"),
    ("practice_5", "🛠️", "Weak-chapter grinder", "Finished 5 weak-chapter practice sets", "notebook"),
    ("beat_target", "🏆", "Beat your target", "Scored at or above your target marks (on a /300 scale)", "tests"),
    ("personal_best", "📈", "New personal best", "Beat all your earlier scores in a test", "tests"),
    ("rank_climber", "🚀", "Rank climber", "Jumped 20+ percentile points from one test to the next", "tests"),
    ("top_10", "🥇", "Top 10 %", "Finished in the top 10 % of a test with 10+ students", "tests"),
    ("no_silly", "🎯", "No silly mistakes", "No wrong answers on the questions most of the batch got right", "tests"),
]


def _badge(bid: str, earned_at, progress: Optional[tuple[float, float]] = None, detail: Optional[str] = None) -> dict:
    meta = next(b for b in BADGES if b[0] == bid)
    earned = earned_at is not None
    now = datetime.utcnow()
    ea = earned_at if isinstance(earned_at, datetime) else (
        datetime.combine(earned_at, datetime.min.time()) if isinstance(earned_at, date) else None)
    out = {
        "id": bid, "icon": meta[1], "title": meta[2], "description": meta[3], "group": meta[4],
        "earned": earned, "earned_at": ea,
        "new": bool(ea and (now - ea) <= timedelta(days=NEW_BADGE_DAYS)),
        "detail": detail,
    }
    if progress is not None:
        cur, goal = progress
        out["progress"] = {"current": min(cur, goal), "goal": goal, "pct": _r(100 * min(cur, goal) / goal, 0) if goal else 0}
    return out


def _nth(seq: list, n: int):
    return seq[n - 1] if len(seq) >= n else None


async def badges_for(db: AsyncSession, user: User, cohorts: Optional[Cohorts] = None) -> dict:
    sid = user.id
    goal = int(user.daily_goal or DEFAULT_DAILY_GOAL)
    revised, tests_by_day, submits = await _activity(db, sid)
    good = {d for d, n in revised.items() if n >= goal} | set(tests_by_day)
    st = _streaks(good, _today())

    mastered = [ts or datetime.utcnow() for (ts,) in (await db.execute(
        select(MistakeItem.last_reviewed_at).where(MistakeItem.student_id == sid, MistakeItem.status == "mastered")
        .order_by(MistakeItem.last_reviewed_at)
    )).all()]
    practice_done = [ts for (ts,) in (await db.execute(
        select(PracticeSet.completed_at).where(PracticeSet.student_id == sid, PracticeSet.completed_at.is_not(None))
        .order_by(PracticeSet.completed_at)
    )).all()]

    if cohorts is None:
        from models.all_models import QuizSession
        quiz_ids = (await db.execute(
            select(QuizSession.quiz_id).join(Attempt, Attempt.session_id == QuizSession.id)
            .where(Attempt.student_id == sid, Attempt.status.in_(DONE))
        )).scalars().all()
        cohorts = Cohorts(await _load(db, quiz_ids))
    mine = sorted((s for s in cohorts.by_attempt.values() if s["student_id"] == sid), key=lambda s: s["date"] or datetime.min)

    out = []
    n_tests = len(submits)
    for bid, n in (("first_test", 1), ("tests_5", 5), ("tests_10", 10), ("tests_25", 25)):
        out.append(_badge(bid, _nth(submits, n), (n_tests, n)))
    for bid, n in (("mastered_10", 10), ("mastered_50", 50), ("mastered_100", 100)):
        out.append(_badge(bid, _nth(mastered, n), (len(mastered), n)))
    for bid, n in (("streak_3", 3), ("streak_7", 7), ("streak_30", 30)):
        out.append(_badge(bid, st["reached"].get(n), (st["longest"], n)))
    out.append(_badge("practice_5", _nth(practice_done, 5), (len(practice_done), 5)))

    # test-performance badges
    target = user.target_marks
    beat = pb = climb = top = clean = None
    beat_detail = pb_detail = climb_detail = top_detail = clean_detail = None
    best_pct = None
    prev_perc = None
    for s in mine:
        stnd = cohorts.standing(s)
        title = cohorts.quiz_title(s["quiz_id"])
        s300 = scale_to_300(s["score"], s["total_marks"])
        if target and s300 is not None and s300 >= target:
            beat, beat_detail = s["date"], f"{s300:g}/300 in {title} (target {target:g})"
        if best_pct is not None and s["score_pct"] > best_pct:
            pb, pb_detail = s["date"], f"{s['score_pct']:g}% in {title}"
        best_pct = s["score_pct"] if best_pct is None else max(best_pct, s["score_pct"])
        perc, n = stnd["percentile"], stnd["participants"]
        if n >= MIN_COHORT_FOR_PERCENTILE and perc is not None:
            if prev_perc is not None and perc - prev_perc >= 20:
                climb, climb_detail = s["date"], f"{prev_perc:g} → {perc:g} percentile in {title}"
            prev_perc = perc
        if n >= 10 and perc is not None and perc >= 90:
            top, top_detail = s["date"], f"Rank {stnd['rank']} of {n} in {title}"
        diff = cohorts.question_difficulty(s["quiz_id"])
        easy = [pq for pq in s["per_question"] if (diff.get(pq["question_id"]) or {}).get("level") == "easy"]
        if len(easy) >= 5 and not any(pq["kind"] in ("wrong", "partial") for pq in easy):
            clean, clean_detail = s["date"], f"All {len(easy)} easy questions safe in {title}"
    out.append(_badge("beat_target", beat, detail=beat_detail if beat else (None if target else "Set a target on My Progress first")))
    out.append(_badge("personal_best", pb, detail=pb_detail))
    out.append(_badge("rank_climber", climb, detail=climb_detail))
    out.append(_badge("top_10", top, detail=top_detail))
    out.append(_badge("no_silly", clean, detail=clean_detail))

    order = {b[0]: i for i, b in enumerate(BADGES)}
    out.sort(key=lambda b: (not b["earned"], -(b["earned_at"] or datetime.min).timestamp() if b["earned"] else -(b.get("progress") or {}).get("pct", 0), order[b["id"]]))
    earned = [b for b in out if b["earned"]]
    return {"badges": out, "earned_count": len(earned), "total": len(out), "new": [b["id"] for b in earned if b["new"]]}


# ── most improved ─────────────────────────────────────────────────────────────

async def most_improved(db: AsyncSession, viewer: User, limit: int = 10) -> dict:
    cohorts = Cohorts(await _load(db))
    sizes = [len(c) for c in cohorts.by_quiz.values()]
    big_share = (sum(1 for n in sizes if n >= MIN_COHORT_FOR_PERCENTILE) / len(sizes)) if sizes else 0
    metric = "percentile" if big_share >= 0.5 else "score_pct"

    per_student: dict[str, list[dict]] = defaultdict(list)
    for s in cohorts.by_attempt.values():
        per_student[s["student_id"]].append(s)

    rows = []
    for sid, atts in per_student.items():
        atts.sort(key=lambda s: s["date"] or datetime.min)
        if metric == "percentile":
            # percentile in a 2-person test is noise: only count tests with a real batch
            atts = [s for s in atts if len(cohorts.by_quiz[s["quiz_id"]]) >= MIN_COHORT_FOR_PERCENTILE]
        if len(atts) < 2:
            continue
        vals = [(cohorts.standing(s)["percentile"] or 0.0) if metric == "percentile" else s["score_pct"] for s in atts]
        recent = vals[-IMPROVE_WINDOW:]
        before = vals[-2 * IMPROVE_WINDOW:-IMPROVE_WINDOW] or vals[:1]
        if len(vals) <= IMPROVE_WINDOW:          # only 2 tests: compare last vs first
            recent, before = vals[-1:], vals[:1]
        b, a = sum(before) / len(before), sum(recent) / len(recent)
        last = atts[-1]
        u = cohorts.data["users"].get(sid, {})
        rows.append({
            "student_id": sid,
            "name": u.get("name") or "Student",
            "before": _r(b), "after": _r(a), "change": _r(a - b),
            "tests": len(atts),
            "last_test": cohorts.quiz_title(last["quiz_id"]),
            "last_rank": cohorts.standing(last)["rank"],
            "spark": [_r(v) for v in vals[-6:]],
        })
    rows.sort(key=lambda r: (-r["change"], -r["after"], r["name"]))
    for i, r in enumerate(rows, 1):
        r["position"] = i

    is_admin = viewer.role == UserRole.admin
    me = next((r for r in rows if r["student_id"] == viewer.id), None)
    shown = rows if is_admin else rows[:limit]
    entries = []
    for r in shown:
        e = dict(r)
        e["is_me"] = r["student_id"] == viewer.id
        if not is_admin:
            e.pop("student_id")
        entries.append(e)
    if me and not is_admin:
        me = {**{k: v for k, v in me.items() if k != "student_id"}, "is_me": True}
    unit = "percentile points" if metric == "percentile" else "score % points"
    window = "last 2 tests vs the 2 before" if any(len(a) > IMPROVE_WINDOW for a in per_student.values()) else "latest test vs first"
    return {
        "metric": metric,
        "unit": unit,
        "rule": f"Average of your last {IMPROVE_WINDOW} tests minus the {IMPROVE_WINDOW} before them, in {unit} "
                f"(only 2 tests: latest minus first). Needs at least 2 tests"
                + (f" with {MIN_COHORT_FOR_PERCENTILE}+ students." if metric == "percentile" else "."),
        "window": window,
        "entries": entries,
        "me": me,
        "eligible": len(rows),
    }
