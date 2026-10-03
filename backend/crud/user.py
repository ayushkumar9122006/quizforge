from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.all_models import User, RefreshToken
from schemas.user import UserCreate
from utils.security import hash_password
from datetime import datetime
from typing import Optional


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    user = User(
        email=data.email,
        name=data.name,
        hashed_password=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    await db.flush()
    return user


async def save_refresh_token(db: AsyncSession, user_id: str, token: str, expires_at: datetime) -> RefreshToken:
    rt = RefreshToken(user_id=user_id, token=token, expires_at=expires_at)
    db.add(rt)
    await db.flush()
    return rt


async def get_refresh_token(db: AsyncSession, token: str) -> Optional[RefreshToken]:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == token, RefreshToken.revoked == False)
    )
    return result.scalar_one_or_none()


async def revoke_refresh_token(db: AsyncSession, token: str) -> None:
    rt = await get_refresh_token(db, token)
    if rt:
        rt.revoked = True
        await db.flush()


async def revoke_all_user_refresh_tokens(db: AsyncSession, user_id: str) -> None:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)
    )
    for rt in result.scalars().all():
        rt.revoked = True
    await db.flush()


# ── Password Reset OTP Functions ───────────────────────────────────────────────

async def get_latest_otp_request(db: AsyncSession, user_id: str, role: str):
    from models.all_models import PasswordResetOTP
    result = await db.execute(
        select(PasswordResetOTP)
        .where(
            PasswordResetOTP.user_id == user_id,
            PasswordResetOTP.role == role,
            PasswordResetOTP.consumed == False,
        )
        .order_by(PasswordResetOTP.created_at.desc())
    )
    return result.scalar_one_or_none()


async def create_password_reset_otp(db: AsyncSession, user_id: str, role: str, raw_otp: str, expires_minutes: int = 5):
    from models.all_models import PasswordResetOTP
    from utils.security import hash_password
    from datetime import timedelta

    # Invalidate previous unconsumed OTPs for this user and role
    result = await db.execute(
        select(PasswordResetOTP).where(
            PasswordResetOTP.user_id == user_id,
            PasswordResetOTP.role == role,
            PasswordResetOTP.consumed == False,
        )
    )
    for existing in result.scalars().all():
        existing.consumed = True

    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=expires_minutes)
    hashed_otp = hash_password(raw_otp)

    record = PasswordResetOTP(
        user_id=user_id,
        role=role,
        hashed_otp=hashed_otp,
        expires_at=expires_at,
        consumed=False,
        attempts=0,
        created_at=now,
    )
    db.add(record)
    await db.flush()
    return record


async def verify_otp_and_issue_token(db: AsyncSession, user_id: str, role: str, raw_otp: str) -> str:
    import secrets
    from models.all_models import PasswordResetOTP
    from utils.security import verify_password

    record = await get_latest_otp_request(db, user_id, role)
    if not record:
        raise ValueError("No active verification code found. Please request a new one.")

    if datetime.utcnow() > record.expires_at:
        record.consumed = True
        await db.flush()
        raise ValueError("Verification code has expired. Please request a new one.")

    if record.attempts >= 5:
        record.consumed = True
        await db.flush()
        raise ValueError("Too many incorrect attempts. Please request a new verification code.")

    if not verify_password(raw_otp, record.hashed_otp):
        record.attempts += 1
        await db.flush()
        remaining = max(0, 5 - record.attempts)
        raise ValueError(f"Invalid verification code. {remaining} attempt(s) remaining.")

    if record.reset_token:
        raise ValueError("This verification code has already been verified. Please proceed with password reset or request a new code.")

    # Valid OTP! Issue single-use reset token
    reset_token = secrets.token_urlsafe(32)
    record.reset_token = reset_token
    await db.flush()
    return reset_token


async def validate_reset_token(db: AsyncSession, user_id: str, role: str, reset_token: str):
    from models.all_models import PasswordResetOTP
    result = await db.execute(
        select(PasswordResetOTP).where(
            PasswordResetOTP.user_id == user_id,
            PasswordResetOTP.role == role,
            PasswordResetOTP.reset_token == reset_token,
            PasswordResetOTP.consumed == False,
        )
    )
    record = result.scalar_one_or_none()
    if not record or datetime.utcnow() > record.expires_at:
        return None
    return record


async def reset_password_with_token(db: AsyncSession, user_id: str, role: str, reset_token: str, new_password: str) -> User:
    from models.all_models import User
    from utils.security import hash_password

    record = await validate_reset_token(db, user_id, role, reset_token)
    if not record:
        raise ValueError("Invalid or expired reset session. Please request a new verification code.")

    user = await get_user_by_id(db, user_id)
    if not user or user.role != role:
        raise ValueError("User not found or role mismatch.")

    user.hashed_password = hash_password(new_password)
    user.updated_at = datetime.utcnow()
    record.consumed = True

    # Revoke all existing sessions / refresh tokens
    await revoke_all_user_refresh_tokens(db, user_id)
    await db.flush()
    return user
