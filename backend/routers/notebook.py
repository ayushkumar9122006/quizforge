"""
Mistake notebook, weak-chapter practice and target tracker (students).

  GET  /mistakes                     summary by chapter (due / open / mastered)
  GET  /mistakes/due?chapter=        questions to re-attempt now (no answer key)
  POST /mistakes/{item_id}/answer    check a re-attempt → result + answer + schedule
  POST /practice/weak-chapters       new 15–20 question set from the 3 weakest chapters
  GET  /practice                     recent practice sets
  GET  /practice/{set_id}            a set with already-revealed results
  POST /practice/{set_id}/answer     check one practice answer (instant feedback)
  GET  /progress/target              current target (out of 300)
  PUT  /progress/target              set / clear target
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database.config import get_db
from models.all_models import User
from services import notebook_service as nb
from services.jee_percentile import estimate_percentile, SOURCE_NOTE
from utils.dependencies import get_current_user

router = APIRouter(tags=["Mistake notebook & practice"])


class AnswerIn(BaseModel):
    selected_option: Optional[int] = None
    response_text: Optional[str] = Field(default=None, max_length=500)


class PracticeAnswerIn(AnswerIn):
    question_id: str


class TargetIn(BaseModel):
    target_marks: Optional[float] = Field(default=None, ge=1, le=300)


@router.get("/mistakes")
async def mistakes_summary(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await nb.notebook_summary(db, user.id)


@router.get("/mistakes/due")
async def mistakes_due(chapter: Optional[str] = None, include_upcoming: bool = False, limit: int = 30,
                       db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await nb.due_items(db, user.id, chapter=chapter, include_upcoming=include_upcoming, limit=max(1, min(limit, 60)))


@router.post("/mistakes/{item_id}/answer")
async def mistakes_answer(item_id: str, data: AnswerIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await nb.review_item(db, user.id, item_id, data.selected_option, data.response_text)
    if res is None:
        raise HTTPException(status_code=404, detail="Notebook item not found")
    return res


@router.post("/practice/weak-chapters")
async def practice_create(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        return await nb.create_weak_chapter_set(db, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/practice")
async def practice_list(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await nb.list_practice_sets(db, user.id)


@router.get("/practice/{set_id}")
async def practice_get(set_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await nb.get_practice_set(db, user.id, set_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Practice set not found")
    return res


@router.post("/practice/{set_id}/answer")
async def practice_answer(set_id: str, data: PracticeAnswerIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await nb.answer_practice(db, user.id, set_id, data.question_id, data.selected_option, data.response_text)
    if res is None:
        raise HTTPException(status_code=404, detail="Question not in this practice set")
    return res


@router.get("/progress/target")
async def get_target(user: User = Depends(get_current_user)):
    t = user.target_marks
    return {"target_marks": t, "target_percentile": estimate_percentile(t) if t else None, "note": SOURCE_NOTE}


@router.put("/progress/target")
async def set_target(data: TargetIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    user.target_marks = round(data.target_marks, 1) if data.target_marks else None
    await db.flush()
    t = user.target_marks
    return {"target_marks": t, "target_percentile": estimate_percentile(t) if t else None, "note": SOURCE_NOTE}
