"""
LLM service — wraps OpenRouter calls for:
  - explanation generation (cached in DB)
  - correct answer finding
  - resolving unset answers before scoring
"""
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models.all_models import Explanation, Question
from utils.openrouter import call_openrouter


async def get_or_generate_explanation(
    db: AsyncSession,
    question: Question,
) -> str:
    """
    Return cached explanation if exists,
    otherwise call OpenRouter, cache it, and return.
    """
    # Check DB cache first
    result = await db.execute(
        select(Explanation).where(Explanation.question_id == question.id)
    )
    cached = result.scalar_one_or_none()
    if cached:
        return cached.text

    # Use manual explanation if admin provided one
    if question.explanation and question.explanation.strip():
        exp = Explanation(
            question_id=question.id,
            text=question.explanation,
            is_ai=False,
        )
        db.add(exp)
        await db.flush()
        return question.explanation

    # Build prompt
    sorted_opts = sorted(question.options, key=lambda x: x.order_index)
    opts = [o.text if o.text and o.text.strip() else "[image option]" for o in sorted_opts]
    correct_text = opts[question.correct_answer] if question.correct_answer is not None else "unknown"
    opts_lines = "\n".join(f"{chr(65+i)}) {o}" for i, o in enumerate(opts))
    
    prompt = (
        f'You are an expert tutor. Explain why "{correct_text}" is the correct answer.\n\n'
        f"Question: {question.text}\nOptions:\n{opts_lines}\n\n"
        "Give a clear, educational 3-4 sentence explanation suitable for a student."
    )

    try:
        text = await call_openrouter([{"role": "user", "content": prompt}], max_tokens=300)
        text = text.strip()
    except Exception:
        text = f"The correct answer is {correct_text}."

    exp = Explanation(question_id=question.id, text=text, is_ai=True)
    db.add(exp)
    await db.flush()
    return text


async def find_correct_answer(question: Question):
    """
    Ask the LLM which option is correct. Returns a 0-based index, or None when the
    AI is unavailable or its reply is unusable — never a guessed default, because a
    wrong key silently corrupts every student's score and analysis.
    """
    from database.config import settings
    if not settings.openrouter_api_key:
        return None
    opts = [o.text or "" for o in sorted(question.options, key=lambda x: x.order_index)]
    q_text = (question.text or "").strip()
    if len(opts) < 2 or (not q_text and all(not t.strip() for t in opts)):
        return None  # image-only: the model cannot see it
    letters = [chr(65 + i) for i in range(len(opts))]
    opts_lines = "\n".join(f"{letters[i]}) {o if o.strip() else '[image option]'}" for i, o in enumerate(opts))
    prompt = (
        f"You are an expert exam evaluator.\n\n"
        f"Question: {question.text}\nOptions:\n{opts_lines}\n\n"
        f"Which option is correct? Reply with ONLY a single letter: {', '.join(letters)}. Nothing else."
    )
    try:
        raw = await call_openrouter([{"role": "user", "content": prompt}], max_tokens=5)
    except Exception:
        return None
    letter = re.sub(r"[^A-F]", "", (raw or "").strip().upper())[:1]
    return letters.index(letter) if letter in letters else None


SINGLE_KEY_TYPES = ("single_correct", "assertion_reason", "match_column")


async def resolve_unset_answers(db: AsyncSession, questions: list) -> None:
    """
    For single-answer questions saved without a key, ask the AI once and store the
    result. Numerical / multi-correct questions use raw_answer and are never
    guessed. If the AI can't answer, the question stays ungraded (no marks, no
    penalty) until an admin sets the key — which re-scores every attempt.
    """
    from crud.session import has_answer_key
    unset = [
        q for q in questions
        if (q.question_type or "single_correct") in SINGLE_KEY_TYPES and not has_answer_key(q)
    ]
    changed = False
    for q in unset:
        if not q.options:
            result = await db.execute(
                select(Question).options(selectinload(Question.options)).where(Question.id == q.id)
            )
            q = result.scalar_one_or_none() or q
        idx = await find_correct_answer(q)
        if idx is not None:
            q.correct_answer = idx
            changed = True
    if changed:
        await db.flush()
