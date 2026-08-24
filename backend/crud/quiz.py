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
    quiz = Quiz(
        title=data.title,
        description=data.description,
        creator_id=creator_id,
        time_per_q_sec=data.time_per_q_sec,
        is_public=data.is_public,
        tags=data.tags,
        subject=data.subject,
        difficulty=data.difficulty,
    )
    db.add(quiz)
    await db.flush()

    total_marks = 0
    for i, q_data in enumerate(data.questions):
        question = Question(
            quiz_id=quiz.id,
            order_index=i,
            section=q_data.section,
            text=q_data.text,
            question_image=q_data.question_image,
            content_type=q_data.content_type,
            correct_answer=q_data.correct_answer,
            explanation=q_data.explanation,
            marks=q_data.marks,
            diagram=q_data.diagram,
        )
        db.add(question)
        await db.flush()
        total_marks += q_data.marks

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
    for field, value in data.model_dump(exclude_none=True).items():
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
