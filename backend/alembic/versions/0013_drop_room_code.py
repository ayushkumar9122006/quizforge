"""Drop quiz_sessions.room_code (room codes were removed; students start tests directly)

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-19 21:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "room_code" in {c["name"] for c in insp.get_columns("quiz_sessions")}:
        indexes = {ix["name"] for ix in insp.get_indexes("quiz_sessions")}
        if "ix_quiz_sessions_room_code" in indexes:
            op.drop_index("ix_quiz_sessions_room_code", table_name="quiz_sessions")
        # dropping the column also drops its UNIQUE constraint
        op.drop_column("quiz_sessions", "room_code")


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "room_code" not in {c["name"] for c in insp.get_columns("quiz_sessions")}:
        op.add_column("quiz_sessions", sa.Column("room_code", sa.String(6), nullable=True))
        op.execute("UPDATE quiz_sessions SET room_code = upper(substr(md5(id), 1, 6))")
        op.create_index("ix_quiz_sessions_room_code", "quiz_sessions", ["room_code"])
