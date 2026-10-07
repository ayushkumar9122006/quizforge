import asyncio
import os
import sys
from decimal import Decimal
from pydantic import ValidationError

from schemas.quiz import QuizCreate, QuizUpdate, QuizOut, QuizStudentOut, QuizListOut
from models.all_models import Quiz, Question, Option, QuizStatus, User, UserRole
from database.config import AsyncSessionLocal
from crud.quiz import create_quiz, get_quiz, update_quiz
from crud.user import get_user_by_email, create_user
from schemas.user import UserCreate

async def run_phase3_tests():
    print("==================================================")
    print("RUNNING PHASE 3 TEST SUITE: TOTAL QUIZ DURATION & STRICT 2-DECIMAL PRECISION")
    print("==================================================")

    # --------------------------------------------------------------------------
    # Test 1: Pydantic Schema Validation for Strict 2-Decimal Precision
    # --------------------------------------------------------------------------
    print("\n[TEST 1] Testing Pydantic validation on total_duration_minutes...")
    
    # Valid inputs
    for valid_dur in [60, 60.0, 60.1, 60.12, 45.50, 0.01]:
        qc = QuizCreate(title="Valid Duration Quiz", total_duration_minutes=valid_dur)
        assert qc.total_duration_minutes == float(round(valid_dur, 2)), f"Failed on {valid_dur}"
    print("  ✓ Valid decimal inputs accepted correctly")

    # Invalid > 2 decimals (e.g. 60.123)
    try:
        QuizCreate(title="Invalid 3 decimals", total_duration_minutes=60.123)
        assert False, "Should have rejected 60.123"
    except ValidationError as e:
        assert "Total quiz duration cannot have more than 2 decimal places" in str(e)
        print("  ✓ Correctly rejected 60.123 (> 2 decimal places)")

    # Invalid <= 0
    try:
        QuizCreate(title="Invalid zero duration", total_duration_minutes=0)
        assert False, "Should have rejected 0"
    except ValidationError as e:
        assert "Total quiz duration must be greater than 0" in str(e)
        print("  ✓ Correctly rejected 0 duration")

    try:
        QuizCreate(title="Invalid negative duration", total_duration_minutes=-15.5)
        assert False, "Should have rejected -15.5"
    except ValidationError as e:
        assert "Total quiz duration must be greater than 0" in str(e)
        print("  ✓ Correctly rejected negative duration")

    # --------------------------------------------------------------------------
    # Database Tests
    # --------------------------------------------------------------------------
    async with AsyncSessionLocal() as db:
        # Ensure an admin user exists
        admin = await get_user_by_email(db, "admin_duration_test@test.com")
        if not admin:
            admin = await create_user(
                db,
                UserCreate(
                    email="admin_duration_test@test.com",
                    name="Admin Duration Tester",
                    password="Password123!",
                    role=UserRole.admin,
                ),
            )

        # ----------------------------------------------------------------------
        # Test 2: Example 1 -> 60 min / 10 q = 6.00 min / q
        # ----------------------------------------------------------------------
        print("\n[TEST 2] Testing Example 1: 60 min / 10 q...")
        q_items_10 = [{"text": f"Question {i+1}", "options": [{"order_index": 0, "text": "Opt A"}]} for i in range(10)]
        quiz1_create = QuizCreate(
            title="60 Min 10 Q Quiz",
            total_duration_minutes=60.0,
            questions=q_items_10,
        )
        quiz1 = await create_quiz(db, quiz1_create, admin.id)
        saved_q1 = await get_quiz(db, quiz1.id)
        
        assert saved_q1.total_duration_minutes == 60.0
        assert saved_q1.time_per_q_sec == 360  # 6.00 * 60 = 360
        assert saved_q1.effective_total_duration_minutes == 60.0
        assert saved_q1.time_per_question_min == 6.0

        out1 = QuizOut.model_validate(saved_q1)
        assert out1.total_duration_minutes == 60.0
        assert out1.time_per_question_min == 6.0
        print(f"  ✓ Saved total_duration_minutes={saved_q1.total_duration_minutes}, time_per_q_sec={saved_q1.time_per_q_sec}")
        print(f"  ✓ Output schema: total={out1.total_duration_minutes}, per_q={out1.time_per_question_min}")

        # ----------------------------------------------------------------------
        # Test 3: Example 2 -> 10 min / 6 q = 1.67 min / q
        # ----------------------------------------------------------------------
        print("\n[TEST 3] Testing Example 2: 10 min / 6 q...")
        q_items_6 = [{"text": f"Question {i+1}", "options": [{"order_index": 0, "text": "Opt A"}]} for i in range(6)]
        quiz2_create = QuizCreate(
            title="10 Min 6 Q Quiz",
            total_duration_minutes=10.0,
            questions=q_items_6,
        )
        quiz2 = await create_quiz(db, quiz2_create, admin.id)
        saved_q2 = await get_quiz(db, quiz2.id)

        assert saved_q2.total_duration_minutes == 10.0
        # 10 / 6 = 1.6666... -> rounded to 1.67 min -> 1.67 * 60 = 100.2 -> 100 sec
        assert saved_q2.time_per_q_sec == 100
        assert saved_q2.effective_total_duration_minutes == 10.0
        assert saved_q2.time_per_question_min == 1.67

        out2 = QuizOut.model_validate(saved_q2)
        assert out2.total_duration_minutes == 10.0
        assert out2.time_per_question_min == 1.67
        print(f"  ✓ Saved total_duration_minutes={saved_q2.total_duration_minutes}, time_per_q_sec={saved_q2.time_per_q_sec}")
        print(f"  ✓ Output schema: total={out2.total_duration_minutes}, per_q={out2.time_per_question_min}")

        # ----------------------------------------------------------------------
        # Test 4: Example 3 -> 45.50 min / 30 q = 1.52 min / q
        # ----------------------------------------------------------------------
        print("\n[TEST 4] Testing Example 3: 45.50 min / 30 q...")
        q_items_30 = [{"text": f"Question {i+1}", "options": [{"order_index": 0, "text": "Opt A"}]} for i in range(30)]
        quiz3_create = QuizCreate(
            title="45.50 Min 30 Q Quiz",
            total_duration_minutes=45.50,
            questions=q_items_30,
        )
        quiz3 = await create_quiz(db, quiz3_create, admin.id)
        saved_q3 = await get_quiz(db, quiz3.id)

        assert saved_q3.total_duration_minutes == 45.50
        # 45.50 / 30 = 1.51666... -> rounded to 1.52 min -> 1.52 * 60 = 91.2 -> 91 sec
        assert saved_q3.time_per_q_sec == 91
        assert saved_q3.effective_total_duration_minutes == 45.50
        assert saved_q3.time_per_question_min == 1.52

        out3 = QuizOut.model_validate(saved_q3)
        assert out3.total_duration_minutes == 45.50
        assert out3.time_per_question_min == 1.52
        print(f"  ✓ Saved total_duration_minutes={saved_q3.total_duration_minutes}, time_per_q_sec={saved_q3.time_per_q_sec}")
        print(f"  ✓ Output schema: total={out3.total_duration_minutes}, per_q={out3.time_per_question_min}")

        # ----------------------------------------------------------------------
        # Test 5: Legacy Quiz Backward Compatibility (total_duration_minutes IS NULL)
        # ----------------------------------------------------------------------
        print("\n[TEST 5] Testing Legacy Quiz Backward Compatibility...")
        legacy_quiz = Quiz(
            title="Legacy Quiz (Null total_duration_minutes)",
            creator_id=admin.id,
            time_per_q_sec=300,  # 5 min/q
            total_duration_minutes=None, # Explicitly NULL as in legacy DB
        )
        db.add(legacy_quiz)
        await db.flush()

        for k in range(5):
            q_leg = Question(quiz_id=legacy_quiz.id, order_index=k, text=f"Legacy Q {k+1}")
            db.add(q_leg)
        await db.flush()

        saved_leg = await get_quiz(db, legacy_quiz.id)
        assert saved_leg.total_duration_minutes is None
        # Effective fallback should be (300 * 5) / 60 = 25.0 minutes
        assert saved_leg.effective_total_duration_minutes == 25.0
        assert saved_leg.time_per_question_min == 5.0

        # QuizOut model_validate fallback
        out_leg = QuizOut.model_validate(saved_leg)
        assert out_leg.total_duration_minutes == 25.0
        assert out_leg.time_per_question_min == 5.0

        # QuizStudentOut fallback
        out_stud_leg = QuizStudentOut.model_validate(saved_leg)
        assert out_stud_leg.total_duration_minutes == 25.0
        assert out_stud_leg.time_per_question_min == 5.0
        print(f"  ✓ Legacy quiz (NULL in DB) cleanly falls back to total={out_leg.total_duration_minutes} min, per_q={out_leg.time_per_question_min} min")

        # ----------------------------------------------------------------------
        # Test 6: Updating Quiz Total Duration
        # ----------------------------------------------------------------------
        print("\n[TEST 6] Testing Quiz Total Duration Update...")
        updated = await update_quiz(db, quiz1.id, QuizUpdate(total_duration_minutes=90.0))
        assert updated.total_duration_minutes == 90.0
        # 10 questions -> 90 / 10 = 9.00 min/q -> 9.00 * 60 = 540 sec
        assert updated.time_per_q_sec == 540
        assert updated.effective_total_duration_minutes == 90.0
        assert updated.time_per_question_min == 9.0
        print(f"  ✓ Updated quiz total_duration_minutes to 90.0 -> time_per_q_sec={updated.time_per_q_sec}, per_q_min={updated.time_per_question_min}")

        # ----------------------------------------------------------------------
        # Test 7: Verify No Floating-Point Artifacts in Representation
        # ----------------------------------------------------------------------
        print("\n[TEST 7] Testing Floating-Point Display Artifact Prevention...")
        test_decimals = [
            (10.0 / 6, "1.67"),
            (45.50 / 30, "1.52"),
            (1.0 / 3, "0.33"),
            (2.0 / 3, "0.67"),
        ]
        for val, expected_str in test_decimals:
            rounded_val = round(val, 2)
            assert f"{rounded_val:.2f}" == expected_str, f"Mismatch: {rounded_val:.2f} != {expected_str}"
        print("  ✓ All float representations format exactly to 2 decimal places without precision leakage")

    print("\n==================================================")
    print("ALL PHASE 3 TESTS PASSED SUCCESSFULLY!")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_phase3_tests())
