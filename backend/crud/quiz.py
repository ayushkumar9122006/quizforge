from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models.all_models import Quiz, Question, Option, QuizStatus
from schemas.quiz import QuizCreate, QuizUpdate
from typing import Optional, List
import uuid


def _new_id() -> str:
    return str(uuid.uuid4())


async def create_quiz(db: AsyncSession, data: QuizCreate, creator_id: str) -> Quiz:
    total_q = len(data.questions) or 1
    if data.total_duration_minutes is not None:
        tot_min = round(float(data.total_duration_minutes), 2)
        per_q_min = round(tot_min / total_q, 2)
        time_per_q_sec = int(round(per_q_min * 60))
    else:
        time_per_q_sec = data.time_per_q_sec or 300
        tot_min = round((time_per_q_sec * total_q) / 60.0, 2)

    quiz = Quiz(
        title=data.title,
        description=data.description,
        instructions=data.instructions,
        solution_pdf=data.solution_pdf,
        solution_pdf_name=data.solution_pdf_name,
        availability_start=data.availability_start,
        availability_end=data.availability_end,
        creator_id=creator_id,
        time_per_q_sec=time_per_q_sec,
        total_duration_minutes=tot_min,
        is_public=data.is_public,
        tags=data.tags,
        subject=data.subject,
        difficulty=data.difficulty,
    )
    db.add(quiz)
    await db.flush()

    total_marks = 0.0
    for i, q_data in enumerate(data.questions):
        pos_marks = float(q_data.positive_marks if q_data.positive_marks is not None else (q_data.marks or 1.0))
        neg_marks = float(q_data.negative_marks if q_data.negative_marks is not None else 0.0)
        question = Question(
            quiz_id=quiz.id,
            order_index=i,
            section=q_data.section,
            text=q_data.text,
            question_image=q_data.question_image,
            content_type=q_data.content_type,
            correct_answer=q_data.correct_answer,
            raw_answer=getattr(q_data, "raw_answer", None),
            question_type=getattr(q_data, "question_type", "single_correct") or "single_correct",
            match_data=getattr(q_data, "match_data", None),
            explanation=q_data.explanation,
            marks=pos_marks,
            positive_marks=pos_marks,
            negative_marks=neg_marks,
            diagram=q_data.diagram,
        )
        db.add(question)
        await db.flush()
        total_marks += pos_marks

        for j, opt in enumerate(q_data.options):
            option = Option(
                question_id=question.id,
                order_index=j,
                text=opt.text,
                image=opt.image,
                content_type=opt.content_type,
            )
            db.add(option)

    quiz.total_marks = total_marks
    await db.flush()
    return quiz


async def get_quiz(db: AsyncSession, quiz_id: str) -> Optional[Quiz]:
    result = await db.execute(
        select(Quiz)
        .options(
            selectinload(Quiz.questions).selectinload(Question.options)
        )
        .where(Quiz.id == quiz_id)
    )
    return result.scalar_one_or_none()


async def get_quizzes_by_creator(db: AsyncSession, creator_id: str) -> List[Quiz]:
    result = await db.execute(
        select(Quiz)
        .where(Quiz.creator_id == creator_id)
        .order_by(Quiz.created_at.desc())
    )
    return list(result.scalars().all())


async def get_published_quizzes(db: AsyncSession) -> List[Quiz]:
    result = await db.execute(
        select(Quiz)
        .where(Quiz.status == QuizStatus.published.value)
        .order_by(Quiz.created_at.desc())
    )
    return list(result.scalars().all())


async def update_quiz(db: AsyncSession, quiz_id: str, data: QuizUpdate) -> Optional[Quiz]:
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        return None
    dump = data.model_dump(exclude_none=True)
    if "total_duration_minutes" in dump:
        tot_min = round(float(dump["total_duration_minutes"]), 2)
        total_q = len(quiz.questions) or 1
        per_q_min = round(tot_min / total_q, 2)
        dump["total_duration_minutes"] = tot_min
        dump["time_per_q_sec"] = int(round(per_q_min * 60))
    elif "time_per_q_sec" in dump:
        time_per_q_sec = dump["time_per_q_sec"]
        total_q = len(quiz.questions) or 1
        dump["total_duration_minutes"] = round((time_per_q_sec * total_q) / 60.0, 2)

    for field, value in dump.items():
        setattr(quiz, field, value)
    await db.flush()
    return quiz


async def delete_quiz(db: AsyncSession, quiz_id: str) -> bool:
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        return False
    await db.delete(quiz)
    await db.flush()
    return True


async def publish_quiz(db: AsyncSession, quiz_id: str) -> Optional[Quiz]:
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        return None
    quiz.status = QuizStatus.published.value
    await db.flush()
    return quiz


async def add_questions_to_quiz(db: AsyncSession, quiz_id: str, new_questions: List) -> Optional[Quiz]:
    quiz = await get_quiz(db, quiz_id)
    if not quiz:
        return None

    current_count = len(quiz.questions)
    total_marks_added = 0.0

    for i, q_data in enumerate(new_questions):
        pos_marks = float(q_data.positive_marks if q_data.positive_marks is not None else (q_data.marks or 1.0))
        neg_marks = float(q_data.negative_marks if q_data.negative_marks is not None else 0.0)
        exp = q_data.explanation
        if not exp and getattr(q_data, "source_page", None):
            exp = f"PDF Page {q_data.source_page}"

        question = Question(
            quiz_id=quiz.id,
            order_index=current_count + i,
            section=q_data.section or "General",
            text=q_data.text or "",
            question_image=q_data.question_image,
            content_type=getattr(q_data, "content_type", None) or ContentType.text,
            correct_answer=q_data.correct_answer,
            raw_answer=getattr(q_data, "raw_answer", None),
            question_type=getattr(q_data, "question_type", "single_correct") or "single_correct",
            match_data=getattr(q_data, "match_data", None),
            explanation=exp,
            marks=pos_marks,
            positive_marks=pos_marks,
            negative_marks=neg_marks,
            diagram=q_data.diagram,
        )
        db.add(question)
        await db.flush()
        total_marks_added += pos_marks

        for j, opt in enumerate(q_data.options):
            option = Option(
                question_id=question.id,
                order_index=j,
                text=opt.text or "",
                image=opt.image,
                content_type=getattr(opt, "content_type", None) or ContentType.text,
            )
            db.add(option)

    quiz.total_marks = float(quiz.total_marks or 0.0) + total_marks_added
    new_total_q = current_count + len(new_questions)
    if quiz.total_duration_minutes is not None and new_total_q > 0:
        per_q_min = round(quiz.total_duration_minutes / new_total_q, 2)
        quiz.time_per_q_sec = int(round(per_q_min * 60))
    await db.flush()
    db.expire_all()
    return await get_quiz(db, quiz_id)

