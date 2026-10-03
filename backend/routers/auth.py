from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from database.config import get_db
from schemas.user import (
    UserCreate, UserLogin, TokenOut, UserOut, RefreshRequest,
    ForgotPasswordRequest, VerifyOtpRequest, VerifyOtpResponse,
    ResetPasswordRequest, GenericMessageResponse
)
from models.all_models import UserRole, User
from crud.user import get_user_by_email, create_user, save_refresh_token, get_refresh_token, revoke_refresh_token
from utils.security import verify_password, create_access_token, create_refresh_token, decode_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    role_str = str(data.role.value if hasattr(data.role, "value") else data.role).lower()
    if role_str == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin registration is restricted. Administrator accounts cannot be created publicly.",
        )
    # Ensure role is explicitly student for public registration
    data.role = UserRole.student
    existing = await get_user_by_email(db, data.email.lower().strip())
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await create_user(db, data)
    return user


@router.post("/login", response_model=TokenOut)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email.lower().strip())
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


# ── Password Recovery Endpoints ────────────────────────────────────────────────

@router.post("/forgot-password/send-otp", response_model=GenericMessageResponse)
async def forgot_password_send_otp(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    import secrets
    from datetime import datetime, timedelta
    from services.email_service import send_otp_email
    from crud.user import get_latest_otp_request, create_password_reset_otp
    from database.config import settings

    target_role = "admin" if str(data.role).lower() == "admin" else "student"
    generic_msg = "If an account exists with this email address, a verification code has been sent."

    clean_email = data.email.lower().strip()
    user = await get_user_by_email(db, clean_email)
    user_role = (user.role.value if hasattr(user.role, "value") else str(user.role)).lower() if user else ""
    if not user or user_role != target_role:
        # Generic response: do not disclose account existence
        return GenericMessageResponse(message=generic_msg)

    # Rate limiting: 60-second cooldown
    latest_otp = await get_latest_otp_request(db, user.id, target_role)
    if latest_otp and (datetime.utcnow() - latest_otp.created_at) < timedelta(seconds=60):
        remaining = 60 - int((datetime.utcnow() - latest_otp.created_at).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {remaining} seconds before requesting a new code.",
        )

    # Generate 6-digit random code
    raw_otp = f"{secrets.randbelow(900000) + 100000}"
    await create_password_reset_otp(
        db, user.id, target_role, raw_otp, expires_minutes=settings.otp_expire_minutes
    )
    await db.commit()

    # Deliver OTP
    delivered = await send_otp_email(
        to_email=user.email,
        name=user.name,
        otp=raw_otp,
        role=target_role,
    )

    if not delivered and settings.is_production:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send verification code. Email delivery service is temporarily unavailable. Please try again later.",
        )

    return GenericMessageResponse(message=generic_msg)


@router.post("/forgot-password/verify-otp", response_model=VerifyOtpResponse)
async def forgot_password_verify_otp(data: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    from crud.user import verify_otp_and_issue_token

    target_role = "admin" if str(data.role).lower() == "admin" else "student"
    clean_email = data.email.lower().strip()
    user = await get_user_by_email(db, clean_email)
    user_role = (user.role.value if hasattr(user.role, "value") else str(user.role)).lower() if user else ""
    if not user or user_role != target_role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code or email.")

    try:
        reset_token = await verify_otp_and_issue_token(db, user.id, target_role, data.otp.strip())
        await db.commit()
        return VerifyOtpResponse(
            reset_token=reset_token,
            message="Verification code verified successfully. You may now reset your password.",
        )
    except ValueError as e:
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/forgot-password/reset-password", response_model=GenericMessageResponse)
async def forgot_password_reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    from crud.user import reset_password_with_token

    target_role = "admin" if str(data.role).lower() == "admin" else "student"
    if len(data.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters.")

    clean_email = data.email.lower().strip()
    user = await get_user_by_email(db, clean_email)
    user_role = (user.role.value if hasattr(user.role, "value") else str(user.role)).lower() if user else ""
    if not user or user_role != target_role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset request.")

    try:
        await reset_password_with_token(
            db, user.id, target_role, data.reset_token, data.new_password
        )
        await db.commit()
        return GenericMessageResponse(
            message="Password changed successfully. You can now sign in with your new password."
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
