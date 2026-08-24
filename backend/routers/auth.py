from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from database.config import get_db
from schemas.user import UserCreate, UserLogin, TokenOut, UserOut, RefreshRequest
from crud.user import get_user_by_email, create_user, save_refresh_token, get_refresh_token, revoke_refresh_token
from utils.security import verify_password, create_access_token, create_refresh_token, decode_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await create_user(db, data)
    return user


@router.post("/login", response_model=TokenOut)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    access_token = create_access_token({"sub": user.id, "role": user.role})
    refresh_token, expires_at = create_refresh_token({"sub": user.id})
    await save_refresh_token(db, user.id, refresh_token, expires_at)

    return TokenOut(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenOut)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    rt = await get_refresh_token(db, data.refresh_token)
    if not rt:
        raise HTTPException(status_code=401, detail="Refresh token expired or revoked")

    from crud.user import get_user_by_id
    user = await get_user_by_id(db, rt.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate: revoke old, issue new
    await revoke_refresh_token(db, data.refresh_token)
    access_token = create_access_token({"sub": user.id, "role": user.role})
    new_refresh, expires_at = create_refresh_token({"sub": user.id})
    await save_refresh_token(db, user.id, new_refresh, expires_at)

    return TokenOut(
        access_token=access_token,
        refresh_token=new_refresh,
        user=UserOut.model_validate(user),
    )


@router.post("/logout")
async def logout(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    await revoke_refresh_token(db, data.refresh_token)
    return {"message": "Logged out successfully"}
