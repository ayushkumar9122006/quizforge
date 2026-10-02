import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from models.all_models import Base, User, Quiz, Question, Option
from services.pdf_importer_service import analyze_pdf
from crud.quiz import create_quiz, get_quiz, add_questions_to_quiz
from schemas.quiz import QuizCreate, QuestionCreate, OptionCreate, BulkImportQuestionItem, BulkImportOptionItem

PDF_PATH = "/Users/ayushkumar/Downloads/JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf"
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

async def test_bulk_importer():
    print("=== 1. Testing PDF Analysis Engine ===")
    assert os.path.exists(PDF_PATH), f"PDF file not found at {PDF_PATH}"
    
    with open(PDF_PATH, "rb") as f:
        pdf_bytes = f.read()
    
    result = await analyze_pdf(
        file_bytes=pdf_bytes,
        filename="JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf",
        default_pos_marks=4.0,
        default_neg_marks=1.0,
        default_section="Chemistry",
    )
    
    print(f"File: {result.filename}")
    print(f"Total Questions Extracted: {result.total_questions}")
    print(f"Ready Questions: {result.ready_count}")
    print(f"Needs Review Questions: {result.needs_review_count}")

    # Assertions on extraction
    assert result.total_questions == 35, f"Expected 35 questions, got {result.total_questions}"
    assert result.ready_count == 35, f"Expected 35 ready questions, got {result.ready_count}"
    assert result.needs_review_count == 0, f"Expected 0 needs_review questions, got {result.needs_review_count}"

    # Verify each question has proper structure
    match_column_indices = [10, 11, 15, 16, 17, 26, 29, 32, 33, 35]
    for q in result.questions:
        assert q.question_number >= 1 and q.question_number <= 35
        assert len(q.text.strip()) > 10, f"Question {q.question_number} text too short"
        assert len(q.options) == 4, f"Question {q.question_number} expected 4 options, got {len(q.options)}"
        assert q.correct_answer in [0, 1, 2, 3], f"Question {q.question_number} invalid correct_answer {q.correct_answer}"
        assert q.positive_marks == 4.0
        assert q.negative_marks == 1.0
        assert q.section in ["Chemical Kinetics", "General Organic Chemistry", "Chemistry"]
        assert q.source_image is not None, f"Question {q.question_number} missing source preview image"

        if q.question_number in match_column_indices:
            assert q.question_type == "match_column", f"Question {q.question_number} should be match_column, got {q.question_type}"
        else:
            assert q.question_type == "single_correct", f"Question {q.question_number} should be single_correct, got {q.question_type}"

    # Verify specific diagram presence for known diagram questions
    q3 = next(q for q in result.questions if q.question_number == 3)
    img_data = q3.question_image or q3.diagram
    assert img_data is not None, "Question 3 (Arrhenius graph) should have extracted diagram"
    assert img_data.startswith("data:image/"), "Question 3 diagram must be base64 data URL"

    print("✓ All 35 questions extracted and validated successfully.")

    print("\n=== 2. Testing Database Persistence (create_quiz & add_questions_to_quiz) ===")
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        # Create Admin User
        admin = User(name="QuiZee Admin", email="admin@quizee.com", hashed_password="pw", role="admin")
        db.add(admin)
        await db.commit()
        await db.refresh(admin)

        # Test A: Create quiz with first 20 imported questions
        initial_20_qs = [
            QuestionCreate(
                text=q.text,
                diagram=q.diagram,
                question_image=q.question_image,
                section=q.section,
                positive_marks=q.positive_marks,
                negative_marks=q.negative_marks,
                question_type=q.question_type,
                raw_answer=q.raw_answer,
                match_data=q.match_data,
                correct_answer=q.correct_answer,
                options=[
                    OptionCreate(text=opt.text, order_index=idx)
                    for idx, opt in enumerate(q.options)
                ]
            )
            for q in result.questions[:20]
        ]

        quiz_payload = QuizCreate(
            title="JEE Main GOC & Kinetics Part 1",
            instructions="• Auto-imported from QuiZee Bulk PDF Engine.",
            time_per_q_sec=180,
            questions=initial_20_qs
        )

        created_quiz = await create_quiz(db, quiz_payload, creator_id=admin.id)
        assert created_quiz.id is not None
        loaded_initial = await get_quiz(db, created_quiz.id)
        assert len(loaded_initial.questions) == 20
        assert loaded_initial.total_marks == 20 * 4.0
        print(f"✓ Created quiz #{created_quiz.id} with initial 20 questions. Total marks: {loaded_initial.total_marks}")

        # Test B: Append the remaining 15 questions via add_questions_to_quiz
        remaining_15_import_items = [
            QuestionCreate(
                text=q.text,
                diagram=q.diagram,
                question_image=q.question_image,
                section=q.section,
                positive_marks=q.positive_marks,
                negative_marks=q.negative_marks,
                question_type=q.question_type,
                raw_answer=q.raw_answer,
                match_data=q.match_data,
                correct_answer=q.correct_answer,
                options=[
                    OptionCreate(text=opt.text, order_index=idx)
                    for idx, opt in enumerate(q.options)
                ]
            )
            for q in result.questions[20:]
        ]

        updated_quiz = await add_questions_to_quiz(db, created_quiz.id, remaining_15_import_items)
        assert updated_quiz is not None
        await db.commit()
        print(f"✓ Appended remaining 15 questions to quiz #{created_quiz.id}")

        # Verify full quiz status in DB via a fresh session (emulating separate HTTP request)
        async with session_factory() as verify_db:
            final_quiz = await get_quiz(verify_db, created_quiz.id)
            assert len(final_quiz.questions) == 35, f"Expected 35 total questions, got {len(final_quiz.questions)}"
            assert final_quiz.total_marks == 35 * 4.0, f"Expected 140.0 total marks, got {final_quiz.total_marks}"

            # Verify Match-the-Column question properties in DB
            match_qs = [q for q in final_quiz.questions if q.question_type == "match_column"]
            assert len(match_qs) == 10, f"Expected 10 match_column questions, found {len(match_qs)}"
            for q_match in match_qs:
                assert len(q_match.options) == 4, f"Question {q_match.order_index} expected 4 options"
                assert q_match.correct_answer in [0, 1, 2, 3], f"Question {q_match.order_index} invalid correct answer"
                # Check Image-First vs Text-Only match question properties
                if q_match.order_index in [25, 28, 31, 32, 34]: # Q26, Q29, Q32, Q33, Q35
                    assert q_match.diagram is not None, f"Visual match Question {q_match.order_index+1} missing cropped table diagram"
                    assert q_match.diagram.startswith("data:image/"), f"Visual match Question {q_match.order_index+1} diagram must be data URL"
                    assert "(A)" not in q_match.text, f"Visual match Question {q_match.order_index+1} must not have appended reconstructed rows"
                    assert "Structure shown in diagram" not in q_match.text, f"Visual match Question {q_match.order_index+1} must not contain generic placeholders"
                else: # Text-only match questions: Q10, Q11, Q15, Q16, Q17
                    assert q_match.match_data is not None, f"Text-only match Question {q_match.order_index+1} missing match_data"
            print(f"✓ Verified all 10 Match-the-Column questions: 5 visual match questions have complete cropped tables in diagram with clean intro statements, and 5 text-only match questions have structured match_data.")

        await engine.dispose()

    print("\n🎉 ALL BULK IMPORTER TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_bulk_importer())
