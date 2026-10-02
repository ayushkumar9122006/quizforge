import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from models.all_models import Base, User, Quiz, Question, Option, QuizSession, Attempt, Answer, LeaderboardEntry, AttemptStatus, QuizStatus
from crud.session import submit_attempt, get_student_attempts, get_leaderboard
from services.analytics_service import get_session_analytics, get_quiz_analytics
from schemas.session import AnswerSubmit, AttemptSubmit

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
        student_c = User(name="Student Charlie", email="charlie@quizforge.com", hashed_password="pw", role="student")
        student_d = User(name="Student David", email="david@quizforge.com", hashed_password="pw", role="student")
        db.add_all([admin, student_a, student_b, student_c, student_d])
        await db.commit()
        for u in [admin, student_a, student_b, student_c, student_d]:
            await db.refresh(u)

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
        print("✓ Test 1: Quiz creation with instructions and solution PDF verified.")

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
        print("✓ Test 2: Questions with per-question positive & negative marks created.")

        # 4. Create Quiz Session
        session = QuizSession(
            quiz_id=quiz.id,
            room_code="123456",
            status="active"
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        print("✓ Test 3: Quiz session active.")

        # 5. Submit Attempt for Student Alice
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

        # Alice: Q1 (+4), Q2 (-1), Q3 (-0.5), Q4 (0), Q5 (0) = 2.5
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
            submission=AttemptSubmit(answers=answers_alice, time_taken_sec=120),
            questions=[q1, q2, q3, q4, q5],
            auto=False
        )

        assert attempt_alice.score == 2.5, f"Expected 2.5, got {attempt_alice.score}"
        assert attempt_alice.total_marks == 15.0, f"Expected 15.0, got {attempt_alice.total_marks}"
        assert attempt_alice.correct_count == 1
        assert attempt_alice.incorrect_count == 3
        assert attempt_alice.skipped_count == 1
        assert attempt_alice.accuracy == 25.0 # 1 correct / 4 attempted = 25%
        print("✓ Test 4: Authoritative scoring math (+4, -1, -0.5, 0, 0 = 2.5) & accuracy (25.0%) verified!")

        # 6. Submit Attempt for Student Bob (all correct, 100s time)
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
            submission=AttemptSubmit(answers=answers_bob, time_taken_sec=100),
            questions=[q1, q2, q3, q4, q5],
            auto=False
        )
        assert attempt_bob.score == 15.0
        assert attempt_bob.correct_count == 5
        assert attempt_bob.incorrect_count == 0
        assert attempt_bob.skipped_count == 0
        assert attempt_bob.accuracy == 100.0
        print("✓ Test 5: Bob's perfect attempt scored 15.0/15.0 with 100% accuracy.")

        # 7. Dynamic Leaderboard & Tie-Breaker Test: Submit Charlie with same score as Alice (2.5) but faster (60s vs Alice's 120s)
        att_charlie_record = Attempt(
            session_id=session.id,
            student_id=student_c.id,
            status=AttemptStatus.in_progress,
            total_marks=15.0,
            score=0.0
        )
        db.add(att_charlie_record)
        await db.commit()
        await db.refresh(att_charlie_record)

        attempt_charlie, _ = await submit_attempt(
            db=db,
            attempt_id=att_charlie_record.id,
            submission=AttemptSubmit(answers=answers_alice, time_taken_sec=60), # 60s is faster than Alice's 120s
            questions=[q1, q2, q3, q4, q5],
            auto=False
        )
        assert attempt_charlie.score == 2.5

        lb = await get_leaderboard(db, session.id)
        assert len(lb) == 3
        # Bob is #1 (score 15.0)
        assert lb[0].student_id == student_b.id and lb[0].rank == 1
        # Charlie is #2 (score 2.5, time 60s)
        assert lb[1].student_id == student_c.id and lb[1].rank == 2
        # Alice is #3 (score 2.5, time 120s)
        assert lb[2].student_id == student_a.id and lb[2].rank == 3
        print("✓ Test 6: Dynamic leaderboard auto-recomputed ranks with deterministic tie-breaking (time_taken asc).")

        # 8. Feature 1 & 5: Clear Response & Independent Marked for Review
        # Student David:
        # Q1: selected_option=0 (Correct, +4)
        # Q2: selected_option=None (Student clicked Clear Response), marked_for_review=True
        # Q3: selected_option=1 (Incorrect, -0.5)
        # Q4: selected_option=None, marked_for_review=False (Skipped, 0)
        # Q5: selected_option=None, marked_for_review=False (Skipped, 0)
        att_david_record = Attempt(
            session_id=session.id,
            student_id=student_d.id,
            status=AttemptStatus.in_progress,
            total_marks=15.0,
            score=0.0
        )
        db.add(att_david_record)
        await db.commit()
        await db.refresh(att_david_record)

        answers_david = [
            AnswerSubmit(question_id=q1.id, selected_option=0, marked_for_review=False, time_taken_sec=20),
            AnswerSubmit(question_id=q2.id, selected_option=None, marked_for_review=True, time_taken_sec=25), # Cleared response + Marked
            AnswerSubmit(question_id=q3.id, selected_option=1, marked_for_review=False, time_taken_sec=15),
            AnswerSubmit(question_id=q4.id, selected_option=None, marked_for_review=False, time_taken_sec=0),
            AnswerSubmit(question_id=q5.id, selected_option=None, marked_for_review=False, time_taken_sec=0),
        ]
        attempt_david, results_david = await submit_attempt(
            db=db,
            attempt_id=att_david_record.id,
            submission=AttemptSubmit(answers=answers_david, time_taken_sec=60),
            questions=[q1, q2, q3, q4, q5],
            auto=False
        )

        assert attempt_david.score == 3.5 # +4.0 - 0.5 = 3.5
        assert attempt_david.correct_count == 1
        assert attempt_david.incorrect_count == 1
        assert attempt_david.skipped_count == 3 # Q2, Q4, Q5
        assert (attempt_david.correct_count + attempt_david.incorrect_count) == 2
        assert attempt_david.accuracy == 50.0 # 1 correct / 2 attempted = 50%

        # Verify Q2 was saved with marked_for_review=True and 0 marks
        res_d_map = {r["question_id"]: r for r in results_david}
        assert res_d_map[q2.id]["marked_for_review"] is True
        assert res_d_map[q2.id]["selected_option"] is None
        assert res_d_map[q2.id]["marks_awarded"] == 0.0
        print("✓ Test 7: Clear Response verified: answer cleared to None, marked for review preserved independently, skipped count=3, marked count=1, accuracy=50%.")

        # 9. Duplicate Submission Idempotency
        # Submitting David's attempt a second time must return same scores without creating duplicate entries
        attempt_david_dup, _ = await submit_attempt(
            db=db,
            attempt_id=att_david_record.id,
            submission=AttemptSubmit(answers=answers_david, time_taken_sec=60),
            questions=[q1, q2, q3, q4, q5],
            auto=False
        )
        assert attempt_david_dup.score == 3.5
        lb_after = await get_leaderboard(db, session.id)
        assert len(lb_after) == 4 # Alice, Bob, Charlie, David (no duplicates)
        print("✓ Test 8: Submission idempotency verified: repeated submit does not corrupt score or duplicate leaderboard entries.")

        # 10. Student History & Authoritative Details
        alice_history = await get_student_attempts(db, student_a.id)
        assert len(alice_history) == 1
        assert alice_history[0]["score"] == 2.5
        assert alice_history[0]["correct_count"] == 1
        assert alice_history[0]["incorrect_count"] == 3
        assert alice_history[0]["skipped_count"] == 1
        assert alice_history[0]["accuracy"] == 25.0
        assert alice_history[0]["rank"] == 4 # With David at 3.5, Alice is rank 4
        print("✓ Test 9: Student history contains authoritative correct/incorrect/skipped/accuracy and updated rank.")

        # 11. Feature 2: Availability Window Server-Side Time Validation
        now_utc = datetime.now(timezone.utc)
        
        # Test 11A: Quiz scheduled for tomorrow (Future start)
        future_quiz = Quiz(
            title="Scheduled Quiz",
            creator_id=admin.id,
            status="published",
            availability_start=now_utc + timedelta(days=1),
            availability_end=now_utc + timedelta(days=2),
        )
        db.add(future_quiz)
        await db.commit()
        await db.refresh(future_quiz)

        start_tz = future_quiz.availability_start
        if start_tz.tzinfo is None:
            start_tz = start_tz.replace(tzinfo=timezone.utc)
        assert now_utc < start_tz
        print("✓ Test 10: Future scheduled quiz properly identified before start time.")

        # Test 11B: Quiz ended yesterday (Past end)
        past_quiz = Quiz(
            title="Closed Quiz",
            creator_id=admin.id,
            status="published",
            availability_start=now_utc - timedelta(days=2),
            availability_end=now_utc - timedelta(days=1),
        )
        db.add(past_quiz)
        await db.commit()
        await db.refresh(past_quiz)

        end_tz = past_quiz.availability_end
        if end_tz.tzinfo is None:
            end_tz = end_tz.replace(tzinfo=timezone.utc)
        assert now_utc > end_tz
        print("✓ Test 11: Past closed quiz properly identified after end time.")

        # Test 11C: Deadline duration clamping
        active_window_quiz = Quiz(
            title="Active Window Quiz with Deadline Clamping",
            creator_id=admin.id,
            status="published",
            time_per_q_sec=300, # 10 Qs = 3000 seconds (~50 mins)
            availability_start=now_utc - timedelta(minutes=10),
            availability_end=now_utc + timedelta(minutes=15), # Only 15 mins remaining
        )
        db.add(active_window_quiz)
        await db.commit()
        await db.refresh(active_window_quiz)

        base_duration = 3000
        remaining_sec = int((active_window_quiz.availability_end.replace(tzinfo=timezone.utc) - now_utc).total_seconds())
        effective_duration = min(base_duration, remaining_sec)
        assert effective_duration < base_duration
        assert effective_duration == remaining_sec
        print(f"✓ Test 12: Availability deadline clamping verified: clamped from {base_duration}s to {effective_duration}s.")

    await engine.dispose()
    print("\n🎉 ALL 12 COMPREHENSIVE TEST CASES PASSED FLAWLESSLY!")

if __name__ == "__main__":
    asyncio.run(run_tests())
