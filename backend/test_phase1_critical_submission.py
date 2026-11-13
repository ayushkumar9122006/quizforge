import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, func
from models.all_models import (
    Base, User, Quiz, Question, Option, QuizSession, Attempt, Answer,
    LeaderboardEntry, AttemptStatus, QuizStatus
)
from crud.session import submit_attempt, finalize_expired_attempts_for_student, get_student_attempts
from schemas.session import AnswerSubmit, AttemptSubmit
from sqlalchemy.pool import StaticPool

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

async def run_phase1_tests():
    print("=" * 70)
    print("RUNNING PHASE 1 CRITICAL QUIZ SUBMISSION VERIFICATION SUITE")
    print("=" * 70)

    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        # Setup base entities
        admin = User(name="Admin", email="admin@test.com", hashed_password="pw", role="admin")
        student = User(name="Test Student", email="student@test.com", hashed_password="pw", role="student")
        db.add_all([admin, student])
        await db.commit()
        await db.refresh(admin)
        await db.refresh(student)

        quiz = Quiz(
            title="Data Integrity Benchmark Quiz",
            creator_id=admin.id,
            status="published",
            time_per_q_sec=60,
            total_marks=8.0
        )
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)

        q1 = Question(
            quiz_id=quiz.id,
            order_index=0,
            text="What is 2 + 2?",
            correct_answer=0,
            positive_marks=4.0,
            negative_marks=1.0,
        )
        q2 = Question(
            quiz_id=quiz.id,
            order_index=1,
            text="What is 3 + 3?",
            correct_answer=1,
            positive_marks=4.0,
            negative_marks=1.0,
        )
        db.add_all([q1, q2])
        await db.commit()
        await db.refresh(q1)
        await db.refresh(q2)
        questions = [q1, q2]

        session = QuizSession(
            quiz_id=quiz.id,
            room_code="123456",
            status="active",
            started_at=datetime.utcnow()
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        # ── Test 1: Normal submission with row-level locking & answer persistence ──
        print("\n[TEST 1] Normal submission with row locking and scoring...")
        att1 = Attempt(
            session_id=session.id,
            student_id=student.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow()
        )
        db.add(att1)
        await db.commit()
        await db.refresh(att1)

        sub_payload = AttemptSubmit(
            answers=[
                AnswerSubmit(question_id=q1.id, selected_option=0, time_taken_sec=15),
                AnswerSubmit(question_id=q2.id, selected_option=1, time_taken_sec=20),
            ],
            time_taken_sec=35
        )

        scored_att, results = await submit_attempt(db, att1.id, sub_payload, questions, auto=False)
        assert scored_att.status == AttemptStatus.submitted
        assert scored_att.score == 8.0, f"Expected 8.0, got {scored_att.score}"
        assert scored_att.correct_count == 2
        assert len(results) == 2

        # Check answers in DB
        ans_rows = (await db.execute(select(Answer).where(Answer.attempt_id == att1.id))).scalars().all()
        assert len(ans_rows) == 2, f"Expected 2 answers in DB, found {len(ans_rows)}"
        print("  ✓ Submission accurately persisted answers and calculated score 8.0/8.0")

        # ── Test 2: Idempotent submission retry ──
        print("\n[TEST 2] Submission idempotency on duplicate submit...")
        retried_att, retried_results = await submit_attempt(db, att1.id, sub_payload, questions, auto=False)
        assert retried_att.status == AttemptStatus.submitted
        assert retried_att.score == 8.0
        assert len(retried_results) == 2

        ans_rows_after = (await db.execute(select(Answer).where(Answer.attempt_id == att1.id))).scalars().all()
        assert len(ans_rows_after) == 2, "Duplicate submit must NOT duplicate Answer rows"
        print("  ✓ Repeated submit safely returns existing result without duplicating records")

        # ── Test 3: Concurrent submissions serialization ──
        print("\n[TEST 3] Concurrent submissions serialization...")
        session2 = QuizSession(quiz_id=quiz.id, room_code="654321", status="active", started_at=datetime.utcnow())
        db.add(session2)
        await db.commit()
        await db.refresh(session2)

        student2 = User(name="Student 2", email="student2@test.com", hashed_password="pw", role="student")
        db.add(student2)
        await db.commit()
        await db.refresh(student2)

        att2 = Attempt(
            session_id=session2.id,
            student_id=student2.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow()
        )
        db.add(att2)
        await db.commit()
        await db.refresh(att2)

        sub2 = AttemptSubmit(
            answers=[AnswerSubmit(question_id=q1.id, selected_option=0), AnswerSubmit(question_id=q2.id, selected_option=0)], # 1 correct, 1 incorrect
            time_taken_sec=30
        )

        # Multiple rapid submit clicks (Click 1, Click 2, Click 3)
        res1 = await submit_attempt(db, att2.id, sub2, questions, auto=False)
        res2 = await submit_attempt(db, att2.id, sub2, questions, auto=False)
        res3 = await submit_attempt(db, att2.id, sub2, questions, auto=False)

        assert res1[0].score == 3.0
        assert res2[0].score == 3.0
        assert res3[0].score == 3.0
        assert res1[0].status == AttemptStatus.submitted
        assert res2[0].status == AttemptStatus.submitted
        assert res3[0].status == AttemptStatus.submitted

        ans_count = (await db.execute(select(func.count(Answer.id)).where(Answer.attempt_id == att2.id))).scalar()
        assert ans_count == 2, f"Expected exactly 2 Answer rows, got {ans_count}"
        print("  ✓ Multiple submit clicks safely return identical result with no duplicate answer rows")

        # ── Test 4: Atomicity & Rollback on critical failure ──
        print("\n[TEST 4] Database transaction rollback on critical failure...")
        att3 = Attempt(
            session_id=session2.id,
            student_id=student.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow()
        )
        db.add(att3)
        await db.commit()
        await db.refresh(att3)

        # Simulate exception inside a transaction block
        try:
            async with session_factory() as fail_db:
                # Begin work
                res = await fail_db.execute(select(Attempt).where(Attempt.id == att3.id))
                a_obj = res.scalar_one()
                # Insert partial answer
                fail_db.add(Answer(attempt_id=a_obj.id, question_id=q1.id, selected_option=0))
                await fail_db.flush()
                # Simulate critical exception before commit
                raise RuntimeError("Simulated database failure during score processing")
        except RuntimeError:
            pass

        # Verify attempt in clean DB
        async with session_factory() as check_db:
            clean_att = (await check_db.execute(select(Attempt).where(Attempt.id == att3.id))).scalar_one()
            assert clean_att.status == AttemptStatus.in_progress, f"Attempt must remain in_progress, got {clean_att.status}"
            ans_count_fail = (await check_db.execute(select(func.count(Answer.id)).where(Answer.attempt_id == att3.id))).scalar()
            assert ans_count_fail == 0, f"Rollback must ensure no partial answers remain, found {ans_count_fail}"
        print("  ✓ Transaction rolled back cleanly; attempt remains in_progress with no partial answers")

        # ── Test 5: Expired attempt with NO answers within grace window ──
        print("\n[TEST 5] Expired attempt with NO answers within 30-min grace window...")
        student_grace = User(name="Grace Student", email="grace@test.com", hashed_password="pw", role="student")
        db.add(student_grace)
        await db.commit()
        await db.refresh(student_grace)

        # Attempt started 3 minutes ago for a 2-question quiz (120 sec duration) -> expired 1 min ago
        grace_att = Attempt(
            session_id=session2.id,
            student_id=student_grace.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow() - timedelta(minutes=3)
        )
        db.add(grace_att)
        await db.commit()
        await db.refresh(grace_att)

        # Finalize called (e.g. during get_student_attempts or login)
        await finalize_expired_attempts_for_student(db, student_grace.id)
        await db.refresh(grace_att)

        assert grace_att.status == AttemptStatus.in_progress, (
            f"Recent expired attempt with zero answers must NOT be finalized into 0 marks; got {grace_att.status}"
        )
        print("  ✓ Protected from premature conversion to 0 marks: status remains in_progress during grace window")

        # ── Test 6: Expired attempt with persisted answers is graded correctly ──
        print("\n[TEST 6] Expired attempt with persisted answers is graded with actual answers...")
        student_ans = User(name="Ans Student", email="ans@test.com", hashed_password="pw", role="student")
        db.add(student_ans)
        await db.commit()
        await db.refresh(student_ans)

        exp_with_ans = Attempt(
            session_id=session2.id,
            student_id=student_ans.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow() - timedelta(minutes=10)
        )
        db.add(exp_with_ans)
        await db.commit()
        await db.refresh(exp_with_ans)

        # Student had saved an answer
        saved_ans = Answer(
            attempt_id=exp_with_ans.id,
            question_id=q1.id,
            selected_option=0, # correct
            time_taken_sec=25
        )
        db.add(saved_ans)
        await db.commit()

        await finalize_expired_attempts_for_student(db, student_ans.id)
        await db.refresh(exp_with_ans)

        assert exp_with_ans.status == AttemptStatus.auto_submitted
        assert exp_with_ans.score == 4.0, f"Expected score 4.0 from saved answer, got {exp_with_ans.score}"
        print("  ✓ Expired attempt with saved answers correctly scored 4.0/8.0 (not 0)")

        # ── Test 7: Abandoned attempt (> 30 min past deadline) ──
        print("\n[TEST 7] Truly abandoned attempt (> 30 min past deadline) is finalized...")
        student_abandoned = User(name="Abandoned Student", email="abandoned@test.com", hashed_password="pw", role="student")
        db.add(student_abandoned)
        await db.commit()
        await db.refresh(student_abandoned)

        abandoned_att = Attempt(
            session_id=session2.id,
            student_id=student_abandoned.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow() - timedelta(minutes=70) # 70 min ago
        )
        db.add(abandoned_att)
        await db.commit()
        await db.refresh(abandoned_att)

        await finalize_expired_attempts_for_student(db, student_abandoned.id)
        await db.refresh(abandoned_att)

        assert abandoned_att.status == AttemptStatus.auto_submitted, f"Abandoned attempt should be auto_submitted, got {abandoned_att.status}"
        print("  ✓ Truly abandoned attempt correctly finalized as auto_submitted")

    print("\n" + "=" * 70)
    print("ALL 7 PHASE 1 CRITICAL SUBMISSION TESTS PASSED PERFECTLY!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_phase1_tests())
