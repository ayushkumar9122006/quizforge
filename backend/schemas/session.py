from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from models.all_models import SessionStatus, AttemptStatus


class SessionCreate(BaseModel):
    quiz_id: str
    max_students: int = 100


class SessionOut(BaseModel):
    id: str
    quiz_id: str
    room_code: str
    status: SessionStatus
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime
    max_students: int

    model_config = {"from_attributes": True}


class JoinSessionRequest(BaseModel):
    room_code: str


class AnswerSubmit(BaseModel):
    question_id: str
    selected_option: Optional[int] = None   # None = skipped
    time_taken_sec: int = 0


class AttemptSubmit(BaseModel):
    answers: List[AnswerSubmit]
    time_taken_sec: int = 0


class LeaderboardEntryOut(BaseModel):
    rank: int
    student_name: str
    score: int
    total_marks: int
    accuracy: float
    time_taken_sec: int
    submitted_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AttemptOut(BaseModel):
    id: str
    session_id: str
    student_id: str
    score: int
    total_marks: int
    status: AttemptStatus
    started_at: datetime
    submitted_at: Optional[datetime] = None
    time_taken_sec: int
    rank: Optional[int] = None

    model_config = {"from_attributes": True}


class AnswerResultOut(BaseModel):
    """
    Per-question breakdown for one submitted attempt.
    This is the single source of truth for "was this correct" —
    it is only ever populated AFTER the backend has scored the
    attempt, so it can safely reveal correct_answer.
    """
    question_id: str
    selected_option: Optional[int] = None
    correct_answer: Optional[int] = None
    is_correct: bool
    marks_awarded: int


class AttemptResultOut(AttemptOut):
    results: List[AnswerResultOut] = []
