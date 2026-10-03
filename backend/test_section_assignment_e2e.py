import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from models.all_models import Base, User, Quiz, Question, Option, QuizSession, Attempt, Answer, LeaderboardEntry, AttemptStatus, QuizStatus, ContentType
from schemas.quiz import QuizCreate, QuestionCreate, OptionCreate
from schemas.session import AnswerSubmit, AttemptSubmit
from crud.session import submit_attempt, get_student_attempts
from crud.quiz import create_quiz, get_quiz
from services.pdf_importer_service import analyze_pdf

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
PDF_PATH = "/Users/ayushkumar/Desktop/quizforge-deploy-ready/JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf"

async def run_regression_tests():
    print("=== Starting Comprehensive Section Assignment Regression Test Suite ===")

    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Create test users
        admin_user = User(
            id="admin-sec-id",
            email="admin_sec@example.com",
            name="Admin Tester",
            hashed_password="pw",
            role="admin",
            is_active=True
        )
        student_user = User(
            id="student-sec-id",
            email="student_sec@example.com",
            name="Student Tester",
            hashed_password="pw",
            role="student",
            is_active=True
        )
        db.add_all([admin_user, student_user])
        await db.commit()

        # ──────────────────────────────────────────────────────────────────────────
        # TEST A — Exact 35-question scenario
        # ──────────────────────────────────────────────────────────────────────────
        print("\n--- TEST A: Exact 35-question scenario ---")
        assert os.path.exists(PDF_PATH), f"PDF not found at {PDF_PATH}"
        with open(PDF_PATH, "rb") as f:
            pdf_bytes = f.read()

        # PDF import with admin-configured default_section "Section A"
        analysis_res = await analyze_pdf(
            file_bytes=pdf_bytes,
            filename="JEE_Main_GOC_Kinetics_Questions_with_Answers.pdf",
            default_pos_marks=4.0,
            default_neg_marks=1.0,
            default_section="Section A",
        )
        assert analysis_res.total_questions == 35, f"Expected 35, got {analysis_res.total_questions}"

        # Rule 1 & Rule 3: All newly extracted questions must initially belong to Section A
        # Topics may be stored as metadata, but must NEVER override the assigned section
        for q in analysis_res.questions:
            assert q.section == "Section A", f"Question {q.question_number} has unexpected section {q.section}"
            assert q.section not in ["Chemical Kinetics", "General Organic Chemistry", "Physics", "Mathematics"]

        # Admin assigns Questions 2, 6, 8, 19, 30, 33, 34 to Section B
        section_b_nums = {2, 6, 8, 19, 30, 33, 34}
        configured_sections = ["Section A", "Section B"]

        assigned_questions = []
        for q in analysis_res.questions:
            assigned_sec = "Section B" if q.question_number in section_b_nums else "Section A"
            assigned_questions.append({
                "question_number": q.question_number,
                "text": q.text,
                "section": assigned_sec,
                "question_type": q.question_type,
                "question_image": q.question_image,
                "diagram": q.diagram,
                "match_data": q.match_data,
                "options": q.options,
                "correct_answer": q.correct_answer,
                "positive_marks": q.positive_marks,
                "negative_marks": q.negative_marks,
            })

        # Verify initial distribution
        sec_a_initial = [q for q in assigned_questions if q["section"] == "Section A"]
        sec_b_initial = [q for q in assigned_questions if q["section"] == "Section B"]
        assert len(sec_a_initial) == 28, f"Expected 28 in Section A, got {len(sec_a_initial)}"
        assert len(sec_b_initial) == 7, f"Expected 7 in Section B, got {len(sec_b_initial)}"

        # Simulate sort by admin's configured section order (Section A -> Section B)
        sec_order_map = {"Section A": 0, "Section B": 1}
        sorted_for_save = sorted(
            assigned_questions,
            key=lambda x: (sec_order_map[x["section"]], x["question_number"])
        )

        # Build QuestionCreate items
        q_create_items = []
        for i, item in enumerate(sorted_for_save):
            q_create_items.append(QuestionCreate(
                order_index=i,
                section=item["section"],
                text=item["text"],
                question_image=item["question_image"],
                diagram=item["diagram"],
                match_data=item["match_data"],
                question_type=item["question_type"],
                correct_answer=item["correct_answer"],
                positive_marks=item["positive_marks"],
                negative_marks=item["negative_marks"],
                options=[
                    OptionCreate(order_index=j, text=opt.text, image=opt.image)
                    for j, opt in enumerate(item["options"])
                ]
            ))

        quiz_a_payload = QuizCreate(
            title="JEE Main Chemistry - 35 Questions",
            time_per_q_sec=300,
            instructions="Standard Instructions",
            questions=q_create_items
        )
        saved_quiz_a = await create_quiz(db, quiz_a_payload, admin_user.id)
        await db.commit()

        # Retrieve quiz from database and verify canonical structure
        retrieved_quiz_a = await get_quiz(db, saved_quiz_a.id)
        assert retrieved_quiz_a is not None
        assert len(retrieved_quiz_a.questions) == 35

        # Group by section as the student frontend does
        sections_in_quiz = {}
        for q in retrieved_quiz_a.questions:
            sections_in_quiz.setdefault(q.section, []).append(q)

        # Assert ONLY Section A and Section B exist
        assert set(sections_in_quiz.keys()) == {"Section A", "Section B"}, f"Unexpected sections: {set(sections_in_quiz.keys())}"
        assert len(sections_in_quiz["Section A"]) == 28, f"Expected 28, got {len(sections_in_quiz['Section A'])}"
        assert len(sections_in_quiz["Section B"]) == 7, f"Expected 7, got {len(sections_in_quiz['Section B'])}"
        print(f"✓ TEST A PASSED: Exactly 2 sections (Section A: 28, Section B: 7). No topic sections created.")

        # ──────────────────────────────────────────────────────────────────────────
        # TEST B — Reverse assignment
        # ──────────────────────────────────────────────────────────────────────────
        print("\n--- TEST B: Reverse assignment ---")
        # Reverse: assign {2, 6, 8, 19, 30, 33, 34} to Section A, and all 28 other to Section B
        reverse_q_items = []
        for q in analysis_res.questions:
            rev_sec = "Section A" if q.question_number in section_b_nums else "Section B"
            reverse_q_items.append({
                "question_number": q.question_number,
                "text": q.text,
                "section": rev_sec,
                "options": q.options,
                "correct_answer": q.correct_answer,
                "positive_marks": 4.0,
                "negative_marks": 1.0,
            })

        sorted_rev = sorted(
            reverse_q_items,
            key=lambda x: (sec_order_map[x["section"]], x["question_number"])
        )
        q_create_rev = [
            QuestionCreate(
                order_index=i,
                section=item["section"],
                text=item["text"],
                correct_answer=item["correct_answer"],
                positive_marks=item["positive_marks"],
                negative_marks=item["negative_marks"],
                options=[OptionCreate(order_index=j, text=opt.text) for j, opt in enumerate(item["options"])]
            )
            for i, item in enumerate(sorted_rev)
        ]

        quiz_b_payload = QuizCreate(
            title="Reverse Assignment Quiz",
            time_per_q_sec=300,
            questions=q_create_rev
        )
        saved_quiz_b = await create_quiz(db, quiz_b_payload, admin_user.id)
        await db.commit()

        retrieved_b = await get_quiz(db, saved_quiz_b.id)
        sections_b = {}
        for q in retrieved_b.questions:
            sections_b.setdefault(q.section, []).append(q)

        assert len(sections_b["Section A"]) == 7, f"Expected 7 in Section A, got {len(sections_b['Section A'])}"
        assert len(sections_b["Section B"]) == 28, f"Expected 28 in Section B, got {len(sections_b['Section B'])}"
        print(f"✓ TEST B PASSED: Reverse distribution verified (Section A: 7, Section B: 28).")

        # ──────────────────────────────────────────────────────────────────────────
        # TEST C — Manual creation
        # ──────────────────────────────────────────────────────────────────────────
        print("\n--- TEST C: Manual creation ---")
        manual_q_items = [
            QuestionCreate(order_index=0, section="Section A", text="Manual Q1 Sec A", positive_marks=4, negative_marks=1, options=[OptionCreate(order_index=0, text="Opt 1")]),
            QuestionCreate(order_index=1, section="Section A", text="Manual Q2 Sec A", positive_marks=4, negative_marks=1, options=[OptionCreate(order_index=0, text="Opt 1")]),
            QuestionCreate(order_index=2, section="Section A", text="Manual Q3 Sec A", positive_marks=4, negative_marks=1, options=[OptionCreate(order_index=0, text="Opt 1")]),
            QuestionCreate(order_index=3, section="Section B", text="Manual Q4 Sec B", positive_marks=4, negative_marks=1, options=[OptionCreate(order_index=0, text="Opt 1")]),
            QuestionCreate(order_index=4, section="Section B", text="Manual Q5 Sec B", positive_marks=4, negative_marks=1, options=[OptionCreate(order_index=0, text="Opt 1")]),
        ]
        manual_quiz = await create_quiz(db, QuizCreate(title="Manual Quiz", time_per_q_sec=300, questions=manual_q_items), admin_user.id)
        await db.commit()

        retrieved_manual = await get_quiz(db, manual_quiz.id)
        sections_manual = {}
        for q in retrieved_manual.questions:
            sections_manual.setdefault(q.section, []).append(q)

        assert len(sections_manual["Section A"]) == 3, f"Expected 3, got {len(sections_manual['Section A'])}"
        assert len(sections_manual["Section B"]) == 2, f"Expected 2, got {len(sections_manual['Section B'])}"
        print(f"✓ TEST C PASSED: Manual quiz creation retains exact section distribution (Section A: 3, Section B: 2).")

        # ──────────────────────────────────────────────────────────────────────────
        # TEST D — Mixed question types
        # ──────────────────────────────────────────────────────────────────────────
        print("\n--- TEST D: Mixed question types ---")
        mixed_items = [
            QuestionCreate(order_index=0, section="Section A", question_type="single_correct", text="MCQ in A", options=[OptionCreate(order_index=0, text="A")]),
            QuestionCreate(order_index=1, section="Section A", question_type="match_column", text="Match in A", diagram="data:image/png;base64,table", options=[OptionCreate(order_index=0, text="A")]),
            QuestionCreate(order_index=2, section="Section B", question_type="single_correct", text="Diagram MCQ in B", diagram="data:image/png;base64,graph", options=[OptionCreate(order_index=0, text="A")]),
            QuestionCreate(order_index=3, section="Section B", question_type="match_column", text="Match in B", diagram="data:image/png;base64,tableB", options=[OptionCreate(order_index=0, text="A")]),
        ]
        mixed_quiz = await create_quiz(db, QuizCreate(title="Mixed Question Types Quiz", time_per_q_sec=300, questions=mixed_items), admin_user.id)
        await db.commit()

        retrieved_mixed = await get_quiz(db, mixed_quiz.id)
        sections_mixed = {}
        for q in retrieved_mixed.questions:
            sections_mixed.setdefault(q.section, []).append(q)

        assert len(sections_mixed["Section A"]) == 2
        assert len(sections_mixed["Section B"]) == 2
        assert sections_mixed["Section A"][1].question_type == "match_column"
        assert sections_mixed["Section A"][1].diagram == "data:image/png;base64,table"
        assert sections_mixed["Section B"][0].diagram == "data:image/png;base64,graph"
        print(f"✓ TEST D PASSED: Question types (MCQ, match_column, diagram) preserved across sections.")

        # ──────────────────────────────────────────────────────────────────────────
        # TEST E — Refresh, student attempt and persistence
        # ──────────────────────────────────────────────────────────────────────────
        print("\n--- TEST E: Refresh, student attempt and persistence ---")
        # Create active quiz session
        session = QuizSession(
            id="session-sec-test",
            quiz_id=saved_quiz_a.id,
            room_code="SEC123",
            status="active"
        )
        db.add(session)
        await db.commit()

        att_record = Attempt(
            session_id=session.id,
            student_id=student_user.id,
            status=AttemptStatus.in_progress.value
        )
        db.add(att_record)
        await db.commit()

        # Student submits answers across Section A and Section B
        q_map = {q.order_index: q for q in retrieved_quiz_a.questions}
        answers_payload = []
        for i in range(35):
            q_obj = q_map[i]
            # Answer correctly for Q0 (Sec A) and Q28 (Sec B, which is PDF Q2)
            sel = q_obj.correct_answer if i in [0, 28] else None
            answers_payload.append(AnswerSubmit(
                question_id=q_obj.id,
                selected_option=sel,
                response_text=None,
                marked_for_review=(i in [5, 29]),
                time_taken_sec=10
            ))

        attempt_submit = AttemptSubmit(
            answers=answers_payload,
            total_time_spent=350,
            auto=False
        )
        attempt_res, _ = await submit_attempt(db, att_record.id, attempt_submit, retrieved_quiz_a.questions, False)
        assert attempt_res is not None
        assert attempt_res.score == 8.0  # Two correct answers (+4 each) = 8.0

        # Simulate page refresh by re-fetching student attempt history
        student_attempts = await get_student_attempts(db, student_user.id)
        assert len(student_attempts) == 1
        att = student_attempts[0]
        score_val = att.get("score") if isinstance(att, dict) else att.score
        assert score_val == 8.0
        tot_q = (att.get("total_questions") or len(att.get("questions", []))) if isinstance(att, dict) else att.total_questions
        assert tot_q == 35

        # Re-fetch quiz again (verifying persistence survives refresh)
        refreshed_quiz = await get_quiz(db, saved_quiz_a.id)
        refreshed_secs = {}
        for q in refreshed_quiz.questions:
            refreshed_secs.setdefault(q.section, []).append(q)

        assert len(refreshed_secs["Section A"]) == 28
        assert len(refreshed_secs["Section B"]) == 7
        print(f"✓ TEST E PASSED: Test submission scored 8.0 (+4 for Sec A, +4 for Sec B). State survives refresh.")

        # ──────────────────────────────────────────────────────────────────────────
        # TEST F — Existing quizzes compatibility
        # ──────────────────────────────────────────────────────────────────────────
        print("\n--- TEST F: Existing quizzes compatibility ---")
        # A quiz created with default "General" section remains 100% valid
        legacy_quiz = await create_quiz(db, QuizCreate(
            title="Legacy Quiz",
            questions=[QuestionCreate(order_index=0, text="Legacy Q", options=[OptionCreate(order_index=0, text="Opt")])]
        ), admin_user.id)
        await db.commit()

        retrieved_legacy = await get_quiz(db, legacy_quiz.id)
        assert retrieved_legacy.questions[0].section == "General"
        print(f"✓ TEST F PASSED: Legacy quiz with default section remains fully compatible.")

    await engine.dispose()
    print("\n🎉 ALL REGRESSION TESTS A THROUGH F PASSED FLAWLESSLY!")

if __name__ == "__main__":
    asyncio.run(run_regression_tests())
