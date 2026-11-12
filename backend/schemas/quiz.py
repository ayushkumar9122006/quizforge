from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime
from typing import Optional, List, Any
from decimal import Decimal
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
    subject: Optional[str] = None
    chapter: Optional[str] = None
    chapter_source: Optional[str] = None
    text: str = ""
    question_image: Optional[str] = None
    content_type: ContentType = ContentType.text
    correct_answer: Optional[int] = None
    raw_answer: Optional[str] = None
    match_data: Optional[str] = None
    question_type: str = "single_correct"
    explanation: Optional[str] = None
    marks: float = 1.0
    positive_marks: Optional[float] = None
    negative_marks: Optional[float] = None
    diagram: Optional[str] = None
    options: List[OptionCreate] = []


class QuestionOut(BaseModel):
    id: str
    order_index: int
    section: str
    subject: Optional[str] = None
    chapter: Optional[str] = None
    chapter_source: Optional[str] = None
    text: str
    question_image: Optional[str] = None
    content_type: ContentType
    correct_answer: Optional[int] = None
    raw_answer: Optional[str] = None
    match_data: Optional[str] = None
    question_type: str = "single_correct"
    explanation: Optional[str] = None
    marks: float
    positive_marks: float = 1.0
    negative_marks: float = 0.0
    diagram: Optional[str] = None
    options: List[OptionOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class QuizCreate(BaseModel):
    title: str = Field(min_length=2, max_length=500)
    description: Optional[str] = None
    instructions: Optional[str] = None
    solution_pdf: Optional[str] = None
    solution_pdf_name: Optional[str] = None
    availability_start: Optional[datetime] = None
    availability_end: Optional[datetime] = None
    time_per_q_sec: int = Field(default=300, ge=10, le=3600)
    total_duration_minutes: Optional[float] = None
    is_public: bool = False
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    questions: List[QuestionCreate] = []

    @field_validator("total_duration_minutes")
    @classmethod
    def validate_total_duration(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v <= 0:
            raise ValueError("Total quiz duration must be greater than 0")
        dec = Decimal(str(v))
        if dec.as_tuple().exponent < -2:
            raise ValueError("Total quiz duration cannot have more than 2 decimal places")
        return float(round(dec, 2))


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    solution_pdf: Optional[str] = None
    solution_pdf_name: Optional[str] = None
    availability_start: Optional[datetime] = None
    availability_end: Optional[datetime] = None
    time_per_q_sec: Optional[int] = None
    total_duration_minutes: Optional[float] = None
    status: Optional[QuizStatus] = None
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None

    @field_validator("total_duration_minutes")
    @classmethod
    def validate_total_duration(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v <= 0:
            raise ValueError("Total quiz duration must be greater than 0")
        dec = Decimal(str(v))
        if dec.as_tuple().exponent < -2:
            raise ValueError("Total quiz duration cannot have more than 2 decimal places")
        return float(round(dec, 2))


class QuizAvailabilityUpdate(BaseModel):
    availability_start: Optional[datetime] = None
    availability_end: Optional[datetime] = None


class QuizOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    has_solution_pdf: bool = False   # the PDF itself is only served by GET /quizzes/{id}/solution-pdf
    solution_pdf_name: Optional[str] = None
    availability_start: Optional[datetime] = None
    availability_end: Optional[datetime] = None
    status: QuizStatus
    time_per_q_sec: int
    total_duration_minutes: Optional[float] = None
    time_per_question_min: Optional[float] = None
    total_marks: float
    is_public: bool
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    creator_id: str
    created_at: datetime
    updated_at: datetime
    questions: List[QuestionOut] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def resolve_durations(self):
        questions = getattr(self, "questions", None) or []
        total_q = len(questions) if questions else getattr(self, "question_count", 1) or 1
        if self.total_duration_minutes is not None:
            self.total_duration_minutes = round(float(self.total_duration_minutes), 2)
        else:
            self.total_duration_minutes = round(((self.time_per_q_sec or 300) * total_q) / 60.0, 2)

        if self.time_per_question_min is not None:
            self.time_per_question_min = round(float(self.time_per_question_min), 2)
        else:
            self.time_per_question_min = round(self.total_duration_minutes / total_q, 2)
        return self


class QuestionStudentOut(BaseModel):
    """
    Same as QuestionOut but WITHOUT correct_answer / explanation.
    Used for any endpoint a student can call before they have submitted
    the quiz, so the answer key can never be fetched ahead of time.
    """
    id: str
    order_index: int
    section: str
    subject: Optional[str] = None
    text: str
    question_image: Optional[str] = None
    content_type: ContentType
    question_type: str = "single_correct"
    match_data: Optional[str] = None
    marks: float
    positive_marks: float = 1.0
    negative_marks: float = 0.0
    diagram: Optional[str] = None
    options: List[OptionOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class QuizStudentOut(BaseModel):
    """Student-safe quiz payload — see QuestionStudentOut."""
    id: str
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    has_solution_pdf: bool = False   # the PDF itself is only served by GET /quizzes/{id}/solution-pdf
    solution_pdf_name: Optional[str] = None
    availability_start: Optional[datetime] = None
    availability_end: Optional[datetime] = None
    status: QuizStatus
    time_per_q_sec: int
    total_duration_minutes: Optional[float] = None
    time_per_question_min: Optional[float] = None
    total_marks: float
    is_public: bool
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    creator_id: str
    created_at: datetime
    updated_at: datetime
    questions: List[QuestionStudentOut] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def resolve_durations(self):
        questions = getattr(self, "questions", None) or []
        total_q = len(questions) if questions else getattr(self, "question_count", 1) or 1
        if self.total_duration_minutes is not None:
            self.total_duration_minutes = round(float(self.total_duration_minutes), 2)
        else:
            self.total_duration_minutes = round(((self.time_per_q_sec or 300) * total_q) / 60.0, 2)

        if self.time_per_question_min is not None:
            self.time_per_question_min = round(float(self.time_per_question_min), 2)
        else:
            self.time_per_question_min = round(self.total_duration_minutes / total_q, 2)
        return self


class QuizListOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    solution_pdf: Optional[str] = None
    solution_pdf_name: Optional[str] = None
    status: QuizStatus
    time_per_q_sec: int
    total_duration_minutes: Optional[float] = None
    time_per_question_min: Optional[float] = None
    total_marks: float
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    question_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def resolve_durations(self):
        total_q = getattr(self, "question_count", 1) or 1
        if self.total_duration_minutes is not None:
            self.total_duration_minutes = round(float(self.total_duration_minutes), 2)
        else:
            self.total_duration_minutes = round(((self.time_per_q_sec or 300) * total_q) / 60.0, 2)

        if self.time_per_question_min is not None:
            self.time_per_question_min = round(float(self.time_per_question_min), 2)
        else:
            self.time_per_question_min = round(self.total_duration_minutes / total_q, 2)
        return self


class QuizSectionSummary(BaseModel):
    name: str
    subject: Optional[str] = None
    count: int = 0


class QuizSummaryOut(BaseModel):
    """Lightweight quiz card for lists — no questions, images or PDFs."""
    id: str
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    status: QuizStatus
    time_per_q_sec: int
    total_duration_minutes: Optional[float] = None
    time_per_question_min: Optional[float] = None
    total_marks: float
    is_public: bool = False
    tags: Optional[List[str]] = None
    subject: Optional[str] = None
    difficulty: Optional[str] = None
    availability_start: Optional[datetime] = None
    availability_end: Optional[datetime] = None
    creator_id: str
    created_at: datetime
    updated_at: datetime
    question_count: int = 0
    untagged_count: int = 0
    sections: List[QuizSectionSummary] = []
    subjects: List[str] = []
    positive_marks: Optional[float] = None
    negative_marks: Optional[float] = None
    has_solution_pdf: bool = False
    solution_pdf_name: Optional[str] = None
    in_progress: bool = False   # this student has an unfinished attempt (resume, even on a new device)


# ── Bulk Import Schemas ────────────────────────────────────────────────────────

class BulkImportOptionItem(BaseModel):
    order_index: int
    label: str = "" # "A", "B", "C", "D"
    text: str = ""
    image: Optional[str] = None # base64 data URL if cropped


class BulkImportQuestionItem(BaseModel):
    question_number: int
    question_type: str = "single_correct" # "single_correct" | "multi_correct" | "numerical" | "assertion_reason" | "match_column"
    section: str = "General"
    subject: Optional[str] = None
    topic: Optional[str] = None
    chapter: Optional[str] = None
    chapter_source: Optional[str] = None
    text: str = ""
    question_image: Optional[str] = None # base64 data URL of diagram or statement
    diagram: Optional[str] = None
    match_data: Optional[str] = None # JSON string storing structured columns: { column_1, column_2 }
    options: List[BulkImportOptionItem] = []
    correct_answer: Optional[int] = None # 0-based option index
    raw_answer: Optional[str] = None # e.g. "C" or "A, C" or "45"
    correct_options: Optional[List[str]] = None # e.g. ["A", "B", "C"]
    positive_marks: float = 4.0
    negative_marks: float = 1.0
    source_page: int = 1
    source_pages: List[int] = []
    source_image: Optional[str] = None # 150 DPI page crop preview for side-by-side verification
    confidence: float = 1.0
    needs_review: bool = False
    review_status: str = "verified" # "verified" | "needs_review" | "missing_diagram" | "missing_option" | "answer_unverified"
    review_notes: List[str] = []


class BulkImportAnalyzeResponse(BaseModel):
    filename: str
    total_questions: int
    ready_count: int
    needs_review_count: int
    questions: List[BulkImportQuestionItem]


class BulkImportConfirmRequest(BaseModel):
    questions: List[QuestionCreate]



# ── Chapter tagging schemas ───────────────────────────────────────────────────

class ChapterSuggestItem(BaseModel):
    key: str                      # caller-defined id (question id or import index)
    text: str = ""
    subject: Optional[str] = None


class ChapterSuggestRequest(BaseModel):
    items: List[ChapterSuggestItem] = Field(default_factory=list, max_length=60)
    use_ai: bool = True


class ChapterSuggestion(BaseModel):
    key: str
    subject: Optional[str] = None
    chapter: Optional[str] = None
    source: Optional[str] = None
    confidence: float = 0.0


class QuestionChapterUpdate(BaseModel):
    question_id: str
    subject: Optional[str] = None
    chapter: Optional[str] = None


class QuestionChapterBulkUpdate(BaseModel):
    updates: List[QuestionChapterUpdate]
