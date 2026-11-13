"""Add subject / chapter / chapter_source to questions for progress analytics

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-12 22:30:00

Existing questions get `subject` backfilled from their section name when the
section clearly names a subject (e.g. "Physics", "Chemistry - Section B").
Chapters are left empty; admins tag them from the "Chapters" screen, which can
auto-suggest with AI / keywords.
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("questions")}
    indexes = {i["name"] for i in inspector.get_indexes("questions")}

    if "subject" not in cols:
        op.add_column("questions", sa.Column("subject", sa.String(50), nullable=True))
    if "chapter" not in cols:
        op.add_column("questions", sa.Column("chapter", sa.String(120), nullable=True))
    if "chapter_source" not in cols:
        op.add_column("questions", sa.Column("chapter_source", sa.String(20), nullable=True))

    if "ix_questions_subject" not in indexes:
        op.create_index("ix_questions_subject", "questions", ["subject"])
    if "ix_questions_chapter" not in indexes:
        op.create_index("ix_questions_chapter", "questions", ["chapter"])

    op.execute(
        """
        UPDATE questions SET subject = CASE
            WHEN section ILIKE '%phy%'  THEN 'Physics'
            WHEN section ILIKE '%chem%' THEN 'Chemistry'
            WHEN section ILIKE '%math%' THEN 'Mathematics'
            ELSE NULL END
        WHERE subject IS NULL
        """
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("questions")}
    indexes = {i["name"] for i in inspector.get_indexes("questions")}
    if "ix_questions_chapter" in indexes:
        op.drop_index("ix_questions_chapter", table_name="questions")
    if "ix_questions_subject" in indexes:
        op.drop_index("ix_questions_subject", table_name="questions")
    for c in ("chapter_source", "chapter", "subject"):
        if c in cols:
            op.drop_column("questions", c)
