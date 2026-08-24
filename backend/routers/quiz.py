from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from database.config import get_db
from schemas.quiz import QuizCreate, QuizUpdate, QuizOut, QuizStudentOut
from crud.quiz import (
    create_quiz, get_quiz, get_quizzes_by_creator,
    get_published_quizzes, update_quiz, delete_quiz, publish_quiz
)
from utils.dependencies import require_admin, get_current_user
from models.all_models import User, UserRole
from typing import List

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])


@router.post("/", response_model=QuizOut, status_code=status.HTTP_201_CREATED)
async def create(
    data: QuizCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    quiz = await create_quiz(db, data, admin.id)
    return await get_quiz(db, quiz.id)


@router.get("/my", response_model=List[QuizOut])
async def my_quizzes(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    quizzes = await get_quizzes_by_creator(db, admin.id)
    result = []
    for q in quizzes:
        full = await get_quiz(db, q.id)
        result.append(full)
    return result


@router.get("/published")
async def published_quizzes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    quizzes = await get_published_quizzes(db)
    result = []
    for q in quizzes:
        full = await get_quiz(db, q.id)
        if user.role == UserRole.student:
            result.append(QuizStudentOut.model_validate(full))
        else:
            result.append(QuizOut.model_validate(full))
    return result


@router.get("/{quiz_id}")
async def get_one(
    quiz_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if user.role == UserRole.student:
        return QuizStudentOut.model_validate(quiz)
    return QuizOut.model_validate(quiz)


@router.patch("/{quiz_id}", response_model=QuizOut)
async def update(
    quiz_id: str,
    data: QuizUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    quiz = await update_quiz(db, quiz_id, data)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@router.post("/{quiz_id}/publish", response_model=QuizOut)
async def publish(
    quiz_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    quiz = await publish_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    quiz_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    deleted = await delete_quiz(db, quiz_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Quiz not found")


@router.get("/{quiz_id}/analytics")
async def quiz_analytics(
    quiz_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Aggregate analytics for a quiz across all sessions."""
    from services.analytics_service import get_quiz_analytics
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    data = await get_quiz_analytics(db, quiz_id)
    data["quiz_title"] = quiz.title
    data["quiz_id"]    = quiz_id
    return data
