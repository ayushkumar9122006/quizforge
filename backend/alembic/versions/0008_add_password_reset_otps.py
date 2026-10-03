"""Add password_reset_otps table

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-03 20:25:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "password_reset_otps",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="student"),
        sa.Column("hashed_otp", sa.String(length=255), nullable=False),
        sa.Column("reset_token", sa.String(length=255), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_password_reset_otps_user_id", "password_reset_otps", ["user_id"])
    op.create_index("ix_password_reset_otps_reset_token", "password_reset_otps", ["reset_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_password_reset_otps_reset_token", table_name="password_reset_otps")
    op.drop_index("ix_password_reset_otps_user_id", table_name="password_reset_otps")
    op.drop_table("password_reset_otps")
