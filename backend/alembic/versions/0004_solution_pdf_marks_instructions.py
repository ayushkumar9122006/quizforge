"""Add positive_marks, negative_marks, instructions, solution_pdf and float score types

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-06 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Quizzes: instructions, solution_pdf, solution_pdf_name, total_marks as Float
    op.add_column("quizzes", sa.Column("instructions", sa.Text(), nullable=True))
    op.add_column("quizzes", sa.Column("solution_pdf", sa.Text(), nullable=True))
    op.add_column("quizzes", sa.Column("solution_pdf_name", sa.String(255), nullable=True))
    op.alter_column("quizzes", "total_marks",
                    existing_type=sa.Integer(), type_=sa.Float(),
                    existing_nullable=False, existing_server_default=None)

    # 2. Questions: positive_marks, negative_marks, marks as Float
    op.add_column("questions", sa.Column("positive_marks", sa.Float(), nullable=False, server_default="1.0"))
    op.add_column("questions", sa.Column("negative_marks", sa.Float(), nullable=False, server_default="0.0"))
    op.alter_column("questions", "marks",
                    existing_type=sa.Integer(), type_=sa.Float(),
                    existing_nullable=False, existing_server_default=None)
    # Backfill positive_marks from existing marks
    op.execute("UPDATE questions SET positive_marks = marks WHERE positive_marks IS NULL OR positive_marks = 1.0")

    # 3. Attempts: score, total_marks as Float
    op.alter_column("attempts", "score",
                    existing_type=sa.Integer(), type_=sa.Float(),
                    existing_nullable=False, existing_server_default=None)
    op.alter_column("attempts", "total_marks",
                    existing_type=sa.Integer(), type_=sa.Float(),
                    existing_nullable=False, existing_server_default=None)

    # 4. Answers: marks_awarded as Float
    op.alter_column("answers", "marks_awarded",
                    existing_type=sa.Integer(), type_=sa.Float(),
                    existing_nullable=False, existing_server_default=None)

    # 5. Leaderboard: score, total_marks as Float
    op.alter_column("leaderboard", "score",
                    existing_type=sa.Integer(), type_=sa.Float(),
                    existing_nullable=False, existing_server_default=None)
    op.alter_column("leaderboard", "total_marks",
                    existing_type=sa.Integer(), type_=sa.Float(),
                    existing_nullable=False, existing_server_default=None)


def downgrade() -> None:
    op.drop_column("quizzes", "solution_pdf_name")
    op.drop_column("quizzes", "solution_pdf")
    op.drop_column("quizzes", "instructions")
    op.alter_column("quizzes", "total_marks",
                    existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=False)

    op.drop_column("questions", "negative_marks")
    op.drop_column("questions", "positive_marks")
    op.alter_column("questions", "marks",
                    existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=False)

    op.alter_column("attempts", "score",
                    existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=False)
    op.alter_column("attempts", "total_marks",
                    existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=False)

    op.alter_column("answers", "marks_awarded",
                    existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=False)

    op.alter_column("leaderboard", "score",
                    existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=False)
    op.alter_column("leaderboard", "total_marks",
                    existing_type=sa.Float(), type_=sa.Integer(), existing_nullable=False)
