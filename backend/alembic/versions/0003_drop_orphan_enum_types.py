"""Drop orphan Postgres ENUM types

main.py's startup init_db() calls Base.metadata.create_all(), which (before
the ORM model fix in this revision's parent commit) auto-created native
Postgres ENUM types (userrole, contenttype, sessionstatus, attemptstatus)
for columns the ORM incorrectly declared as SAEnum(...), even though this
migration always defined those same columns as plain VARCHAR(20). The
mismatch caused 'operator does not exist: character varying = attemptstatus'
on any query filtering those columns (e.g. session/quiz analytics).
The ORM model now declares String(20) for all five affected columns,
matching this migration's actual column types, so create_all() will no
longer recreate these types — this migration drops the leftover ones.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-24 00:10:00
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for enum_name in ("userrole", "contenttype", "sessionstatus", "attemptstatus"):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")


def downgrade() -> None:
    # Types are recreated automatically by SQLAlchemy/create_all if ever
    # needed again; nothing to do here since no column depends on them.
    pass
