from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from database.config import get_db
from utils.dependencies import get_current_user
from models.all_models import User, Question
from services.llm_service import get_or_generate_explanation

router = APIRouter(prefix="/llm", tags=["LLM"])


class ExplainRequest(BaseModel):
    question_id: str


@router.post("/explain")
async def explain(
    req: ExplainRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Question).options(selectinload(Question.options)).where(Question.id == req.question_id)
    )
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    text = await get_or_generate_explanation(db, question)
    return {"explanation": text}
