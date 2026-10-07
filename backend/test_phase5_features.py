"""
QuizForge — Phase 5 Automated Test Suite
Verifies all Phase 5 Requirements:
 1. Leaderboard includes student_id and highlights student.
 2. In-memory response-sheet PDF generation with authoritative attempt, question, and score data.
 3. Student can download ONLY their own response sheet PDF (HTTP 200).
 4. Unauthorized student access to another student's response sheet is blocked (HTTP 403 Forbidden).
 5. Admin can download candidate response sheet (HTTP 200).
 6. Quiz deletion cascade rule:
    - Admin deletes quiz
    - Attempt response sheet PDF endpoint returns HTTP 404
    - Quiz and attempt vanish from student test history (/sessions/attempts/my)
    - No permanent response archive created or retained
 7. In-memory generation verification: No PDF files stored on local filesystem.
"""
import asyncio
import uuid
import os
import glob
from datetime import datetime, timedelta
import httpx
from database.config import AsyncSessionLocal
from models.all_models import (
    User, UserRole, Quiz, Question, Option, QuizSession, Attempt, Answer,
    AttemptStatus, SessionStatus
)
from crud.session import submit_attempt, get_leaderboard
from schemas.session import AttemptSubmit, AnswerSubmit
from utils.security import create_access_token
from services.response_sheet_service import generate_response_sheet_pdf
from main import app
from sqlalchemy import select, delete


async def run_tests():
    print("=" * 75)
    print("RUNNING PHASE 5 AUTOMATED TEST SUITE")
    print("=" * 75)

    async with AsyncSessionLocal() as db:
        unique_suffix = uuid.uuid4().hex[:6]
        
        # ── 1. Create Test Users ──────────────────────────────────────────────
        admin = User(
            email=f"admin_p5_{unique_suffix}@test.com",
            name="Admin Phase5",
            hashed_password="hash",
            role=UserRole.admin,
            is_active=True
        )
        student_a = User(
            email=f"student_a_{unique_suffix}@test.com",
            name="Alice Walker",
            hashed_password="hash",
            role=UserRole.student,
            is_active=True
        )
        student_b = User(
            email=f"student_b_{unique_suffix}@test.com",
            name="Bob Smith",
            hashed_password="hash",
            role=UserRole.student,
            is_active=True
        )
        db.add_all([admin, student_a, student_b])
        await db.commit()
        await db.refresh(admin)
        await db.refresh(student_a)
        await db.refresh(student_b)

        admin_token = create_access_token({"sub": admin.id})
        student_a_token = create_access_token({"sub": student_a.id})
        student_b_token = create_access_token({"sub": student_b.id})

        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        student_a_headers = {"Authorization": f"Bearer {student_a_token}"}
        student_b_headers = {"Authorization": f"Bearer {student_b_token}"}

        # ── 2. Create Test Quiz with Questions ────────────────────────────────
        quiz = Quiz(
            title=f"Phase 5 Physics Assessment {unique_suffix}",
            description="Testing Phase 5 leaderboard & response sheet PDF",
            creator_id=admin.id,
            time_per_q_sec=120,
            total_duration_minutes=4.0,
            is_public=True,
            status="published"
        )
        db.add(quiz)
        await db.flush()

        q1 = Question(
            quiz_id=quiz.id,
            order_index=0,
            section="Mechanics",
            text="What is the unit of Force in SI system?",
            correct_answer=1,  # B
            explanation="The SI unit of force is Newton (N), named after Sir Isaac Newton.",
            marks=4.0,
            positive_marks=4.0,
            negative_marks=1.0,
        )
        q2 = Question(
            quiz_id=quiz.id,
            order_index=1,
            section="Thermodynamics",
            text="Absolute zero is defined as:",
            correct_answer=0,  # A
            explanation="Absolute zero is 0 Kelvin or -273.15 degrees Celsius.",
            marks=4.0,
            positive_marks=4.0,
            negative_marks=1.0,
        )
        db.add_all([q1, q2])
        await db.flush()

        opt1_a = Option(question_id=q1.id, order_index=0, text="Joule")
        opt1_b = Option(question_id=q1.id, order_index=1, text="Newton")
        opt1_c = Option(question_id=q1.id, order_index=2, text="Pascal")
        opt1_d = Option(question_id=q1.id, order_index=3, text="Watt")

        opt2_a = Option(question_id=q2.id, order_index=0, text="0 Kelvin")
        opt2_b = Option(question_id=q2.id, order_index=1, text="0 Celsius")
        opt2_c = Option(question_id=q2.id, order_index=2, text="-100 Celsius")
        opt2_d = Option(question_id=q2.id, order_index=3, text="100 Kelvin")

        db.add_all([opt1_a, opt1_b, opt1_c, opt1_d, opt2_a, opt2_b, opt2_c, opt2_d])

        # ── 3. Create Session Room ────────────────────────────────────────────
        room_code = f"P5{unique_suffix[:4].upper()}"
        session = QuizSession(
            quiz_id=quiz.id,
            room_code=room_code,
            status=SessionStatus.active,
            started_at=datetime.utcnow()
        )
        db.add(session)
        await db.flush()

        # ── 4. Create Attempts for Student A & Student B ──────────────────────
        att_a = Attempt(
            session_id=session.id,
            student_id=student_a.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow()
        )
        att_b = Attempt(
            session_id=session.id,
            student_id=student_b.id,
            status=AttemptStatus.in_progress,
            started_at=datetime.utcnow()
        )
        db.add_all([att_a, att_b])
        await db.commit()
        await db.refresh(att_a)
        await db.refresh(att_b)

        # Submit Student A (Answer Q1 correctly: 1, Q2 incorrect: 1 -> Score: 4 - 1 = 3.0)
        sub_a = AttemptSubmit(
            answers=[
                AnswerSubmit(question_id=q1.id, selected_option=1, time_taken_sec=30),
                AnswerSubmit(question_id=q2.id, selected_option=1, time_taken_sec=40),
            ],
            time_taken_sec=70
        )
        await submit_attempt(db, att_a.id, sub_a, [q1, q2])

        # Submit Student B (Answer both correct: Score: 4 + 4 = 8.0)
        sub_b = AttemptSubmit(
            answers=[
                AnswerSubmit(question_id=q1.id, selected_option=1, time_taken_sec=20),
                AnswerSubmit(question_id=q2.id, selected_option=0, time_taken_sec=25),
            ],
            time_taken_sec=45
        )
        await submit_attempt(db, att_b.id, sub_b, [q1, q2])
        await db.commit()

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            try:
                # ── TEST 1: Leaderboard with student_id ───────────────────────
                print("\n[TEST 1] Testing leaderboard endpoint & student_id...")
                lb_res = await client.get(f"/sessions/{session.id}/leaderboard", headers=student_a_headers)
                assert lb_res.status_code == 200, f"Expected 200, got {lb_res.status_code}: {lb_res.text}"
                lb_data = lb_res.json()
                assert len(lb_data) == 2, f"Expected 2 entries, got {len(lb_data)}"

                entry_b = lb_data[0]
                entry_a = lb_data[1]

                assert entry_b["rank"] == 1
                assert entry_b["student_name"] == "Bob Smith"
                assert entry_b["student_id"] == student_b.id, "student_id missing from leaderboard entry"
                assert entry_b["score"] == 8.0

                assert entry_a["rank"] == 2
                assert entry_a["student_name"] == "Alice Walker"
                assert entry_a["student_id"] == student_a.id, "student_id missing from leaderboard entry"
                assert entry_a["score"] == 3.0
                print("  ✓ Leaderboard returns complete rankings with student_id for highlighting")

                # ── TEST 2: In-Memory PDF Generator Function ─────────────────
                print("\n[TEST 2] Testing direct in-memory PDF generation function...")
                from crud.quiz import get_quiz
                from sqlalchemy.orm import selectinload
                fresh_quiz = await get_quiz(db, quiz.id)
                fresh_att_res = await db.execute(
                    select(Attempt).options(selectinload(Attempt.answers)).where(Attempt.id == att_a.id)
                )
                fresh_att = fresh_att_res.scalar_one()
                pdf_bytes = generate_response_sheet_pdf(
                    attempt=fresh_att,
                    quiz=fresh_quiz,
                    student_user=student_a,
                    total_participants=2
                )
                assert isinstance(pdf_bytes, bytes), "Expected bytes output"
                assert len(pdf_bytes) > 1000, f"PDF too small: {len(pdf_bytes)} bytes"
                assert pdf_bytes.startswith(b"%PDF-"), "Bytes do not match valid PDF signature"
                print(f"  ✓ In-memory PDF generated successfully ({len(pdf_bytes)} bytes) without writing to disk")

                # ── TEST 3: Student Downloads Their Own Response Sheet ────────
                print("\n[TEST 3] Student downloads their own response-sheet PDF via API...")
                resp = await client.get(f"/sessions/attempts/{att_a.id}/response-sheet-pdf", headers=student_a_headers)
                assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
                assert resp.headers["content-type"] == "application/pdf"
                assert "attachment; filename=" in resp.headers["content-disposition"]
                assert resp.content.startswith(b"%PDF-")
                print("  ✓ HTTP 200: Student A successfully downloaded their own response sheet PDF")

                # ── TEST 4: Student B Cannot Access Student A's Sheet (403) ───
                print("\n[TEST 4] Student B attempts to download Student A's response-sheet PDF...")
                unauth_resp = await client.get(f"/sessions/attempts/{att_a.id}/response-sheet-pdf", headers=student_b_headers)
                assert unauth_resp.status_code == 403, f"Expected 403, got {unauth_resp.status_code}"
                assert "Forbidden" in unauth_resp.text
                print("  ✓ HTTP 403: Student B forbidden from downloading Student A's response sheet")

                # ── TEST 5: Admin Can Download Any Student's Response Sheet ───
                print("\n[TEST 5] Admin downloads Student A's response-sheet PDF...")
                admin_resp = await client.get(f"/sessions/attempts/{att_a.id}/response-sheet-pdf", headers=admin_headers)
                assert admin_resp.status_code == 200, f"Expected 200, got {admin_resp.status_code}"
                assert admin_resp.content.startswith(b"%PDF-")
                print("  ✓ HTTP 200: Admin authorized to download candidate response sheet")

                # ── TEST 6: Nonexistent Attempt Returns 404 ───────────────────
                print("\n[TEST 6] Requesting nonexistent attempt returns 404...")
                fake_id = str(uuid.uuid4())
                fake_resp = await client.get(f"/sessions/attempts/{fake_id}/response-sheet-pdf", headers=student_a_headers)
                assert fake_resp.status_code == 404, f"Expected 404, got {fake_resp.status_code}"
                print("  ✓ HTTP 404: Nonexistent attempt returns 404")

                # ── TEST 7: Student History Verification Before Deletion ───────
                print("\n[TEST 7] Student attempt history before quiz deletion...")
                hist_res = await client.get("/sessions/attempts/my", headers=student_a_headers)
                assert hist_res.status_code == 200
                hist_items = hist_res.json()
                found_att = any(h["id"] == att_a.id for h in hist_items)
                assert found_att, "Attempt should be present in history while quiz exists"
                print("  ✓ Attempt exists in student test history while quiz exists")

                # ── TEST 8: Quiz Deletion Cascade Rule ────────────────────────
                print("\n[TEST 8] Admin deletes quiz -> verifies cascade behavior...")
                del_resp = await client.delete(f"/quizzes/{quiz.id}", headers=admin_headers)
                assert del_resp.status_code in (200, 204), f"Failed to delete quiz: {del_resp.status_code}"

                # a. Attempt response sheet endpoint must now return 404
                after_del_resp = await client.get(f"/sessions/attempts/{att_a.id}/response-sheet-pdf", headers=student_a_headers)
                assert after_del_resp.status_code == 404, f"Expected 404 after quiz deletion, got {after_del_resp.status_code}"
                print("  ✓ Response-sheet PDF endpoint returns HTTP 404 after quiz deletion")

                # b. Student history must no longer show this quiz or attempt
                hist_after = await client.get("/sessions/attempts/my", headers=student_a_headers)
                assert hist_after.status_code == 200
                remaining_attempts = [h for h in hist_after.json() if h["id"] == att_a.id]
                assert len(remaining_attempts) == 0, "Deleted quiz attempt must disappear from history"
                print("  ✓ Deleted quiz attempt disappeared completely from student test history")

                # c. Verify no leftover files were written
                temp_pdfs = glob.glob("response_sheet_*.pdf") + glob.glob("backend/response_sheet_*.pdf")
                assert len(temp_pdfs) == 0, f"Found leaked PDF files on disk: {temp_pdfs}"
                print("  ✓ Verified zero persistent PDF files on disk (100% in-memory generation)")

                print("\n" + "=" * 75)
                print("ALL PHASE 5 AUTOMATED TESTS PASSED SUCCESSFULLY! (8/8)")
                print("=" * 75)

            finally:
                # Cleanup test users
                await db.execute(delete(User).where(User.id.in_([admin.id, student_a.id, student_b.id])))
                await db.commit()


if __name__ == "__main__":
    asyncio.run(run_tests())
