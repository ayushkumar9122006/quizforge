from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from models.all_models import QuizStatus, ContentType


class OptionCreate(BaseModel):
    order_index: int
    text: str = ""
    image: Optional[str] = None
    content_type: ContentType = ContentType.text


class OptionOut(BaseModel):
    id: str
    order_index: int
    text: str
    image: Optional[str] = None
    content_type: ContentType

    model_config = {"from_attributes": True}


class QuestionCreate(BaseModel):
    order_index: int = 0
    section: str = "General"
    text: str = ""
    question_image: Optional[str] = None
    content_type: ContentType = ContentType.text
    correct_answer: Optional[int] = None
    explanation: Optional[str] = None
    marks: int = 1
    diagram: Optional[str] = None
    options: List[OptionCreate] = []


class QuestionOut(BaseModel):
    id: str
    order_index: int
    section: str
    text: str
    question_image: Optional[str] = None
    content_type: ContentType
    correct_answer: Optional[int] = None
    explanation: Optional[str] = None
    marks: int
    diagram: Optional[str] = None
    options: List[OptionOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class QuizCreate(BaseModel):
    title: str = Field(min_length=2, max_length=500)
    description: Optional[str] = None
    time_per_q_sec: int = Field(default=300, ge=10, le=3600)
    is_public: bool = False
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    questions: List[QuestionCreate] = []


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    time_per_q_sec: Optional[int] = None
    status: Optional[QuizStatus] = None
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None


class QuizOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: QuizStatus
    time_per_q_sec: int
    total_marks: int
    is_public: bool
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    creator_id: str
    created_at: datetime
    updated_at: datetime
    questions: List[QuestionOut] = []

    model_config = {"from_attributes": True}


class QuestionStudentOut(BaseModel):
    """
    Same as QuestionOut but WITHOUT correct_answer / explanation.
    Used for any endpoint a student can call before they have submitted
    the quiz, so the answer key can never be fetched ahead of time.
    """
    id: str
    order_index: int
    section: str
    text: str
    question_image: Optional[str] = None
    content_type: ContentType
    marks: int
    diagram: Optional[str] = None
    options: List[OptionOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class QuizStudentOut(BaseModel):
    """Student-safe quiz payload — see QuestionStudentOut."""
    id: str
    title: str
    description: Optional[str] = None
    status: QuizStatus
    time_per_q_sec: int
    total_marks: int
    is_public: bool
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    creator_id: str
    created_at: datetime
    updated_at: datetime
    questions: List[QuestionStudentOut] = []

    model_config = {"from_attributes": True}


class QuizListOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: QuizStatus
    time_per_q_sec: int
    total_marks: int
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    question_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
