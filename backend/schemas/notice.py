from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from models.all_models import NoticePriority


class NoticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    priority: NoticePriority = NoticePriority.medium
    is_active: bool = True
    pinned: bool = False
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    expires_at: Optional[datetime] = None


class NoticeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    content: Optional[str] = Field(default=None, min_length=1)
    priority: Optional[NoticePriority] = None
    is_active: Optional[bool] = None
    pinned: Optional[bool] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    expires_at: Optional[datetime] = None


class NoticeOut(BaseModel):
    id: str
    title: str
    content: str
    priority: str
    is_active: bool
    pinned: bool
    creator_id: str
    creator_name: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    is_read: Optional[bool] = False

    model_config = {"from_attributes": True}


class UnreadCountOut(BaseModel):
    unread_count: int


class MarkReadRequest(BaseModel):
    notice_ids: Optional[List[str]] = None


class MarkReadResponse(BaseModel):
    status: str = "ok"
    marked_count: int
    unread_count: int
