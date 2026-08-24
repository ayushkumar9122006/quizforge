"""
QuizForge — Database Models
All SQLAlchemy ORM models in one file for clarity.
Import via: from models import User, Quiz, Question ...
"""
import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime,
    ForeignKey, JSON, Index, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database.config import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


# ── Enums ──────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin   = "admin"
    student = "student"


class QuizStatus(str, enum.Enum):
    draft     = "draft"
    published = "published"
    archived  = "archived"


class SessionStatus(str, enum.Enum):
    waiting   = "waiting"    # room created, waiting for students
    active    = "active"     # quiz in progress
    completed = "completed"  # all submitted or time expired


class AttemptStatus(str, enum.Enum):
    in_progress = "in_progress"
    submitted   = "submitted"
    auto_submitted = "auto_submitted"


class ContentType(str, enum.Enum):
    text  = "text"
    image = "image"
    both  = "both"


# ── Users ─────────────────────────────────────────────────────────────────────

class User(Base):
    """
    Stores both admins and students.
    Role determines what they can do.
    """
    __tablename__ = "users"

    id          : Mapped[str]      = mapped_column(String(36), primary_key=True, default=new_uuid)
    email       : Mapped[str]      = mapped_column(String(255), unique=True, nullable=False, index=True)
    name        : Mapped[str]      = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str]   = mapped_column(String(255), nullable=False)
    role        : Mapped[UserRole] = mapped_column(String(20), default=UserRole.student.value, nullable=False)
    is_active   : Mapped[bool]     = mapped_column(Boolean, default=True, nullable=False)
    avatar_url  : Mapped[str|None] = mapped_column(String(500), nullable=True)
    created_at  : Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at  : Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # relationships
    quizzes     : Mapped[list["Quiz"]]         = relationship("Quiz", back_populates="creator", cascade="all, delete-orphan")
    attempts    : Mapped[list["Attempt"]]      = relationship("Attempt", back_populates="student", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    """Stored refresh tokens for JWT rotation."""
    __tablename__ = "refresh_tokens"

    id         : Mapped[str]      = mapped_column(String(36), primary_key=True, default=new_uuid)
    token      : Mapped[str]      = mapped_column(String(512), unique=True, nullable=False, index=True)
    user_id    : Mapped[str]      = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at : Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked    : Mapped[bool]     = mapped_column(Boolean, default=False, nullable=False)
    created_at : Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user : Mapped["User"] = relationship("User", back_populates="refresh_tokens")


# ── Quiz ──────────────────────────────────────────────────────────────────────

class Quiz(Base):
    """
    Top-level quiz entity created by an admin.
    Contains metadata + all questions via relationship.
    """
    __tablename__ = "quizzes"

    id             : Mapped[str]        = mapped_column(String(36), primary_key=True, default=new_uuid)
    title          : Mapped[str]        = mapped_column(String(500), nullable=False)
    description    : Mapped[str|None]   = mapped_column(Text, nullable=True)
    creator_id     : Mapped[str]        = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status         : Mapped[QuizStatus] = mapped_column( String(20), default=QuizStatus.draft.value, nullable=False)
    time_per_q_sec : Mapped[int]        = mapped_column(Integer, default=300, nullable=False)  # seconds
    total_marks    : Mapped[int]        = mapped_column(Integer, default=0, nullable=False)     # auto-computed
    is_public      : Mapped[bool]       = mapped_column(Boolean, default=False, nullable=False)
    tags           : Mapped[list|None]  = mapped_column(JSON, nullable=True)     # ["math","algebra"]
    subject        : Mapped[str|None]   = mapped_column(String(255), nullable=True)
    difficulty     : Mapped[str|None]   = mapped_column(String(50), nullable=True)  # easy/medium/hard
    created_at     : Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     : Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # relationships
    creator   : Mapped["User"]              = relationship("User", back_populates="quizzes")
    questions : Mapped[list["Question"]]    = relationship("Question", back_populates="quiz", cascade="all, delete-orphan", order_by="Question.order_index")
    sessions  : Mapped[list["QuizSession"]] = relationship("QuizSession", back_populates="quiz", cascade="all, delete-orphan")


# ── Question ──────────────────────────────────────────────────────────────────

class Question(Base):
    """
    A single question inside a quiz.
    Supports text, image, or both for the question itself.
    Correct answer index refers to position in options list.
    correct_answer=None means AI will resolve it on submission.
    """
    __tablename__ = "questions"

    id             : Mapped[str]          = mapped_column(String(36), primary_key=True, default=new_uuid)
    quiz_id        : Mapped[str]          = mapped_column(String(36), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index    : Mapped[int]          = mapped_column(Integer, nullable=False, default=0)
    section        : Mapped[str]          = mapped_column(String(255), default="General", nullable=False)
    text           : Mapped[str]          = mapped_column(Text, default="", nullable=False)
    question_image : Mapped[str|None]     = mapped_column(Text, nullable=True)  # file path OR base64 data URL
    content_type   : Mapped[ContentType]  = mapped_column(String(20), default=ContentType.text.value)
    correct_answer : Mapped[int|None]     = mapped_column(Integer, nullable=True)       # 0-based index; None = AI resolves
    explanation    : Mapped[str|None]     = mapped_column(Text, nullable=True)
    explanation_image: Mapped[str|None]   = mapped_column(Text, nullable=True)
    marks          : Mapped[int]          = mapped_column(Integer, default=1, nullable=False)
    diagram        : Mapped[str|None]     = mapped_column(Text, nullable=True)   # attached diagram path OR base64 data URL
    created_at     : Mapped[datetime]     = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     : Mapped[datetime]     = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # relationships
    quiz        : Mapped["Quiz"]           = relationship("Quiz", back_populates="questions")
    options     : Mapped[list["Option"]]   = relationship("Option", back_populates="question", cascade="all, delete-orphan", order_by="Option.order_index")
    answers     : Mapped[list["Answer"]]   = relationship("Answer", back_populates="question")
    explanations: Mapped[list["Explanation"]] = relationship("Explanation", back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_questions_quiz_order", "quiz_id", "order_index"),
    )


class Option(Base):
    """
    One answer option for a question.
    Can be text, image, or both.
    """
    __tablename__ = "options"

    id           : Mapped[str]         = mapped_column(String(36), primary_key=True, default=new_uuid)
    question_id  : Mapped[str]         = mapped_column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index  : Mapped[int]         = mapped_column(Integer, nullable=False)     # 0=A, 1=B, 2=C, 3=D
    text         : Mapped[str]         = mapped_column(Text, default="", nullable=False)
    image        : Mapped[str|None]    = mapped_column(Text, nullable=True)  # file path OR base64 data URL
    content_type : Mapped[ContentType] = mapped_column(String(20), default=ContentType.text.value)
    created_at   : Mapped[datetime]    = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    question : Mapped["Question"] = relationship("Question", back_populates="options")

    __table_args__ = (
        Index("ix_options_question_order", "question_id", "order_index"),
    )


# ── Quiz Session (Room) ────────────────────────────────────────────────────────

class QuizSession(Base):
    """
    A live quiz session — like a Kahoot room.
    Each session has a unique 6-digit room code.
    One quiz can have many sessions over time.
    """
    __tablename__ = "quiz_sessions"

    id          : Mapped[str]           = mapped_column(String(36), primary_key=True, default=new_uuid)
    quiz_id     : Mapped[str]           = mapped_column(String(36), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    room_code   : Mapped[str]           = mapped_column(String(6), unique=True, nullable=False, index=True)
    status      : Mapped[SessionStatus] = mapped_column(String(20), default=SessionStatus.waiting.value, nullable=False)
    started_at  : Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    ended_at    : Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    created_at  : Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    max_students: Mapped[int]           = mapped_column(Integer, default=100, nullable=False)

    # relationships
    quiz     : Mapped["Quiz"]          = relationship("Quiz", back_populates="sessions")
    attempts : Mapped[list["Attempt"]] = relationship("Attempt", back_populates="session", cascade="all, delete-orphan")


# ── Attempt ───────────────────────────────────────────────────────────────────

class Attempt(Base):
    """
    One student's attempt at one quiz session.
    Stores overall score and timing.
    """
    __tablename__ = "attempts"

    id             : Mapped[str]           = mapped_column(String(36), primary_key=True, default=new_uuid)
    session_id     : Mapped[str]           = mapped_column(String(36), ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id     : Mapped[str]           = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    score          : Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    total_marks    : Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    status         : Mapped[AttemptStatus] = mapped_column(String(20), default=AttemptStatus.in_progress.value)
    started_at     : Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    submitted_at   : Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    time_taken_sec : Mapped[int]           = mapped_column(Integer, default=0, nullable=False)
    rank           : Mapped[int|None]      = mapped_column(Integer, nullable=True)  # computed after all submit

    # relationships
    session  : Mapped["QuizSession"]  = relationship("QuizSession", back_populates="attempts")
    student  : Mapped["User"]         = relationship("User", back_populates="attempts")
    answers  : Mapped[list["Answer"]] = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_attempt_session_student"),
    )


# ── Answer ────────────────────────────────────────────────────────────────────

class Answer(Base):
    """
    A student's answer to one specific question in their attempt.
    selected_option is 0-based index; None means skipped.
    """
    __tablename__ = "answers"

    id              : Mapped[str]      = mapped_column(String(36), primary_key=True, default=new_uuid)
    attempt_id      : Mapped[str]      = mapped_column(String(36), ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id     : Mapped[str]      = mapped_column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    selected_option : Mapped[int|None] = mapped_column(Integer, nullable=True)    # None = skipped
    is_correct      : Mapped[bool]     = mapped_column(Boolean, default=False, nullable=False)
    marks_awarded   : Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    time_taken_sec  : Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    answered_at     : Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # relationships
    attempt  : Mapped["Attempt"]   = relationship("Attempt", back_populates="answers")
    question : Mapped["Question"]  = relationship("Question", back_populates="answers")

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_answer_attempt_question"),
    )


# ── Leaderboard ───────────────────────────────────────────────────────────────

class LeaderboardEntry(Base):
    """
    Denormalized leaderboard snapshot per session.
    Updated in real-time as students submit.
    Queried fast for WebSocket broadcasts.
    """
    __tablename__ = "leaderboard"

    id          : Mapped[str]      = mapped_column(String(36), primary_key=True, default=new_uuid)
    session_id  : Mapped[str]      = mapped_column(String(36), ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id  : Mapped[str]      = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    student_name: Mapped[str]      = mapped_column(String(255), nullable=False)
    score       : Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    total_marks : Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    accuracy    : Mapped[float]    = mapped_column(Float, default=0.0, nullable=False)  # 0.0–1.0
    rank        : Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    time_taken_sec: Mapped[int]    = mapped_column(Integer, default=0, nullable=False)
    submitted_at: Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    updated_at  : Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_leaderboard_session_student"),
        Index("ix_leaderboard_session_rank", "session_id", "rank"),
    )


# ── Explanation ───────────────────────────────────────────────────────────────

class Explanation(Base):
    """
    AI-generated or manual explanation for a question.
    Cached here so we don't call OpenRouter on every request.
    """
    __tablename__ = "explanations"

    id           : Mapped[str]      = mapped_column(String(36), primary_key=True, default=new_uuid)
    question_id  : Mapped[str]      = mapped_column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, unique=True)
    text         : Mapped[str]      = mapped_column(Text, nullable=False)
    is_ai        : Mapped[bool]     = mapped_column(Boolean, default=True, nullable=False)
    created_at   : Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   : Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    question : Mapped["Question"] = relationship("Question", back_populates="explanations")
