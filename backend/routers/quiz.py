from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.config import get_db
from schemas.quiz import (
    QuizCreate, QuizUpdate, QuizOut, QuizStudentOut,
    QuizAvailabilityUpdate,
    BulkImportAnalyzeResponse, BulkImportConfirmRequest
)
from schemas.session import StartQuizResponse
from crud.quiz import (
    create_quiz, get_quiz, get_quizzes_by_creator,
    get_published_quizzes, update_quiz, delete_quiz, publish_quiz,
    add_questions_to_quiz
)
from services.pdf_importer_service import analyze_pdf
from utils.dependencies import require_admin, get_current_user
from models.all_models import User, UserRole, QuizStatus, SessionStatus, AttemptStatus, QuizSession, Attempt
from typing import List
from datetime import datetime, timezone, timedelta
import zoneinfo
import secrets
import base64

IST = zoneinfo.ZoneInfo("Asia/Kolkata")

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


@router.patch("/{quiz_id}/availability", response_model=QuizOut)
async def update_availability(
    quiz_id: str,
    data: QuizAvailabilityUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz.availability_start = data.availability_start
    quiz.availability_end = data.availability_end
    await db.flush()
    return await get_quiz(db, quiz_id)


@router.post("/{quiz_id}/start-attempt", response_model=StartQuizResponse)
async def start_quiz_attempt(
    quiz_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Starts or resumes an attempt for a published quiz based on admin-defined availability.
    Enforces server-side time validation and deadline clamping.
    """
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    if quiz.status != QuizStatus.published and user.role != UserRole.admin:
        raise HTTPException(status_code=400, detail="This quiz is not published yet.")

    now = datetime.now(timezone.utc)

    # Server-side availability validation
    if quiz.availability_start:
        start_tz = quiz.availability_start
        if start_tz.tzinfo is None:
            start_tz = start_tz.replace(tzinfo=timezone.utc)
        if now < start_tz:
            start_ist = start_tz.astimezone(IST)
            raise HTTPException(
                status_code=400,
                detail=f"This quiz is scheduled to start on {start_ist.strftime('%d %B %Y, %I:%M %p IST')}. Not available yet.",
            )

    if quiz.availability_end:
        end_tz = quiz.availability_end
        if end_tz.tzinfo is None:
            end_tz = end_tz.replace(tzinfo=timezone.utc)
        if now > end_tz:
            end_ist = end_tz.astimezone(IST)
            raise HTTPException(
                status_code=400,
                detail=f"This quiz ended on {end_ist.strftime('%d %B %Y, %I:%M %p IST')}. The test window is closed.",
            )

    # Verify if student already submitted
    has_submitted = await db.execute(
        select(Attempt.id)
        .join(QuizSession, Attempt.session_id == QuizSession.id)
        .where(
            QuizSession.quiz_id == quiz_id,
            Attempt.student_id == user.id,
            Attempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted]),
        )
    )
    if has_submitted.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already completed this test.")

    # Find or create default active session for this quiz
    session_res = await db.execute(
        select(QuizSession).where(
            QuizSession.quiz_id == quiz_id,
            QuizSession.status == SessionStatus.active,
        )
    )
    session = session_res.scalar_one_or_none()
    if not session:
        room_code = secrets.token_hex(3).upper()
        session = QuizSession(
            quiz_id=quiz_id,
            room_code=room_code,
            status=SessionStatus.active,
            started_at=datetime.utcnow(),
            max_students=1000,
        )
        db.add(session)
        await db.flush()

    # Find or create in-progress attempt for this student
    attempt_res = await db.execute(
        select(Attempt).where(
            Attempt.session_id == session.id,
            Attempt.student_id == user.id,
            Attempt.status == AttemptStatus.in_progress,
        )
    )
    attempt = attempt_res.scalar_one_or_none()
    resumed = False
    if attempt:
        resumed = True
    else:
        attempt = Attempt(
            session_id=session.id,
            student_id=user.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow(),
        )
        db.add(attempt)
        await db.flush()

    # Calculate test duration and deadline clamping
    # T_effective = min(T_quiz, T_window remaining)
    base_duration_sec = int(round(quiz.effective_total_duration_minutes * 60))

    started_at_utc = attempt.started_at.replace(tzinfo=timezone.utc) if attempt.started_at.tzinfo is None else attempt.started_at
    deadline_duration = started_at_utc + timedelta(seconds=base_duration_sec)

    effective_deadline = deadline_duration
    if quiz.availability_end:
        end_tz = quiz.availability_end.replace(tzinfo=timezone.utc) if quiz.availability_end.tzinfo is None else quiz.availability_end
        effective_deadline = min(deadline_duration, end_tz)

    # Remaining time from now until effective deadline
    remaining_sec = int((effective_deadline - now).total_seconds())

    if remaining_sec <= 0:
        # Time is up - auto-finalize attempt if in progress
        from crud.session import submit_attempt
        from schemas.session import AttemptSubmit
        await submit_attempt(db, attempt.id, AttemptSubmit(answers=[]), quiz.questions, auto=True)
        end_ist = effective_deadline.astimezone(IST)
        raise HTTPException(
            status_code=400,
            detail=f"The test window has closed on {end_ist.strftime('%d %B %Y, %I:%M %p IST')}. Test has been submitted.",
        )

    return StartQuizResponse(
        session_id=session.id,
        attempt_id=attempt.id,
        quiz_id=quiz.id,
        duration_sec=remaining_sec,
        started_at=attempt.started_at,
        resumed=resumed,
        effective_deadline=effective_deadline,
    )


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


# ── Bulk Import Endpoints ──────────────────────────────────────────────────────

@router.post("/import/analyze-pdf", response_model=BulkImportAnalyzeResponse)
async def import_analyze_pdf(
    file: UploadFile = File(...),
    default_pos_marks: float = Form(4.0),
    default_neg_marks: float = Form(1.0),
    default_section: str = Form("General"),
    admin: User = Depends(require_admin),
):
    """
    Accepts an uploaded PDF, performs hybrid layout analysis,
    extracts all questions, images/diagrams, options, and printed answers,
    and returns a structured intermediate representation for admin review.
    Does NOT save anything directly to the database.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PDF document."
        )

    # Read file contents (limit to 50MB)
    file_bytes = await file.read()
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF size exceeds 50MB limit."
        )

    try:
        response = await analyze_pdf(
            file_bytes=file_bytes,
            filename=file.filename,
            default_pos_marks=default_pos_marks,
            default_neg_marks=default_neg_marks,
            default_section=default_section,
        )
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze PDF: {str(e)}"
        )


@router.post("/{quiz_id}/import/confirm", response_model=QuizOut)
async def import_confirm_questions(
    quiz_id: str,
    payload: BulkImportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Appends admin-approved questions to the specified quiz.
    Ensures that only questions approved and reviewed by the admin
    are saved to the production database.
    """
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.creator_id != admin.id:
        raise HTTPException(status_code=403, detail="Only quiz creator can import questions")

    if not payload.questions:
        raise HTTPException(status_code=400, detail="No questions provided for import")

    updated_quiz = await add_questions_to_quiz(db, quiz_id, payload.questions)
    return updated_quiz

