"""
Chapter tagging — suggests a JEE syllabus chapter for a question.

Strategy
  1. If an OpenRouter key is configured, ask the LLM to choose ONE chapter
     from the fixed syllabus list (by number, so it can't invent names).
  2. Otherwise — or if the AI call fails / returns garbage — fall back to the
     keyword matcher in jee_syllabus.

Suggestions are never treated as final: they're saved with
chapter_source = "ai" | "keyword" and the admin confirms them in the
tagging / review screens (which stores chapter_source = "admin").
"""
from __future__ import annotations

import asyncio
import re
from collections import Counter
from typing import Optional

from database.config import settings
from services.jee_syllabus import SYLLABUS, SUBJECTS, keyword_suggest, normalize_subject
from utils.openrouter import call_openrouter

_MAX_CONCURRENCY = 4
_MAX_TEXT = 1200


def _numbered_chapters(subject: Optional[str]) -> list[tuple[str, str]]:
    subjects = [subject] if subject in SYLLABUS else SUBJECTS
    return [(subj, ch) for subj in subjects for ch, _ in SYLLABUS[subj]]


async def _ai_suggest(text: str, subject: Optional[str]) -> Optional[tuple[str, str]]:
    choices = _numbered_chapters(subject)
    listing = "\n".join(
        f"{i + 1}. {ch}" if subject in SYLLABUS else f"{i + 1}. {subj} — {ch}"
        for i, (subj, ch) in enumerate(choices)
    )
    prompt = (
        "You classify JEE Main exam questions by syllabus chapter.\n"
        f"{'Subject: ' + subject if subject else 'Subject: unknown (Physics, Chemistry or Mathematics)'}\n\n"
        f"Question:\n{text[:_MAX_TEXT]}\n\n"
        f"Chapters:\n{listing}\n\n"
        "Reply with ONLY the number of the single best-matching chapter. No words."
    )
    raw = await call_openrouter([{"role": "user", "content": prompt}], max_tokens=6)
    m = re.search(r"\d+", raw or "")
    if not m:
        return None
    idx = int(m.group(0)) - 1
    if 0 <= idx < len(choices):
        return choices[idx]
    return None


async def suggest_chapter(text: str, subject: Optional[str] = None, use_ai: bool = True) -> dict:
    """
    Returns {"subject", "chapter", "source", "confidence"}; chapter is None when
    nothing sensible could be inferred (e.g. image-only question).
    """
    subject = normalize_subject(subject)
    clean = (text or "").strip()
    if len(clean) < 8:
        return {"subject": subject, "chapter": None, "source": None, "confidence": 0.0}

    if use_ai and settings.openrouter_api_key:
        try:
            hit = await _ai_suggest(clean, subject)
            if hit:
                return {"subject": hit[0], "chapter": hit[1], "source": "ai", "confidence": 0.8}
        except Exception:
            pass  # fall through to keywords

    kw = keyword_suggest(clean, subject)
    if kw:
        return {"subject": kw[0], "chapter": kw[1], "source": "keyword", "confidence": kw[2]}
    return {"subject": subject, "chapter": None, "source": None, "confidence": 0.0}


def question_text_for_tagging(text: Optional[str], options: list | None = None) -> str:
    """Question statement plus option texts — options often carry the decisive keywords."""
    parts = [text or ""]
    for o in options or []:
        t = o.get("text") if isinstance(o, dict) else getattr(o, "text", o if isinstance(o, str) else "")
        if t:
            parts.append(str(t))
    return "\n".join(p for p in parts if p).strip()


async def suggest_many(items: list[dict], use_ai: bool = True) -> list[dict]:
    """items: [{key, text, subject}] → [{key, subject, chapter, source, confidence}]"""
    sem = asyncio.Semaphore(_MAX_CONCURRENCY)

    async def one(item: dict) -> dict:
        async with sem:
            res = await suggest_chapter(item.get("text", ""), item.get("subject"), use_ai=use_ai)
        return {"key": item.get("key"), **res}

    results = list(await asyncio.gather(*(one(i) for i in items)))

    # Single-subject papers often carry no subject heading. When most confident
    # suggestions agree on one subject, re-tag the outliers within that subject
    # (e.g. a Chemistry paper where "order" made one question look like Maths).
    unknown = [i for i, it in enumerate(items) if not normalize_subject(it.get("subject"))]
    hits = [results[i]["subject"] for i in unknown if results[i].get("chapter")]
    if len(hits) >= 5:
        top, n = Counter(hits).most_common(1)[0]
        if n / len(hits) >= 0.6:
            redo = [i for i in unknown if results[i].get("subject") != top]

            async def again(i: int) -> None:
                async with sem:
                    res = await suggest_chapter(items[i].get("text", ""), top, use_ai=use_ai)
                results[i] = {"key": items[i].get("key"), **res, "subject": top}

            await asyncio.gather(*(again(i) for i in redo))
    return results
