"""Add availability to quizzes, review state to answers, and aggregate stats to attempts

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-03 01:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Quizzes table availability window
    op.add_column("quizzes", sa.Column("availability_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("quizzes", sa.Column("availability_end", sa.DateTime(timezone=True), nullable=True))

    # Answers table marked for review flag and text response
    op.add_column("answers", sa.Column("marked_for_review", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("answers", sa.Column("response_text", sa.String(length=500), nullable=True))

    # Attempts table summary statistics
    op.add_column("attempts", sa.Column("accuracy", sa.Float(), server_default="0.0", nullable=False))
    op.add_column("attempts", sa.Column("correct_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("attempts", sa.Column("incorrect_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("attempts", sa.Column("skipped_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("attempts", sa.Column("marked_count", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("attempts", "marked_count")
    op.drop_column("attempts", "skipped_count")
    op.drop_column("attempts", "incorrect_count")
    op.drop_column("attempts", "correct_count")
    op.drop_column("attempts", "accuracy")

    op.drop_column("answers", "response_text")
    op.drop_column("answers", "marked_for_review")

    op.drop_column("quizzes", "availability_end")
    op.drop_column("quizzes", "availability_start")
