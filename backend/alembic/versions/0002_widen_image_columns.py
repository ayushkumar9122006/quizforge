"""Widen image-holding columns from VARCHAR(500) to TEXT

The OCR upload flow (frontend/src/services/ocrService.js,
frontend/src/components/OCR/QuestionImagePanel.jsx) stores full base64
data URLs — not short file paths — in questions.question_image,
questions.explanation_image, questions.diagram, and options.image.
A real cropped image is 2,000-50,000+ characters, so VARCHAR(500)
overflowed on every save containing an image
(asyncpg.exceptions.StringDataRightTruncationError -> HTTP 500).

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-24 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("questions", "question_image",
                     existing_type=sa.String(500), type_=sa.Text(), existing_nullable=True)
    op.alter_column("questions", "explanation_image",
                     existing_type=sa.String(500), type_=sa.Text(), existing_nullable=True)
    op.alter_column("questions", "diagram",
                     existing_type=sa.String(500), type_=sa.Text(), existing_nullable=True)
    op.alter_column("options", "image",
                     existing_type=sa.String(500), type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("questions", "question_image",
                     existing_type=sa.Text(), type_=sa.String(500), existing_nullable=True)
    op.alter_column("questions", "explanation_image",
                     existing_type=sa.Text(), type_=sa.String(500), existing_nullable=True)
    op.alter_column("questions", "diagram",
                     existing_type=sa.Text(), type_=sa.String(500), existing_nullable=True)
    op.alter_column("options", "image",
                     existing_type=sa.Text(), type_=sa.String(500), existing_nullable=True)
