"""
One-time move of existing inline (base64) images from the database to Cloudinary.

    cd backend
    CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> python migrate_images_to_cloudinary.py --dry-run
    CLOUDINARY_URL=... python migrate_images_to_cloudinary.py

Safe to re-run: only values that still start with "data:image/" are uploaded.
Works quiz by quiz and commits after each one. Solution PDFs are left in the DB.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, or_  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402

from database.config import AsyncSessionLocal, engine  # noqa: E402
from models.all_models import Option, Question, Quiz  # noqa: E402
from services.media_service import externalize_question_images, is_enabled, is_data_image  # noqa: E402


async def main(dry_run: bool) -> None:
    if not is_enabled():
        sys.exit("Cloudinary is not configured. Set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET).")
    total = 0
    async with AsyncSessionLocal() as db:
        quiz_ids = (await db.execute(
            select(Question.quiz_id).outerjoin(Option, Option.question_id == Question.id).where(or_(
                Question.question_image.like("data:image/%"),
                Question.diagram.like("data:image/%"),
                Question.explanation_image.like("data:image/%"),
                Option.image.like("data:image/%"),
            )).distinct()
        )).scalars().all()
        print(f"{len(quiz_ids)} quiz(zes) contain inline images")
        for qid in quiz_ids:
            quiz = (await db.execute(
                select(Quiz).options(selectinload(Quiz.questions).selectinload(Question.options)).where(Quiz.id == qid)
            )).scalar_one()
            inline = sum(
                is_data_image(q.question_image) + is_data_image(q.diagram) + is_data_image(q.explanation_image)
                + sum(is_data_image(o.image) for o in q.options)
                for q in quiz.questions
            )
            if dry_run:
                print(f"  would upload {inline:4d} image(s) from: {quiz.title}")
                total += inline
                continue
            n = await externalize_question_images(quiz.questions)
            await db.commit()
            total += n
            print(f"  uploaded {n:4d}/{inline} image(s) from: {quiz.title}")
    await engine.dispose()
    print(("Would upload" if dry_run else "Uploaded"), total, "image(s).")


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
