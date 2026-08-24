"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users
    op.create_table(
        "users",
        sa.Column("id",               sa.String(36),  primary_key=True),
        sa.Column("email",            sa.String(255), nullable=False, unique=True),
        sa.Column("name",             sa.String(255), nullable=False),
        sa.Column("hashed_password",  sa.String(255), nullable=False),
        sa.Column("role",             sa.String(20),  nullable=False, server_default="student"),
        sa.Column("is_active",        sa.Boolean(),   nullable=False, server_default="true"),
        sa.Column("avatar_url",       sa.String(500), nullable=True),
        sa.Column("created_at",       sa.DateTime(),  nullable=False),
        sa.Column("updated_at",       sa.DateTime(),  nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id",         sa.String(36),  primary_key=True),
        sa.Column("token",      sa.String(512), nullable=False, unique=True),
        sa.Column("user_id",    sa.String(36),  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(),  nullable=False),
        sa.Column("revoked",    sa.Boolean(),   nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(),  nullable=False),
    )
    op.create_index("ix_refresh_tokens_token", "refresh_tokens", ["token"])

    # quizzes
    op.create_table(
        "quizzes",
        sa.Column("id",              sa.String(36),  primary_key=True),
        sa.Column("title",           sa.String(500), nullable=False),
        sa.Column("description",     sa.Text(),      nullable=True),
        sa.Column("creator_id",      sa.String(36),  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status",          sa.String(20),  nullable=False, server_default="draft"),
        sa.Column("time_per_q_sec",  sa.Integer(),   nullable=False, server_default="300"),
        sa.Column("total_marks",     sa.Integer(),   nullable=False, server_default="0"),
        sa.Column("is_public",       sa.Boolean(),   nullable=False, server_default="false"),
        sa.Column("tags",            sa.JSON(),      nullable=True),
        sa.Column("subject",         sa.String(255), nullable=True),
        sa.Column("difficulty",      sa.String(50),  nullable=True),
        sa.Column("created_at",      sa.DateTime(),  nullable=False),
        sa.Column("updated_at",      sa.DateTime(),  nullable=False),
    )

    # questions
    op.create_table(
        "questions",
        sa.Column("id",               sa.String(36), primary_key=True),
        sa.Column("quiz_id",          sa.String(36), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_index",      sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("section",          sa.String(255),nullable=False, server_default="General"),
        sa.Column("text",             sa.Text(),     nullable=False, server_default=""),
        sa.Column("question_image",   sa.String(500),nullable=True),
        sa.Column("content_type",     sa.String(20), nullable=False, server_default="text"),
        sa.Column("correct_answer",   sa.Integer(),  nullable=True),
        sa.Column("explanation",      sa.Text(),     nullable=True),
        sa.Column("explanation_image",sa.String(500),nullable=True),
        sa.Column("marks",            sa.Integer(),  nullable=False, server_default="1"),
        sa.Column("diagram",          sa.String(500),nullable=True),
        sa.Column("created_at",       sa.DateTime(), nullable=False),
        sa.Column("updated_at",       sa.DateTime(), nullable=False),
    )
    op.create_index("ix_questions_quiz_order", "questions", ["quiz_id", "order_index"])

    # options
    op.create_table(
        "options",
        sa.Column("id",           sa.String(36), primary_key=True),
        sa.Column("question_id",  sa.String(36), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_index",  sa.Integer(),  nullable=False),
        sa.Column("text",         sa.Text(),     nullable=False, server_default=""),
        sa.Column("image",        sa.String(500),nullable=True),
        sa.Column("content_type", sa.String(20), nullable=False, server_default="text"),
        sa.Column("created_at",   sa.DateTime(), nullable=False),
    )
    op.create_index("ix_options_question_order", "options", ["question_id", "order_index"])

    # quiz_sessions
    op.create_table(
        "quiz_sessions",
        sa.Column("id",           sa.String(36), primary_key=True),
        sa.Column("quiz_id",      sa.String(36), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("room_code",    sa.String(6),  nullable=False, unique=True),
        sa.Column("status",       sa.String(20), nullable=False, server_default="waiting"),
        sa.Column("started_at",   sa.DateTime(), nullable=True),
        sa.Column("ended_at",     sa.DateTime(), nullable=True),
        sa.Column("created_at",   sa.DateTime(), nullable=False),
        sa.Column("max_students", sa.Integer(),  nullable=False, server_default="100"),
    )
    op.create_index("ix_quiz_sessions_room_code", "quiz_sessions", ["room_code"])

    # attempts
    op.create_table(
        "attempts",
        sa.Column("id",             sa.String(36), primary_key=True),
        sa.Column("session_id",     sa.String(36), sa.ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id",     sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score",          sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("total_marks",    sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("status",         sa.String(20), nullable=False, server_default="in_progress"),
        sa.Column("started_at",     sa.DateTime(), nullable=False),
        sa.Column("submitted_at",   sa.DateTime(), nullable=True),
        sa.Column("time_taken_sec", sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("rank",           sa.Integer(),  nullable=True),
        sa.UniqueConstraint("session_id", "student_id", name="uq_attempt_session_student"),
    )

    # answers
    op.create_table(
        "answers",
        sa.Column("id",              sa.String(36), primary_key=True),
        sa.Column("attempt_id",      sa.String(36), sa.ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id",     sa.String(36), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("selected_option", sa.Integer(),  nullable=True),
        sa.Column("is_correct",      sa.Boolean(),  nullable=False, server_default="false"),
        sa.Column("marks_awarded",   sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("time_taken_sec",  sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("answered_at",     sa.DateTime(), nullable=False),
        sa.UniqueConstraint("attempt_id", "question_id", name="uq_answer_attempt_question"),
    )

    # leaderboard
    op.create_table(
        "leaderboard",
        sa.Column("id",             sa.String(36), primary_key=True),
        sa.Column("session_id",     sa.String(36), sa.ForeignKey("quiz_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id",     sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_name",   sa.String(255),nullable=False),
        sa.Column("score",          sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("total_marks",    sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("accuracy",       sa.Float(),    nullable=False, server_default="0"),
        sa.Column("rank",           sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("time_taken_sec", sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("submitted_at",   sa.DateTime(), nullable=True),
        sa.Column("updated_at",     sa.DateTime(), nullable=False),
        sa.UniqueConstraint("session_id", "student_id", name="uq_leaderboard_session_student"),
    )
    op.create_index("ix_leaderboard_session_rank", "leaderboard", ["session_id", "rank"])

    # explanations
    op.create_table(
        "explanations",
        sa.Column("id",          sa.String(36), primary_key=True),
        sa.Column("question_id", sa.String(36), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("text",        sa.Text(),     nullable=False),
        sa.Column("is_ai",       sa.Boolean(),  nullable=False, server_default="true"),
        sa.Column("created_at",  sa.DateTime(), nullable=False),
        sa.Column("updated_at",  sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("explanations")
    op.drop_table("leaderboard")
    op.drop_table("answers")
    op.drop_table("attempts")
    op.drop_table("quiz_sessions")
    op.drop_table("options")
    op.drop_table("questions")
    op.drop_table("quizzes")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
