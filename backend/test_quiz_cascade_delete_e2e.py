import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database.config import AsyncSessionLocal
from sqlalchemy import select
from models.all_models import (
    User, UserRole, Quiz, Question, Option, QuizSession, Attempt, Answer,
    LeaderboardEntry, QuizStatus, AttemptStatus
)
from crud.quiz import create_quiz, publish_quiz, delete_quiz, get_quiz
from crud.session import (
    create_session, start_session, submit_attempt, get_student_attempts, get_or_create_attempt
)
from schemas.quiz import QuizCreate, QuestionCreate, OptionCreate
from schemas.session import AttemptSubmit, AnswerSubmit
from services.response_sheet_service import generate_response_sheet_pdf


async def run_e2e_cascade_tests():
    print("=== STARTING QUIZ CASCADE DELETION & STUDENT HISTORY E2E TESTS ===")

    async with AsyncSessionLocal() as session:
        # Find or ensure admin and student users
        admin = (await session.execute(select(User).where(User.role == UserRole.admin.value))).scalars().first()
        student = (await session.execute(select(User).where(User.role == UserRole.student.value))).scalars().first()
        assert admin is not None, "Admin user must exist"
        assert student is not None, "Student user must exist"
        print(f"✓ Users verified: Admin={admin.email}, Student={student.email}")

        # -------------------------------------------------------------
        # STEP 1: Create Quiz A and Quiz B
        # -------------------------------------------------------------
        quiz_a_data = QuizCreate(
            title="E2E Cascade Test Quiz A",
            description="Quiz A to be deleted",
            time_per_q_sec=120,
            total_duration_minutes=10.0,
            is_public=True,
            questions=[
                QuestionCreate(
                    order_index=0,
                    text="Quiz A Question 1",
                    question_type="single_correct",
                    positive_marks=4.0,
                    negative_marks=1.0,
                    options=[OptionCreate(order_index=0, text="Opt 1"), OptionCreate(order_index=1, text="Opt 2")],
                    correct_answer=0,
                ),
                QuestionCreate(
                    order_index=1,
                    text="Quiz A Question 2",
                    question_type="numerical",
                    positive_marks=4.0,
                    negative_marks=1.0,
                    raw_answer="42.5",
                    options=[],
                )
            ]
        )
        quiz_a = await create_quiz(session, quiz_a_data, admin.id)
        await publish_quiz(session, quiz_a.id)

        quiz_b_data = QuizCreate(
            title="E2E Cascade Test Quiz B",
            description="Quiz B to remain untouched",
            time_per_q_sec=120,
            total_duration_minutes=10.0,
            is_public=True,
            questions=[
                QuestionCreate(
                    order_index=0,
                    text="Quiz B Question 1",
                    question_type="single_correct",
                    positive_marks=4.0,
                    negative_marks=1.0,
                    options=[OptionCreate(order_index=0, text="B Opt 1"), OptionCreate(order_index=1, text="B Opt 2")],
                    correct_answer=1,
                ),
                QuestionCreate(
                    order_index=1,
                    text="Quiz B Question 2",
                    question_type="numerical",
                    positive_marks=4.0,
                    negative_marks=1.0,
                    raw_answer="100",
                    options=[],
                )
            ]
        )
        quiz_b = await create_quiz(session, quiz_b_data, admin.id)
        await publish_quiz(session, quiz_b.id)
        await session.commit()

        quiz_a_id = quiz_a.id
        quiz_b_id = quiz_b.id
        print(f"✓ Created Quiz A ({quiz_a_id}) and Quiz B ({quiz_b_id})")

        # -------------------------------------------------------------
        # STEP 2: Create Sessions and Student Submissions
        # -------------------------------------------------------------
        session_a = await create_session(session, quiz_a_id)
        await start_session(session, session_a.id)

        session_b = await create_session(session, quiz_b_id)
        await start_session(session, session_b.id)
        await session.commit()

        session_a_id = session_a.id
        session_b_id = session_b.id

        # Submit attempt for Quiz A
        att_obj_a = await get_or_create_attempt(session, session_a_id, student.id)
        sub_a = AttemptSubmit(
            session_id=session_a_id,
            time_taken_sec=45,
            answers=[
                AnswerSubmit(question_id=quiz_a.questions[0].id, selected_option=0, time_taken_sec=20),
                AnswerSubmit(question_id=quiz_a.questions[1].id, response_text="42.5", time_taken_sec=25),
            ]
        )
        att_a_res, _ = await submit_attempt(session, att_obj_a.id, sub_a, quiz_a.questions)
        attempt_a_id = att_a_res.id

        # Submit attempt for Quiz B
        att_obj_b = await get_or_create_attempt(session, session_b_id, student.id)
        sub_b = AttemptSubmit(
            session_id=session_b_id,
            time_taken_sec=50,
            answers=[
                AnswerSubmit(question_id=quiz_b.questions[0].id, selected_option=1, time_taken_sec=22),
                AnswerSubmit(question_id=quiz_b.questions[1].id, response_text="100", time_taken_sec=28),
            ]
        )
        att_b_res, _ = await submit_attempt(session, att_obj_b.id, sub_b, quiz_b.questions)
        attempt_b_id = att_b_res.id
        await session.commit()

        print(f"✓ Student submitted Attempt A ({attempt_a_id}) and Attempt B ({attempt_b_id})")

        # -------------------------------------------------------------
        # TEST 1: Check My Test History for Student
        # -------------------------------------------------------------
        history_before = await get_student_attempts(session, student.id)
        history_quiz_ids = [h.get("quiz_id") or h.get("quizId") for h in history_before]
        assert quiz_a_id in history_quiz_ids, "Quiz A attempt must appear in student history"
        assert quiz_b_id in history_quiz_ids, "Quiz B attempt must appear in student history"
        print("✓ TEST 1 PASSED: Both Quiz A and Quiz B appear in student's history")

        # -------------------------------------------------------------
        # TEST 2 & 3: View Result & Result Data Available
        # -------------------------------------------------------------
        att_a = (await session.execute(select(Attempt).where(Attempt.id == attempt_a_id))).scalar_one_or_none()
        assert att_a is not None, "Attempt A record must exist"
        assert att_a.score == 8.0, f"Expected 8.0 marks for Quiz A attempt, got {att_a.score}"
        print("✓ TEST 2 & 3 PASSED: Attempt A details and score (+8.0) verified")

        # -------------------------------------------------------------
        # TEST 4: Response Sheet PDF Generates for Quiz A
        # -------------------------------------------------------------
        pdf_bytes_a = generate_response_sheet_pdf(attempt=att_a, quiz=quiz_a, student_user=student, total_participants=1)
        assert pdf_bytes_a.startswith(b"%PDF"), "Response Sheet PDF must start with %PDF header"
        assert len(pdf_bytes_a) > 1000, "Response Sheet PDF must contain valid content"
        print(f"✓ TEST 4 PASSED: Response Sheet PDF generated for Quiz A ({len(pdf_bytes_a)} bytes)")

        # -------------------------------------------------------------
        # TEST 5: Admin Deletes Quiz A
        # -------------------------------------------------------------
        del_success = await delete_quiz(session, quiz_a_id)
        await session.commit()
        assert del_success is True, "delete_quiz must return True"
        print("✓ TEST 5 PASSED: Admin deleted Quiz A")

        # -------------------------------------------------------------
        # TEST 6: Direct PostgreSQL Verification for Quiz A Cascade
        # -------------------------------------------------------------
        q_a_check = (await session.execute(select(Quiz).where(Quiz.id == quiz_a_id))).scalar_one_or_none()
        assert q_a_check is None, "Quiz A record must be gone from DB"

        questions_a_check = (await session.execute(select(Question).where(Question.quiz_id == quiz_a_id))).scalars().all()
        assert len(questions_a_check) == 0, "Quiz A questions must be deleted from DB"

        sess_a_check = (await session.execute(select(QuizSession).where(QuizSession.quiz_id == quiz_a_id))).scalars().all()
        assert len(sess_a_check) == 0, "Quiz A sessions must be deleted from DB"

        att_a_check = (await session.execute(select(Attempt).where(Attempt.id == attempt_a_id))).scalar_one_or_none()
        assert att_a_check is None, "Student Attempt A must be deleted from DB"

        ans_a_check = (await session.execute(select(Answer).where(Answer.attempt_id == attempt_a_id))).scalars().all()
        assert len(ans_a_check) == 0, "Student Answers for Attempt A must be deleted from DB"

        lb_a_check = (await session.execute(select(LeaderboardEntry).where(LeaderboardEntry.session_id == session_a_id))).scalars().all()
        assert len(lb_a_check) == 0, "Leaderboard entries for Session A must be deleted from DB"
        print("✓ TEST 6 PASSED: Verified in PostgreSQL — Quiz A, questions, sessions, attempts, answers, leaderboard entries are completely gone!")

        # -------------------------------------------------------------
        # TEST 7: Student History no longer shows Quiz A
        # -------------------------------------------------------------
        history_after = await get_student_attempts(session, student.id)
        history_quiz_ids_after = [h.get("quiz_id") or h.get("quizId") for h in history_after]
        assert quiz_a_id not in history_quiz_ids_after, "Quiz A MUST NOT appear in student history after deletion"
        print("✓ TEST 7 PASSED: Student My Test History no longer shows Quiz A")

        # -------------------------------------------------------------
        # TEST 8: Quiz B and its Student History Remain 100% Intact
        # -------------------------------------------------------------
        assert quiz_b_id in history_quiz_ids_after, "Quiz B MUST remain in student history"

        q_b_check = (await session.execute(select(Quiz).where(Quiz.id == quiz_b_id))).scalar_one_or_none()
        assert q_b_check is not None, "Quiz B must still exist in DB"

        att_b_check = (await session.execute(select(Attempt).where(Attempt.id == attempt_b_id))).scalar_one_or_none()
        assert att_b_check is not None, "Student Attempt B must still exist in DB"
        assert att_b_check.score == 8.0, "Attempt B score must remain 8.0"

        ans_b_check = (await session.execute(select(Answer).where(Answer.attempt_id == attempt_b_id))).scalars().all()
        assert len(ans_b_check) == 2, "Quiz B answers must remain intact"

        # Response Sheet for Quiz B still works
        pdf_bytes_b = generate_response_sheet_pdf(attempt=att_b_check, quiz=q_b_check, student_user=student, total_participants=1)
        assert pdf_bytes_b.startswith(b"%PDF"), "Response Sheet PDF for Quiz B must generate cleanly"
        print("✓ TEST 8 PASSED: Quiz B and its student history, answers, scores, and response sheet remain completely unaffected!")

    # -------------------------------------------------------------
    # TEST 9: HTTP API Authorization & Deletion via Endpoint
    # -------------------------------------------------------------
    import httpx
    BASE_URL = "http://127.0.0.1:8000"
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # 1. Login as Student
        s_res = await client.post("/auth/login", json={"email": "student@quizforge.com", "password": "Student@123"})
        assert s_res.status_code == 200
        student_token = s_res.json()["access_token"]

        # 2. Student attempts DELETE on Quiz B -> Must get 403 Forbidden
        del_attempt = await client.delete(f"/quizzes/{quiz_b_id}", headers={"Authorization": f"Bearer {student_token}"})
        assert del_attempt.status_code == 403, f"Expected 403 Forbidden for student delete, got {del_attempt.status_code}"
        print("✓ TEST 9A PASSED: Student cannot call DELETE /quizzes/{id} (HTTP 403 Forbidden returned)")

        # 3. Login as Admin
        a_res = await client.post("/auth/login", json={"email": "admin@quizforge.com", "password": "Admin@123"})
        assert a_res.status_code == 200
        admin_token = a_res.json()["access_token"]

        # 4. Admin deletes Quiz B via API -> 204 No Content
        admin_del = await client.delete(f"/quizzes/{quiz_b_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert admin_del.status_code == 204, f"Expected 204 No Content, got {admin_del.status_code}"
        print("✓ TEST 9B PASSED: Admin deleted Quiz B via DELETE endpoint (HTTP 204 No Content)")

    # 5. Verify in DB that Quiz B and its attempts are cascaded
    async with AsyncSessionLocal() as session:
        q_b_after = (await session.execute(select(Quiz).where(Quiz.id == quiz_b_id))).scalar_one_or_none()
        assert q_b_after is None, "Quiz B must be deleted"
        att_b_after = (await session.execute(select(Attempt).where(Attempt.id == attempt_b_id))).scalar_one_or_none()
        assert att_b_after is None, "Attempt B must be deleted"
        print("✓ TEST 9C PASSED: Verified in PostgreSQL — Quiz B and Attempt B cascade deleted via API")

    print("\n🎉 ALL E2E & HTTP API TESTS PASSED FLAWLESSLY WITH REAL POSTGRESQL DATABASE!")


if __name__ == "__main__":
    asyncio.run(run_e2e_cascade_tests())
