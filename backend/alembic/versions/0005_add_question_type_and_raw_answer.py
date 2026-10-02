"""Add question_type and raw_answer to questions table

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-06 17:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column("question_type", sa.String(50), nullable=False, server_default="single_correct")
    )
    op.add_column(
        "questions",
        sa.Column("raw_answer", sa.String(255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("questions", "raw_answer")
    op.drop_column("questions", "question_type")
