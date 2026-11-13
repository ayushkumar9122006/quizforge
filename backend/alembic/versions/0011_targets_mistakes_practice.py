"""Student target marks, mistake notebook, practice sets

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-13 01:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = set(insp.get_table_names())

    if "target_marks" not in {c["name"] for c in insp.get_columns("users")}:
        op.add_column("users", sa.Column("target_marks", sa.Float(), nullable=True))

    if "mistake_items" not in tables:
        op.create_table(
            "mistake_items",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("question_id", sa.String(36), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("quiz_id", sa.String(36), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("source_attempt_id", sa.String(36), nullable=True),
            sa.Column("origin", sa.String(20), nullable=False, server_default="wrong"),
            sa.Column("status", sa.String(20), nullable=False, server_default="open"),
            sa.Column("correct_streak", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("next_due_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("last_reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("last_result", sa.String(20), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("student_id", "question_id", name="uq_mistake_student_question"),
        )
        op.create_index("ix_mistake_student_status_due", "mistake_items", ["student_id", "status", "next_due_at"])

    if "practice_sets" not in tables:
        op.create_table(
            "practice_sets",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("chapters", sa.JSON(), nullable=False),
            sa.Column("question_ids", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_practice_sets_student_id", "practice_sets", ["student_id"])

    if "practice_answers" not in tables:
        op.create_table(
            "practice_answers",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("set_id", sa.String(36), sa.ForeignKey("practice_sets.id", ondelete="CASCADE"), nullable=False),
            sa.Column("question_id", sa.String(36), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kind", sa.String(20), nullable=False),
            sa.Column("answered_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("set_id", "question_id", name="uq_practice_set_question"),
        )
        op.create_index("ix_practice_answers_set_id", "practice_answers", ["set_id"])


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    tables = set(insp.get_table_names())
    for t in ("practice_answers", "practice_sets", "mistake_items"):
        if t in tables:
            op.drop_table(t)
    if "target_marks" in {c["name"] for c in insp.get_columns("users")}:
        op.drop_column("users", "target_marks")
