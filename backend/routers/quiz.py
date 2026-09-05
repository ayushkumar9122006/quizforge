from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import Response
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
import base64

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
    user: User = Depends(get_current_user),
):
    """Aggregate analytics for a quiz across all sessions (admin gets all, student gets isolated data)."""
    from services.analytics_service import get_quiz_analytics
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    student_id = user.id if user.role == UserRole.student else None
    data = await get_quiz_analytics(db, quiz_id, student_id=student_id)
    data["quiz_title"] = quiz.title
    data["quiz_id"]    = quiz_id
    return data


@router.post("/{quiz_id}/solution-pdf")
async def upload_solution_pdf(
    quiz_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not (file.filename and file.filename.lower().endswith(".pdf")):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF size exceeds 15MB limit")

    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    b64 = base64.b64encode(content).decode("utf-8")
    data_url = f"data:application/pdf;base64,{b64}"
    quiz.solution_pdf = data_url
    quiz.solution_pdf_name = file.filename
    await db.flush()
    return {"status": "ok", "filename": file.filename}


@router.get("/{quiz_id}/solution-pdf")
async def get_solution_pdf(
    quiz_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    quiz = await get_quiz(db, quiz_id)
    if not quiz or not quiz.solution_pdf:
        raise HTTPException(status_code=404, detail="Solution PDF not found for this quiz")

    # If student, verify student completed an attempt for a session of this quiz
    if user.role == UserRole.student:
        from sqlalchemy import select
        from models.all_models import Attempt, QuizSession, AttemptStatus
        has_attempt = await db.execute(
            select(Attempt.id)
            .join(QuizSession, Attempt.session_id == QuizSession.id)
            .where(
                QuizSession.quiz_id == quiz_id,
                Attempt.student_id == user.id,
                Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted])
            )
        )
        if not has_attempt.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="You must complete this quiz before viewing the solution PDF")

    data_url = quiz.solution_pdf
    filename = quiz.solution_pdf_name or f"{quiz.title}_Solution.pdf"
    if data_url.startswith("data:"):
        _, b64_data = data_url.split(",", 1)
        pdf_bytes = base64.b64decode(b64_data)
    else:
        with open(data_url, "rb") as f:
            pdf_bytes = f.read()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"'
        }
    )


@router.delete("/{quiz_id}/solution-pdf")
async def delete_solution_pdf(
    quiz_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz.solution_pdf = None
    quiz.solution_pdf_name = None
    await db.flush()
    return {"status": "ok"}
