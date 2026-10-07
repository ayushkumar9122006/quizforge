import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import select, func, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from models.all_models import Notice, NoticeRead, User
from schemas.notice import NoticeCreate, NoticeUpdate, NoticeOut


async def create_notice(db: AsyncSession, notice_in: NoticeCreate, creator_id: str) -> Notice:
    notice = Notice(
        title=notice_in.title.strip(),
        content=notice_in.content.strip(),
        priority=notice_in.priority.value if hasattr(notice_in.priority, "value") else str(notice_in.priority),
        is_active=notice_in.is_active,
        pinned=notice_in.pinned,
        creator_id=creator_id,
        attachment_url=notice_in.attachment_url,
        attachment_name=notice_in.attachment_name,
        expires_at=notice_in.expires_at,
    )
    db.add(notice)
    await db.commit()
    await db.refresh(notice)
    return notice


async def get_notice(db: AsyncSession, notice_id: str) -> Optional[Notice]:
    result = await db.execute(select(Notice).where(Notice.id == notice_id))
    return result.scalar_one_or_none()


async def update_notice(db: AsyncSession, notice_id: str, notice_update: NoticeUpdate) -> Optional[Notice]:
    notice = await get_notice(db, notice_id)
    if not notice:
        return None

    update_data = notice_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "priority" and value is not None:
            setattr(notice, field, value.value if hasattr(value, "value") else str(value))
        elif field in ("title", "content") and value is not None:
            setattr(notice, field, value.strip())
        else:
            setattr(notice, field, value)

    notice.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(notice)
    return notice


async def delete_notice(db: AsyncSession, notice_id: str) -> bool:
    notice = await get_notice(db, notice_id)
    if not notice:
        return False
    await db.delete(notice)
    await db.commit()
    return True


def _active_filter():
    now = datetime.utcnow()
    return and_(
        Notice.is_active.is_(True),
        or_(Notice.expires_at.is_(None), Notice.expires_at > now)
    )


async def get_active_notices_for_student(db: AsyncSession, user_id: str) -> List[NoticeOut]:
    now = datetime.utcnow()
    # Query active, non-expired notices
    query = (
        select(Notice, User.name.label("creator_name"))
        .join(User, Notice.creator_id == User.id, isouter=True)
        .where(_active_filter())
        .order_by(Notice.pinned.desc(), Notice.created_at.desc())
    )
    result = await db.execute(query)
    rows = result.all()

    # Query notice_reads for this student
    read_result = await db.execute(
        select(NoticeRead.notice_id).where(NoticeRead.user_id == user_id)
    )
    read_notice_ids = set(read_result.scalars().all())

    out_list = []
    for notice, creator_name in rows:
        out_list.append(NoticeOut(
            id=notice.id,
            title=notice.title,
            content=notice.content,
            priority=notice.priority,
            is_active=notice.is_active,
            pinned=notice.pinned,
            creator_id=notice.creator_id,
            creator_name=creator_name or "Instructor",
            attachment_url=notice.attachment_url,
            attachment_name=notice.attachment_name,
            expires_at=notice.expires_at,
            created_at=notice.created_at,
            updated_at=notice.updated_at,
            is_read=(notice.id in read_notice_ids),
        ))
    return out_list


async def get_all_notices_admin(db: AsyncSession) -> List[NoticeOut]:
    query = (
        select(Notice, User.name.label("creator_name"))
        .join(User, Notice.creator_id == User.id, isouter=True)
        .order_by(Notice.pinned.desc(), Notice.created_at.desc())
    )
    result = await db.execute(query)
    rows = result.all()

    out_list = []
    for notice, creator_name in rows:
        out_list.append(NoticeOut(
            id=notice.id,
            title=notice.title,
            content=notice.content,
            priority=notice.priority,
            is_active=notice.is_active,
            pinned=notice.pinned,
            creator_id=notice.creator_id,
            creator_name=creator_name or "Admin",
            attachment_url=notice.attachment_url,
            attachment_name=notice.attachment_name,
            expires_at=notice.expires_at,
            created_at=notice.created_at,
            updated_at=notice.updated_at,
            is_read=True,
        ))
    return out_list


async def get_student_unread_count(db: AsyncSession, user_id: str) -> int:
    """
    Returns the count of active, non-expired notices that have NOT been read
    by the specified student.
    """
    # Subquery for read notice_ids by user
    read_subquery = (
        select(NoticeRead.notice_id)
        .where(NoticeRead.user_id == user_id)
        .scalar_subquery()
    )

    query = (
        select(func.count(Notice.id))
        .where(
            _active_filter(),
            Notice.id.not_in(read_subquery)
        )
    )
    result = await db.execute(query)
    count = result.scalar_one_or_none()
    return count or 0


async def mark_notices_as_read(
    db: AsyncSession,
    user_id: str,
    notice_ids: Optional[List[str]] = None
) -> int:
    """
    Idempotently marks active, non-expired notices as read for user_id.
    If notice_ids is None, marks all currently active non-expired notices.
    Returns the number of newly marked records.
    """
    # Find eligible notice IDs
    query = select(Notice.id).where(_active_filter())
    if notice_ids is not None:
        if not notice_ids:
            return 0
        query = query.where(Notice.id.in_(notice_ids))

    result = await db.execute(query)
    eligible_ids = result.scalars().all()

    if not eligible_ids:
        return 0

    # PostgreSQL INSERT ... ON CONFLICT DO NOTHING for strict idempotency
    records = [
        {"id": str(uuid.uuid4()), "notice_id": nid, "user_id": user_id, "read_at": datetime.utcnow()}
        for nid in eligible_ids
    ]
    stmt = (
        pg_insert(NoticeRead)
        .values(records)
        .on_conflict_do_nothing(index_elements=["notice_id", "user_id"])
    )
    res = await db.execute(stmt)
    await db.commit()
    return res.rowcount if res.rowcount is not None and res.rowcount >= 0 else len(records)
