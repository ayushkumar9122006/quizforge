from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from models.all_models import UserRole
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=100)
    role: UserRole = UserRole.student


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    is_active: bool
    avatar_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    role: str = "student" # "student" | "admin"


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    role: str = "student" # "student" | "admin"


class VerifyOtpResponse(BaseModel):
    reset_token: str
    message: str = "Verification code verified successfully."


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str = Field(min_length=6, max_length=100)
    role: str = "student" # "student" | "admin"


class GenericMessageResponse(BaseModel):
    message: str
