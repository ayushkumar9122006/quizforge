"""
Progress Router — long-term performance analytics for JEE full-syllabus tests.

Student:
  GET  /progress/me                              own progress across all tests
  GET  /progress/attempts/{attempt_id}/report    one test: rank, percentile, subject ranks, mistakes by chapter
Admin:
  GET  /progress/students                        every student with trend + weakest chapter
  GET  /progress/students/{student_id}           one student's full progress
  GET  /progress/batch                           batch-wide weak chapters and per-test averages
  POST /progress/chapters/suggest                AI/keyword chapter suggestions (import review screen)
Any user:
  GET  /progress/syllabus                        JEE subjects → chapters
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.config import get_db, settings
from models.all_models import Attempt, User, UserRole
from schemas.quiz import ChapterSuggestRequest, ChapterSuggestion
from services.chapter_tagger import suggest_many
from services.jee_syllabus import syllabus_payload
from services.progress_service import attempt_report, batch_insights, student_progress
from utils.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/progress", tags=["Progress Analytics"])


@router.get("/syllabus")
async def syllabus(user: User = Depends(get_current_user)):
    return {"subjects": syllabus_payload(), "ai_enabled": bool(settings.openrouter_api_key)}


@router.get("/me")
async def my_progress(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await student_progress(db, user.id)


@router.get("/attempts/{attempt_id}/report")
async def report(attempt_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    owner = (await db.execute(select(Attempt.student_id).where(Attempt.id == attempt_id))).scalar_one_or_none()
    if owner is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if user.role != UserRole.admin and owner != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own test report")
    data = await attempt_report(db, attempt_id)
    if not data:
        raise HTTPException(status_code=404, detail="This attempt has not been submitted yet")
    return data


@router.get("/students")
async def students(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    data = await batch_insights(db)
    return {"students": data["students"], "trend_counts": data["trend_counts"]}


@router.get("/students/{student_id}")
async def student_detail(student_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    u = (await db.execute(select(User.id).where(User.id == student_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Student not found")
    return await student_progress(db, student_id)


@router.get("/batch")
async def batch(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    return await batch_insights(db)


@router.post("/chapters/suggest", response_model=list[ChapterSuggestion])
async def suggest(payload: ChapterSuggestRequest, admin: User = Depends(require_admin)):
    results = await suggest_many([i.model_dump() for i in payload.items], use_ai=payload.use_ai)
    return [ChapterSuggestion(**r) for r in results]
