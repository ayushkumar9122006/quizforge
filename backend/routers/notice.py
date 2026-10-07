from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from database.config import get_db
from models.all_models import User
from schemas.notice import (
    NoticeCreate,
    NoticeUpdate,
    NoticeOut,
    UnreadCountOut,
    MarkReadRequest,
    MarkReadResponse,
)
from crud import notice as notice_crud
from utils.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/notices", tags=["Notices"])


@router.get("/unread-count", response_model=UnreadCountOut)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the count of active, unexpired notices not yet read by the current user.
    """
    count = await notice_crud.get_student_unread_count(db, current_user.id)
    return UnreadCountOut(unread_count=count)


@router.post("/mark-read", response_model=MarkReadResponse)
async def mark_read(
    payload: Optional[MarkReadRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Marks active, non-expired notices as read for the current user.
    Idempotent: Duplicate calls will not produce duplicate records or errors.
    """
    notice_ids = payload.notice_ids if payload else None
    marked = await notice_crud.mark_notices_as_read(db, current_user.id, notice_ids)
    remaining = await notice_crud.get_student_unread_count(db, current_user.id)
    return MarkReadResponse(
        status="ok",
        marked_count=marked,
        unread_count=remaining,
    )


@router.get("/", response_model=List[NoticeOut])
async def list_active_notices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists active, non-expired notices ordered by pinned first, then newest first.
    Includes per-student is_read flag.
    """
    return await notice_crud.get_active_notices_for_student(db, current_user.id)


@router.get("/admin", response_model=List[NoticeOut])
async def list_all_notices_admin(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: Lists all notices including inactive and expired.
    """
    return await notice_crud.get_all_notices_admin(db)


@router.post("/", response_model=NoticeOut, status_code=status.HTTP_201_CREATED)
async def create_notice(
    notice_in: NoticeCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: Creates and publishes a new announcement.
    """
    notice = await notice_crud.create_notice(db, notice_in, current_user.id)
    return NoticeOut(
        id=notice.id,
        title=notice.title,
        content=notice.content,
        priority=notice.priority,
        is_active=notice.is_active,
        pinned=notice.pinned,
        creator_id=notice.creator_id,
        creator_name=current_user.name,
        attachment_url=notice.attachment_url,
        attachment_name=notice.attachment_name,
        expires_at=notice.expires_at,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
        is_read=True,
    )


@router.get("/{notice_id}", response_model=NoticeOut)
async def get_notice_details(
    notice_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns full details for a single notice.
    """
    notice = await notice_crud.get_notice(db, notice_id)
    if not notice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notice not found",
        )
    # Check if student and notice is inactive
    if current_user.role != "admin" and not notice.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notice not found",
        )

    # Check read status for student
    is_read = False
    if current_user.role == "admin":
        is_read = True
    else:
        # Check notice_reads
        from sqlalchemy import select
        from models.all_models import NoticeRead
        res = await db.execute(
            select(NoticeRead).where(
                NoticeRead.notice_id == notice_id,
                NoticeRead.user_id == current_user.id
            )
        )
        is_read = res.scalar_one_or_none() is not None

    return NoticeOut(
        id=notice.id,
        title=notice.title,
        content=notice.content,
        priority=notice.priority,
        is_active=notice.is_active,
        pinned=notice.pinned,
        creator_id=notice.creator_id,
        creator_name=notice.creator.name if notice.creator else "Instructor",
        attachment_url=notice.attachment_url,
        attachment_name=notice.attachment_name,
        expires_at=notice.expires_at,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
        is_read=is_read,
    )


@router.patch("/{notice_id}", response_model=NoticeOut)
async def update_notice(
    notice_id: str,
    notice_update: NoticeUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: Updates an existing notice without clearing existing read receipts.
    """
    notice = await notice_crud.update_notice(db, notice_id, notice_update)
    if not notice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notice not found",
        )
    return NoticeOut(
        id=notice.id,
        title=notice.title,
        content=notice.content,
        priority=notice.priority,
        is_active=notice.is_active,
        pinned=notice.pinned,
        creator_id=notice.creator_id,
        creator_name=current_user.name,
        attachment_url=notice.attachment_url,
        attachment_name=notice.attachment_name,
        expires_at=notice.expires_at,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
        is_read=True,
    )


@router.delete("/{notice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notice(
    notice_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin-only: Permanently deletes a notice.
    """
    success = await notice_crud.delete_notice(db, notice_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notice not found",
        )
    return None
