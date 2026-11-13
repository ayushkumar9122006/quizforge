"""
Streaks & goals, badges, most-improved leaderboard.

  GET  /progress/streak                → current/longest streak, today's goal, last 14 days
  PUT  /progress/daily-goal            → {daily_goal: 5..50}
  GET  /progress/badges                → earned + locked badges with progress
  GET  /progress/leaderboard/improved  → rank-improvement leaderboard (top 10 + you; admin: everyone)
  GET  /progress/students/{id}/motivation (admin) → one student's streak + badges
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.config import get_db
from models.all_models import User, UserRole
from services import motivation_service as mv
from utils.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/progress", tags=["Streaks, badges & most improved"])


class DailyGoalIn(BaseModel):
    daily_goal: int = Field(ge=1, le=100)


@router.get("/streak")
async def streak(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mv.streak_status(db, user)


@router.put("/daily-goal")
async def daily_goal(data: DailyGoalIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mv.set_daily_goal(db, user, data.daily_goal)


@router.get("/badges")
async def badges(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mv.badges_for(db, user)


@router.get("/leaderboard/improved")
async def improved(limit: int = 10, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await mv.most_improved(db, user, limit=max(3, min(limit, 50)))


@router.get("/students/{student_id}/motivation")
async def student_motivation(student_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    student = (await db.execute(select(User).where(User.id == student_id, User.role == UserRole.student))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"streak": await mv.streak_status(db, student), "badges": await mv.badges_for(db, student)}
