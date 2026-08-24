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
