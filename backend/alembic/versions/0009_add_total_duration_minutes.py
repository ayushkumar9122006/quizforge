"""Add total_duration_minutes to quizzes table

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-07 21:30:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [c["name"] for c in inspector.get_columns("quizzes")]
    
    if "total_duration_minutes" not in existing_columns:
        op.add_column(
            "quizzes",
            sa.Column("total_duration_minutes", sa.Float(), nullable=True)
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [c["name"] for c in inspector.get_columns("quizzes")]
    
    if "total_duration_minutes" in existing_columns:
        op.drop_column("quizzes", "total_duration_minutes")
