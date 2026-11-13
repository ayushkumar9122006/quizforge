"""Daily goal + notebook review log (streaks, badges)

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-13 12:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if "daily_goal" not in {c["name"] for c in insp.get_columns("users")}:
        op.add_column("users", sa.Column("daily_goal", sa.Integer(), nullable=False, server_default="10"))

    if "mistake_reviews" not in set(insp.get_table_names()):
        op.create_table(
            "mistake_reviews",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("student_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("item_id", sa.String(36), sa.ForeignKey("mistake_items.id", ondelete="CASCADE"), nullable=False),
            sa.Column("question_id", sa.String(36), nullable=False),
            sa.Column("result", sa.String(20), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_mistake_reviews_student_time", "mistake_reviews", ["student_id", "reviewed_at"])
        # Seed the log with each item's last review so existing streaks aren't lost
        if conn.dialect.name == "postgresql":
            op.execute(
                "INSERT INTO mistake_reviews (id, student_id, item_id, question_id, result, reviewed_at) "
                "SELECT gen_random_uuid()::text, student_id, id, question_id, COALESCE(last_result, 'wrong'), last_reviewed_at "
                "FROM mistake_items WHERE last_reviewed_at IS NOT NULL"
            )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "mistake_reviews" in set(insp.get_table_names()):
        op.drop_table("mistake_reviews")
    if "daily_goal" in {c["name"] for c in insp.get_columns("users")}:
        op.drop_column("users", "daily_goal")
