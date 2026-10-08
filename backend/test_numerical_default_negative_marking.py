"""
Test suite to verify that default negative marking for Numerical Answer questions is 1.0:
1. Manual question creation defaults Numerical questions to +4 / -1.
2. Custom negative marks (e.g. 0 or 2) chosen by admin are strictly preserved.
3. PDF bulk import defaults Numerical questions to +4 / -1.
4. Student attempt scoring applies -1 for incorrect numerical answers, +4 for correct, 0 for skipped.
5. Response sheet PDF displays configured -1 for incorrect numerical answers.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from models.all_models import (
    Base, Quiz, Question, Option, QuizSession, Attempt, Answer, User, AttemptStatus
)
from schemas.quiz import QuizCreate, QuestionCreate, OptionCreate
from schemas.session import AttemptSubmit, AnswerSubmit
from crud.quiz import create_quiz
from crud.session import submit_attempt
from services.pdf_importer_service import analyze_pdf
from services.response_sheet_service import generate_response_sheet_pdf
import pymupdf


async def run_numerical_marking_tests():
    print("=== STARTING NUMERICAL DEFAULT NEGATIVE MARKING TESTS ===")

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    # Setup database
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Create test admin & student
        test_admin = User(name="Admin", email=f"admin_{datetime.now().timestamp()}@quiz.com", hashed_password="pw", role="admin")
        test_student = User(name="Student", email=f"student_{datetime.now().timestamp()}@quiz.com", hashed_password="pw", role="student")
        db.add_all([test_admin, test_student])
        await db.commit()
        await db.refresh(test_admin)
        await db.refresh(test_student)

        # ── TEST 1: Manual question creation defaults Numerical to +4 / -1 ──
        print("\n[TEST 1] Testing manual question creation defaults for Numerical questions...")
        quiz_data = QuizCreate(
            title="Numerical Default Marks Test",
            questions=[
                # Q1: Numerical without explicit marks -> MUST default to +4 / -1
                QuestionCreate(
                    order_index=0,
                    section="Section A",
                    text="Calculate Planck constant in arbitrary units (Numerical default)",
                    question_type="numerical",
                    raw_answer="6.63",
                    positive_marks=None,
                    negative_marks=None,
                    options=[]
                ),
                # Q2: Numerical with custom admin negative_marks = 0 -> MUST preserve 0
                QuestionCreate(
                    order_index=1,
                    section="Section A",
                    text="Calculate gravitational acceleration (Numerical custom 0)",
                    question_type="numerical",
                    raw_answer="9.8",
                    positive_marks=4.0,
                    negative_marks=0.0,
                    options=[]
                ),
                # Q3: Numerical with custom admin negative_marks = 2 -> MUST preserve 2
                QuestionCreate(
                    order_index=2,
                    section="Section A",
                    text="Calculate Rydberg constant (Numerical custom 2)",
                    question_type="numerical",
                    raw_answer="1.09",
                    positive_marks=4.0,
                    negative_marks=2.0,
                    options=[]
                ),
                # Q4: Single Correct MCQ without explicit marks -> preserves single_correct default
                QuestionCreate(
                    order_index=3,
                    section="Section B",
                    text="What is light? (Single Correct MCQ)",
                    question_type="single_correct",
                    correct_answer=0,
                    options=[OptionCreate(order_index=0, text="Wave-particle duality")]
                )
            ]
        )

        from crud.quiz import create_quiz, get_quiz
        created_quiz = await create_quiz(db, quiz_data, test_admin.id)
        assert created_quiz is not None, "Quiz creation failed"
        quiz = await get_quiz(db, created_quiz.id)
        assert quiz is not None, "Quiz retrieval failed"

        # Verify Q1 (Numerical default)
        q1 = quiz.questions[0]
        print(f"  Q1 ({q1.question_type}): positive_marks={q1.positive_marks}, negative_marks={q1.negative_marks}")
        assert q1.positive_marks == 4.0, f"Expected pos 4.0, got {q1.positive_marks}"
        assert q1.negative_marks == 1.0, f"Expected neg 1.0, got {q1.negative_marks}"
        print("  ✓ Q1: Numerical question with unspecified marks correctly defaulted to +4 / -1")

        # Verify Q2 (Numerical custom 0)
        q2 = quiz.questions[1]
        print(f"  Q2 ({q2.question_type}): positive_marks={q2.positive_marks}, negative_marks={q2.negative_marks}")
        assert q2.positive_marks == 4.0, f"Expected pos 4.0, got {q2.positive_marks}"
        assert q2.negative_marks == 0.0, f"Expected neg 0.0, got {q2.negative_marks}"
        print("  ✓ Q2: Numerical question with admin-configured negative_marks=0 preserved")

        # Verify Q3 (Numerical custom 2)
        q3 = quiz.questions[2]
        print(f"  Q3 ({q3.question_type}): positive_marks={q3.positive_marks}, negative_marks={q3.negative_marks}")
        assert q3.positive_marks == 4.0, f"Expected pos 4.0, got {q3.positive_marks}"
        assert q3.negative_marks == 2.0, f"Expected neg 2.0, got {q3.negative_marks}"
        print("  ✓ Q3: Numerical question with admin-configured negative_marks=2 preserved")

        q4 = quiz.questions[3]
        print(f"  Q4 ({q4.question_type}): positive_marks={q4.positive_marks}, negative_marks={q4.negative_marks}")
        assert q4.negative_marks == 0.0, f"Expected neg 0.0 for single_correct default, got {q4.negative_marks}"
        print("  ✓ Q4: Single Correct MCQ preserved its own default negative_marks=0.0")

        # ── TEST 2: PDF Bulk Import defaults Numerical questions to +4 / -1 ──
        print("\n[TEST 2] Testing PDF Bulk Import defaults for Numerical questions...")
        pdf_path = "/Users/ayushkumar/Downloads/JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf"
        if not os.path.exists(pdf_path):
            pdf_path = "JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf"

        if os.path.exists(pdf_path):
            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()
            import_res = await analyze_pdf(pdf_bytes, "test.pdf")
            num_qs = [q for q in import_res.questions if q.question_type == "numerical"]
            print(f"  Found {len(num_qs)} numerical questions in PDF import")
            if num_qs:
                for nq in num_qs[:3]:
                    print(f"  PDF Q#{nq.question_number} (numerical): positive_marks={nq.positive_marks}, negative_marks={nq.negative_marks}")
                    assert nq.positive_marks == 4.0, f"Expected pos 4.0, got {nq.positive_marks}"
                    assert nq.negative_marks == 1.0, f"Expected neg 1.0, got {nq.negative_marks}"
                print("  ✓ PDF Bulk Import correctly assigned +4 positive and 1.0 negative marks to Numerical questions!")
        # Create a synthetic 1-page PDF containing a numerical question
        num_doc = pymupdf.open()
        num_p = num_doc.new_page(width=595, height=842)
        num_p.insert_text(pymupdf.Point(50, 100), "1. Calculate the velocity of sound in air at STP in m/s.", fontsize=11, fontname="helv")
        num_p.insert_text(pymupdf.Point(50, 130), "Numerical Answer: 332.00", fontsize=11, fontname="helv")
        mock_pdf_bytes = num_doc.tobytes()
        num_doc.close()

        mock_import_res = await analyze_pdf(mock_pdf_bytes, "mock_numerical.pdf")
        assert len(mock_import_res.questions) > 0, "Failed to extract question from synthetic PDF"
        mock_q = mock_import_res.questions[0]
        print(f"  Extracted mock question ({mock_q.question_type}): positive_marks={mock_q.positive_marks}, negative_marks={mock_q.negative_marks}")
        assert mock_q.question_type == "numerical", f"Expected numerical question type, got {mock_q.question_type}"
        assert mock_q.positive_marks == 4.0, f"Expected 4.0, got {mock_q.positive_marks}"
        assert mock_q.negative_marks == 1.0, f"Expected 1.0, got {mock_q.negative_marks}"
        print("  ✓ Synthetic PDF import correctly defaulted extracted Numerical question to +4 / -1!")

        # ── TEST 3: Result calculation with default negative marks = 1.0 ────
        print("\n[TEST 3] Testing student submission scoring with default negative marks = 1.0...")
        session = QuizSession(quiz_id=quiz.id, room_code="987654")
        db.add(session)
        await db.commit()
        await db.refresh(session)

        # Attempt A: Q1 correct (+4), Q2 incorrect (-0 because neg=0), Q3 incorrect (-2 because neg=2)
        att_a = Attempt(session_id=session.id, student_id=test_student.id, status=AttemptStatus.in_progress)
        db.add(att_a)
        await db.commit()
        await db.refresh(att_a)

        sub_a = AttemptSubmit(
            time_taken_sec=90,
            answers=[
                AnswerSubmit(question_id=q1.id, response_text="6.63"),      # Correct -> +4
                AnswerSubmit(question_id=q2.id, response_text="15.0"),      # Incorrect with neg=0 -> -0
                AnswerSubmit(question_id=q3.id, response_text="99.9"),      # Incorrect with neg=2 -> -2
                AnswerSubmit(question_id=q4.id, selected_option=None),      # Skipped -> 0
            ]
        )
        scored_att_a, ans_results_a = await submit_attempt(db, att_a.id, sub_a, quiz.questions)
        print(f"  Attempt A scored: {scored_att_a.score} / {scored_att_a.total_marks}")
        # Expected: +4 - 0 - 2 + 0 = 2.0
        assert scored_att_a.score == 2.0, f"Expected score 2.0, got {scored_att_a.score}"
        print("  ✓ Attempt A: Score correctly evaluated with custom neg=0 and neg=2")

        # Attempt B: Q1 incorrect (default neg=1.0) -> MUST deduct -1.0!
        student_b = User(name="Student B", email=f"student_b_{datetime.now().timestamp()}@quiz.com", hashed_password="pw", role="student")
        db.add(student_b)
        await db.commit()
        await db.refresh(student_b)

        att_b = Attempt(session_id=session.id, student_id=student_b.id, status=AttemptStatus.in_progress)
        db.add(att_b)
        await db.commit()
        await db.refresh(att_b)

        sub_b = AttemptSubmit(
            time_taken_sec=60,
            answers=[
                AnswerSubmit(question_id=q1.id, response_text="12.34"),     # Incorrect with default neg=1.0 -> MUST award -1.0
                AnswerSubmit(question_id=q2.id, response_text=None),        # Skipped -> 0.0
                AnswerSubmit(question_id=q3.id, response_text=None),        # Skipped -> 0.0
                AnswerSubmit(question_id=q4.id, selected_option=None),      # Skipped -> 0.0
            ]
        )
        scored_att_b, ans_results_b = await submit_attempt(db, att_b.id, sub_b, quiz.questions)
        q1_ans_b = next(a for a in ans_results_b if a["question_id"] == q1.id)
        print(f"  Attempt B Q1 (numerical wrong): marks_awarded={q1_ans_b['marks_awarded']}, total score={scored_att_b.score}")
        assert q1_ans_b["marks_awarded"] == -1.0, f"Expected -1.0, got {q1_ans_b['marks_awarded']}"
        assert scored_att_b.score == -1.0, f"Expected -1.0 total score, got {scored_att_b.score}"
        print("  ✓ Attempt B: Numerical question with default negative marks successfully deducted -1.0 mark!")

        # ── TEST 4: Response Sheet PDF displays -1 marks for incorrect Numerical ──
        print("\n[TEST 4] Testing response-sheet PDF rendering of -1 marks for incorrect Numerical...")
        # Refresh attempt B with answers
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select
        res_att = await db.execute(select(Attempt).options(selectinload(Attempt.answers)).where(Attempt.id == att_b.id))
        fresh_att_b = res_att.scalar_one()

        pdf_bytes = generate_response_sheet_pdf(fresh_att_b, quiz, student_b, total_participants=2)
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        pdf_text = ""
        for p in doc:
            pdf_text += p.get_text()
        doc.close()

        assert "Numerical Answer" in pdf_text
        assert "Your Answer:" in pdf_text
        assert "12.34" in pdf_text
        assert "Marks: -1" in pdf_text or "Marks Awarded: -1" in pdf_text
        print("  ✓ Response Sheet PDF correctly displays -1 marks for incorrect Numerical question!")

    print("\n=== ALL NUMERICAL DEFAULT NEGATIVE MARKING TESTS PASSED! ===")


if __name__ == "__main__":
    asyncio.run(run_numerical_marking_tests())
