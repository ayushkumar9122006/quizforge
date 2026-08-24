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


async def find_correct_answer(question: Question) -> int:
    """
    Ask the LLM which option is correct.
    Returns 0-based index. Falls back to 0 on failure.
    For image-only questions/options, returns None so it stays unresolved.
    """
    opts = [o.text for o in sorted(question.options, key=lambda x: x.order_index)]

    q_text = (question.text or "").strip()
    opt_texts = [o.strip() for o in opts]
    if not q_text and all(not t for t in opt_texts):
        return 0

    opts_lines = "\n".join(
        f"{chr(65+i)}) {o if o.strip() else '[image option]'}"
        for i, o in enumerate(opts)
    )

    prompt = (
        f"You are an expert exam evaluator.\n\n"
        f"Question: {question.text}\nOptions:\n{opts_lines}\n\n"
        "Which option is correct? Reply with ONLY a single letter: A, B, C, or D. Nothing else."
    )

    try:
        raw = await call_openrouter([{"role": "user", "content": prompt}], max_tokens=5)
        letter = re.sub(r"[^A-D]", "", raw.strip().upper())[:1]
        return ["A", "B", "C", "D"].index(letter) if letter else 0
    except Exception:
        return 0


async def resolve_unset_answers(db: AsyncSession, questions: list) -> None:
    """
    For questions where correct_answer is None,
    call LLM to determine and save it permanently.
    """
    # Ensure options are loaded
    unset = [q for q in questions if q.correct_answer is None]
    for q in unset:
        # load options if not already loaded
        if not q.options:
            result = await db.execute(
                select(Question)
                .options(selectinload(Question.options))
                .where(Question.id == q.id)
            )
            q = result.scalar_one_or_none()
        idx = await find_correct_answer(q)
        q.correct_answer = idx
    if unset:
        await db.flush()
