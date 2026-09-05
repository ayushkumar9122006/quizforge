import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from models.all_models import Base, User, Quiz, Question, Option, QuizSession, Attempt, Answer, LeaderboardEntry
from crud.session import submit_attempt, get_student_attempts
from services.analytics_service import get_session_analytics, get_quiz_analytics
from schemas.session import AnswerSubmit

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

async def run_tests():
    print("=== Starting QuizForge Automated Test Suite ===")
    engine = create_async_engine(TEST_DB_URL, echo=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        # 1. Create Users
        admin = User(name="Admin User", email="admin@quizforge.com", hashed_password="pw", role="admin")
        student_a = User(name="Student Alice", email="alice@quizforge.com", hashed_password="pw", role="student")
        student_b = User(name="Student Bob", email="bob@quizforge.com", hashed_password="pw", role="student")
        db.add_all([admin, student_a, student_b])
        await db.commit()
        await db.refresh(admin)
        await db.refresh(student_a)
        await db.refresh(student_b)

        # 2. Create Quiz with Instructions & Solution PDF
        instructions_text = "Read all instructions carefully. Correct answers give full marks, incorrect answers deduct marks."
        pdf_data = "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr..."
        pdf_name = "physics_solutions.pdf"

        quiz = Quiz(
            title="JEE Advanced Physics Test",
            instructions=instructions_text,
            solution_pdf=pdf_data,
            solution_pdf_name=pdf_name,
            time_per_q_sec=180,
            total_marks=15.0,
            creator_id=admin.id,
            status="published"
        )
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)

        assert quiz.instructions == instructions_text
        assert quiz.solution_pdf == pdf_data
        assert quiz.solution_pdf_name == pdf_name
        print("✓ Quiz creation with instructions and solution PDF verified.")

        # 3. Add Questions with Custom Positive and Negative Marks
        # Q1: +4 / -1
        q1 = Question(quiz_id=quiz.id, order_index=0, text="Question 1 (+4 / -1)", correct_answer=0, positive_marks=4.0, negative_marks=1.0, marks=4.0)
        # Q2: +4 / -1
        q2 = Question(quiz_id=quiz.id, order_index=1, text="Question 2 (+4 / -1)", correct_answer=1, positive_marks=4.0, negative_marks=1.0, marks=4.0)
        # Q3: +2 / -0.5
        q3 = Question(quiz_id=quiz.id, order_index=2, text="Question 3 (+2 / -0.5)", correct_answer=2, positive_marks=2.0, negative_marks=0.5, marks=2.0)
        # Q4: +1 / 0 (no negative)
        q4 = Question(quiz_id=quiz.id, order_index=3, text="Question 4 (+1 / 0)", correct_answer=3, positive_marks=1.0, negative_marks=0.0, marks=1.0)
        # Q5: +4 / -1
        q5 = Question(quiz_id=quiz.id, order_index=4, text="Question 5 (+4 / -1)", correct_answer=0, positive_marks=4.0, negative_marks=1.0, marks=4.0)

        db.add_all([q1, q2, q3, q4, q5])
        await db.commit()
        for q in [q1, q2, q3, q4, q5]:
            await db.refresh(q)
            for oi in range(4):
                db.add(Option(question_id=q.id, order_index=oi, text=f"Option {oi}"))
        await db.commit()
        print("✓ Questions with per-question positive & negative marks created.")

        # 4. Create Quiz Session
        session = QuizSession(
            quiz_id=quiz.id,
            room_code="123456",
            status="active"
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        print("✓ Quiz session active.")

        from schemas.session import AttemptSubmit
        from models.all_models import AttemptStatus

        # Create Attempt for Alice
        att_alice_record = Attempt(
            session_id=session.id,
            student_id=student_a.id,
            status=AttemptStatus.in_progress,
            total_marks=15.0,
            score=0.0
        )
        db.add(att_alice_record)
        await db.commit()
        await db.refresh(att_alice_record)

        # 5. Submit Attempt for Student Alice
        # Q1: ans 0 -> Correct (+4.0)
        # Q2: ans 0 -> Wrong (-1.0)
        # Q3: ans 0 -> Wrong (-0.5)
        # Q4: ans 0 -> Wrong, no negative (0.0)
        # Q5: ans None -> Skipped (0.0)
        # Expected Total Score: 4.0 - 1.0 - 0.5 + 0.0 + 0.0 = 2.5
        answers_alice = [
            AnswerSubmit(question_id=q1.id, selected_option=0, time_taken_sec=45),
            AnswerSubmit(question_id=q2.id, selected_option=0, time_taken_sec=30),
            AnswerSubmit(question_id=q3.id, selected_option=0, time_taken_sec=25),
            AnswerSubmit(question_id=q4.id, selected_option=0, time_taken_sec=20),
            AnswerSubmit(question_id=q5.id, selected_option=None, time_taken_sec=0),
        ]

        attempt_alice, results_alice = await submit_attempt(
            db=db,
            attempt_id=att_alice_record.id,
            submission=AttemptSubmit(answers=answers_alice, total_time_spent=120),
            questions=[q1, q2, q3, q4, q5],
            auto=False
        )

        print(f"Alice's Score: {attempt_alice.score} / {attempt_alice.total_marks}")
        assert attempt_alice.score == 2.5, f"Expected 2.5, got {attempt_alice.score}"
        assert attempt_alice.total_marks == 15.0, f"Expected 15.0, got {attempt_alice.total_marks}"

        # Check individual marks awarded in answers
        res_by_qid = {r["question_id"]: r for r in results_alice}
        assert res_by_qid[q1.id]["marks_awarded"] == 4.0, f"Q1 expected +4.0, got {res_by_qid[q1.id]['marks_awarded']}"
        assert res_by_qid[q1.id]["is_correct"] is True
        assert res_by_qid[q2.id]["marks_awarded"] == -1.0, f"Q2 expected -1.0, got {res_by_qid[q2.id]['marks_awarded']}"
        assert res_by_qid[q2.id]["is_correct"] is False
        assert res_by_qid[q3.id]["marks_awarded"] == -0.5, f"Q3 expected -0.5, got {res_by_qid[q3.id]['marks_awarded']}"
        assert res_by_qid[q3.id]["is_correct"] is False
        assert res_by_qid[q4.id]["marks_awarded"] == 0.0, f"Q4 expected 0.0, got {res_by_qid[q4.id]['marks_awarded']}"
        assert res_by_qid[q4.id]["is_correct"] is False
        assert res_by_qid[q5.id]["marks_awarded"] == 0.0, f"Q5 expected 0.0, got {res_by_qid[q5.id]['marks_awarded']}"
        assert res_by_qid[q5.id]["is_correct"] is False
        print("✓ Authoritative scoring math (+4, -1, -0.5, 0, 0 = 2.5) perfectly verified!")

        # 6. Submit Attempt for Student Bob (all correct)
        att_bob_record = Attempt(
            session_id=session.id,
            student_id=student_b.id,
            status=AttemptStatus.in_progress,
            total_marks=15.0,
            score=0.0
        )
        db.add(att_bob_record)
        await db.commit()
        await db.refresh(att_bob_record)

        answers_bob = [
            AnswerSubmit(question_id=q1.id, selected_option=0, time_taken_sec=20),
            AnswerSubmit(question_id=q2.id, selected_option=1, time_taken_sec=20),
            AnswerSubmit(question_id=q3.id, selected_option=2, time_taken_sec=20),
            AnswerSubmit(question_id=q4.id, selected_option=3, time_taken_sec=20),
            AnswerSubmit(question_id=q5.id, selected_option=0, time_taken_sec=20),
        ]
        attempt_bob, _ = await submit_attempt(
            db=db,
            attempt_id=att_bob_record.id,
            submission=AttemptSubmit(answers=answers_bob, total_time_spent=100),
            questions=[q1, q2, q3, q4, q5],
            auto=False
        )
        assert attempt_bob.score == 15.0
        print("✓ Bob's perfect attempt scored 15.0/15.0.")

        # 7. Verify Student History Endpoint Logic (get_student_attempts)
        alice_history = await get_student_attempts(db, student_a.id)
        assert len(alice_history) == 1
        assert alice_history[0]["quiz_title"] == "JEE Advanced Physics Test"
        assert alice_history[0]["score"] == 2.5
        assert alice_history[0]["total_marks"] == 15.0
        assert alice_history[0]["solution_pdf"] == pdf_data
        assert alice_history[0]["solution_pdf_name"] == pdf_name
        assert len(alice_history[0]["questions"]) == 5
        print("✓ get_student_attempts returned fully resolved attempt with solution PDF and question details.")

        # 8. Verify Student Isolation in History
        bob_history = await get_student_attempts(db, student_b.id)
        assert len(bob_history) == 1
        assert bob_history[0]["score"] == 15.0
        assert bob_history[0]["id"] != alice_history[0]["id"]
        print("✓ Student history is strictly isolated per student.")

        # 9. Verify Student Isolation in Analytics
        admin_analytics = await get_session_analytics(db, session.id, student_id=None)
        assert admin_analytics["total_submitted"] == 2
        assert len(admin_analytics["students"]) == 2
        print("✓ Admin sees all 2 student attempts in session analytics.")

        alice_analytics = await get_session_analytics(db, session.id, student_id=student_a.id)
        assert alice_analytics["total_submitted"] == 1
        assert len(alice_analytics["students"]) == 1
        assert alice_analytics["students"][0]["student_id"] == student_a.id
        assert alice_analytics["students"][0]["score"] == 2.5
        print("✓ Student Alice only sees her own attempt in session analytics (strict isolation).")

        alice_quiz_analytics = await get_quiz_analytics(db, quiz.id, student_id=student_a.id)
        assert alice_quiz_analytics["total_attempts"] == 1
        assert len(alice_quiz_analytics["students"]) == 1
        assert alice_quiz_analytics["students"][0]["student_id"] == student_a.id
        print("✓ Student Alice only sees her own attempt in quiz analytics (strict isolation).")

    print("\n🎉 ALL 9 TEST CASES PASSED FLAWLESSLY!")

if __name__ == "__main__":
    asyncio.run(run_tests())
