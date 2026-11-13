import math
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from services.pdf_importer_service import (
    detect_question_type,
    extract_options_and_answer,
    _clean_text
)

def evaluate_multi_correct(selected_options: list, correct_options: list, pos: float = 4.0, neg: float = 1.0) -> float:
    """Multi-correct scoring simulation matching backend/crud/session.py."""
    selected_set = set(selected_options)
    correct_set = set(correct_options)

    if len(selected_set) == 0:
        # RULE 3 — NO ANSWER: score = 0
        return 0.0

    incorrect_selected = selected_set - correct_set
    correct_selected = selected_set & correct_set

    # RULE 1 — ANY WRONG OPTION SELECTED: score = -neg
    if len(incorrect_selected) > 0:
        penalty = neg if neg > 0 else 1.0
        return -penalty

    # RULE 2 — ONLY CORRECT OPTIONS SELECTED: score = floor(pos * correct_selected / total_correct)
    tot_corr = len(correct_set) if len(correct_set) > 0 else 1
    int_score = math.floor(pos * len(correct_selected) / tot_corr)
    return float(int_score)


def test_multi_correct_scoring_3_options():
    corr = ["A", "B", "C"]
    pos = 4.0
    neg = 1.0

    # Rule 2: Only correct options selected
    assert evaluate_multi_correct(["A", "B", "C"], corr, pos, neg) == 4.0
    assert evaluate_multi_correct(["A", "B"], corr, pos, neg) == 2.0
    assert evaluate_multi_correct(["A", "C"], corr, pos, neg) == 2.0
    assert evaluate_multi_correct(["B", "C"], corr, pos, neg) == 2.0
    assert evaluate_multi_correct(["A"], corr, pos, neg) == 1.0
    assert evaluate_multi_correct(["B"], corr, pos, neg) == 1.0
    assert evaluate_multi_correct(["C"], corr, pos, neg) == 1.0

    # Rule 1: Any wrong option selected -> -1
    assert evaluate_multi_correct(["A", "B", "D"], corr, pos, neg) == -1.0
    assert evaluate_multi_correct(["A", "D"], corr, pos, neg) == -1.0
    assert evaluate_multi_correct(["D"], corr, pos, neg) == -1.0
    assert evaluate_multi_correct(["A", "B", "C", "D"], corr, pos, neg) == -1.0

    # Rule 3: No answer -> 0
    assert evaluate_multi_correct([], corr, pos, neg) == 0.0


def test_multi_correct_scoring_4_options():
    corr = ["A", "B", "C", "D"]
    pos = 4.0
    neg = 1.0

    assert evaluate_multi_correct(["A"], corr, pos, neg) == 1.0
    assert evaluate_multi_correct(["A", "B"], corr, pos, neg) == 2.0
    assert evaluate_multi_correct(["A", "B", "C"], corr, pos, neg) == 3.0
    assert evaluate_multi_correct(["A", "B", "C", "D"], corr, pos, neg) == 4.0

    assert evaluate_multi_correct(["A", "B", "E"], corr, pos, neg) == -1.0
    assert evaluate_multi_correct(["A", "B", "C", "E"], corr, pos, neg) == -1.0
    assert evaluate_multi_correct(["E"], corr, pos, neg) == -1.0


def validate_numerical_input(val_str: str) -> tuple[bool, str]:
    """Client-side validation rule simulation matching frontend/src/components/Quiz/QuizAttempt.jsx."""
    v = str(val_str).strip()
    if not v:
        return True, ""
    # Regex check: optional sign, digits, optional decimal with digits
    if not re.match(r"^[-+]?\d*(?:\.\d*)?$", v):
        return False, "Please enter a valid numerical value."
    if "." in v:
        dec_part = v.split(".")[1]
        if len(dec_part) > 2:
            return False, "Please enter a value with at most 2 decimal places."
    return True, ""


def evaluate_numerical_answer(val_str: str, correct_val: float, tolerance: float = 0.01) -> bool:
    """Backend evaluation logic matching backend/crud/session.py."""
    is_valid, _ = validate_numerical_input(val_str)
    if not is_valid:
        return False
    # Enforce at most 2 digits after decimal
    dec_match = re.search(r"\.(\d+)", val_str.strip())
    if dec_match and len(dec_match.group(1)) > 2:
        return False
    try:
        student_val = float(val_str.strip())
    except ValueError:
        return False
    return abs(student_val - correct_val) <= tolerance + 1e-7


def test_numerical_input_validation():
    # Valid inputs
    assert validate_numerical_input("60")[0] is True
    assert validate_numerical_input("60.5")[0] is True
    assert validate_numerical_input("60.55")[0] is True
    assert validate_numerical_input("60.0")[0] is True
    assert validate_numerical_input("60.00")[0] is True
    assert validate_numerical_input("0")[0] is True
    assert validate_numerical_input("10")[0] is True
    assert validate_numerical_input("10.5")[0] is True
    assert validate_numerical_input("10.50")[0] is True
    assert validate_numerical_input("0.25")[0] is True
    assert validate_numerical_input("99.99")[0] is True
    assert validate_numerical_input("66.67")[0] is True

    # Invalid inputs (> 2 decimal places)
    val1, err1 = validate_numerical_input("60.555")
    assert val1 is False
    assert err1 == "Please enter a value with at most 2 decimal places."

    val2, err2 = validate_numerical_input("66.671")
    assert val2 is False
    assert err2 == "Please enter a value with at most 2 decimal places."

    val3, err3 = validate_numerical_input("12.3456")
    assert val3 is False
    assert err3 == "Please enter a value with at most 2 decimal places."

    val4, err4 = validate_numerical_input("abc")
    assert val4 is False
    assert err4 == "Please enter a valid numerical value."


def test_numerical_evaluation():
    correct = 66.67
    assert evaluate_numerical_answer("66.67", correct) is True
    assert evaluate_numerical_answer("66.66", correct) is True
    assert evaluate_numerical_answer("66.68", correct) is True
    assert evaluate_numerical_answer("66.671", correct) is False  # rejected due to 3 decimals!
    assert evaluate_numerical_answer("66.678", correct) is False
    assert evaluate_numerical_answer("66.1234", correct) is False
    assert evaluate_numerical_answer("abc", correct) is False


def test_question_type_detection_priority():
    # Q4: Numerical Value Type followed by section heading
    q4_text = """[Numerical Value Type]
A first-order reaction has a half-life of 20 minutes.
Find the time required for 87.5% of the reactant to decompose.
Correct Answer: 60
SECTION C — MATCH THE COLUMN (Q5–Q6)
"""
    # Stripping trailing section heading as in pdf_importer_service
    trailing_sec_split = re.split(r"\n\s*(?:SECTION|PART)\s+[A-Z]\b[^\n]*", q4_text, flags=re.IGNORECASE)
    cleaned_q4 = trailing_sec_split[0].strip()

    stmt, opts, c_idx, raw_ans, exp = extract_options_and_answer(cleaned_q4)
    q_type = detect_question_type(stmt + " " + cleaned_q4, opts, raw_ans)

    assert q_type == "numerical", f"Expected numerical, got {q_type}"
    assert raw_ans == "60"

    # Even if trailing heading was present in text:
    q_type_direct = detect_question_type(q4_text, [], "60")
    assert q_type_direct == "numerical", f"Own marker must prioritize numerical, got {q_type_direct}"


def test_multi_correct_answer_parsing():
    raw_text = """Which of the following statements are correct?
(A) First statement
(B) Second statement
(C) Third statement
(D) Fourth statement
Correct Answer: A, B, C
Explanation: All three are valid.
"""
    stmt, opts, c_idx, raw_ans, exp = extract_options_and_answer(raw_text)
    assert raw_ans == "A, B, C"
    q_type = detect_question_type(stmt, opts, raw_ans)
    assert q_type == "multi_correct"

    # Extract correct options list
    raw_letters = [l.upper() for l in re.findall(r"\b([A-Fa-f1-6])\b", raw_ans)]
    correct_options_list = sorted(list(dict.fromkeys(
        [chr(ord('A') + int(l) - 1) if l in "123456" else l for l in raw_letters]
    )))
    assert correct_options_list == ["A", "B", "C"]



async def test_async_submission_e2e():
    import json
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from models.all_models import (
        Base, User, Quiz, Question, Option, QuizSession, Attempt, Answer,
        AttemptStatus
    )
    from crud.session import submit_attempt
    from schemas.session import AnswerSubmit, AttemptSubmit

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        user = User(name="Student 1", email="student1@test.com", hashed_password="pw", role="student")
        admin = User(name="Admin", email="admin1@test.com", hashed_password="pw", role="admin")
        db.add_all([user, admin])
        await db.commit()
        await db.refresh(user)
        await db.refresh(admin)

        quiz = Quiz(title="Comprehensive Test", creator_id=admin.id, status="published", total_marks=16.0)
        db.add(quiz)
        await db.commit()
        await db.refresh(quiz)

        # Q1: Single Correct MCQ (+4, -1)
        q1 = Question(
            quiz_id=quiz.id, order_index=0, text="Single Correct Q",
            question_type="single_correct", correct_answer=1, positive_marks=4.0, negative_marks=1.0
        )
        # Q2: Multi-Correct (+4, -1) [Correct: A, B, C]
        q2 = Question(
            quiz_id=quiz.id, order_index=1, text="Multi-Correct Q (A, B, C)",
            question_type="multi_correct", raw_answer="A, B, C", positive_marks=4.0, negative_marks=1.0
        )
        # Q3: Multi-Correct (+4, -1) [Correct: A, B, C, D]
        q3 = Question(
            quiz_id=quiz.id, order_index=2, text="Multi-Correct Q (A, B, C, D)",
            question_type="multi_correct", raw_answer="A, B, C, D", positive_marks=4.0, negative_marks=1.0
        )
        # Q4: Numerical (+4, 0) [Correct: 66.67]
        q4 = Question(
            quiz_id=quiz.id, order_index=3, text="Numerical Q",
            question_type="numerical", raw_answer="66.67", positive_marks=4.0, negative_marks=0.0
        )
        # Q5: Match the Column (+4, -1)
        q5 = Question(
            quiz_id=quiz.id, order_index=4, text="Match the Column Q",
            question_type="match_column", correct_answer=3, positive_marks=4.0, negative_marks=1.0
        )
        db.add_all([q1, q2, q3, q4, q5])
        await db.commit()
        for q in [q1, q2, q3, q4, q5]:
            await db.refresh(q)

        q_sess = QuizSession(quiz_id=quiz.id, room_code="123456")
        db.add(q_sess)
        await db.commit()
        await db.refresh(q_sess)

        # Test Case A: All completely correct
        att1 = Attempt(student_id=user.id, session_id=q_sess.id, status=AttemptStatus.in_progress)
        db.add(att1)
        await db.commit()
        await db.refresh(att1)

        sub1 = AttemptSubmit(
            time_taken_sec=120,
            answers=[
                AnswerSubmit(question_id=q1.id, selected_option=1),
                AnswerSubmit(question_id=q2.id, response_text=json.dumps(["A", "B", "C"])),
                AnswerSubmit(question_id=q3.id, response_text=json.dumps(["A", "B", "C", "D"])),
                AnswerSubmit(question_id=q4.id, response_text="66.67"),
                AnswerSubmit(question_id=q5.id, selected_option=3),
            ]
        )
        all_questions = [q1, q2, q3, q4, q5]
        att_res1, res1 = await submit_attempt(db, att1.id, sub1, all_questions)
        assert att_res1.score == 20.0, f"Expected 20.0, got {att_res1.score}"
        assert att_res1.correct_count == 5

        # Test Case B: Multi-Correct partials and numerical tolerance
        q_sess2 = QuizSession(quiz_id=quiz.id, room_code="223456")
        db.add(q_sess2)
        await db.commit()
        await db.refresh(q_sess2)
        att2 = Attempt(student_id=user.id, session_id=q_sess2.id, status=AttemptStatus.in_progress)
        db.add(att2)
        await db.commit()
        await db.refresh(att2)

        sub2 = AttemptSubmit(
            time_taken_sec=120,
            answers=[
                AnswerSubmit(question_id=q1.id, selected_option=0), # incorrect single (-1)
                AnswerSubmit(question_id=q2.id, response_text=json.dumps(["A", "B"])), # partial multi: floor(4*2/3) = +2
                AnswerSubmit(question_id=q3.id, response_text=json.dumps(["A"])), # partial multi: floor(4*1/4) = +1
                AnswerSubmit(question_id=q4.id, response_text="66.66"), # within tolerance 0.01 (+4)
                AnswerSubmit(question_id=q5.id, selected_option=None), # unanswered (0)
            ]
        )
        att_res2, res2 = await submit_attempt(db, att2.id, sub2, all_questions)
        # Expected: -1 + 2 + 1 + 4 + 0 = 6.0
        assert att_res2.score == 6.0, f"Expected 6.0, got {att_res2.score}"

        # Test Case C: Multi-Correct with wrong options selected (-1 absolute penalty) and numerical invalid format
        q_sess3 = QuizSession(quiz_id=quiz.id, room_code="323456")
        db.add(q_sess3)
        await db.commit()
        await db.refresh(q_sess3)
        att3 = Attempt(student_id=user.id, session_id=q_sess3.id, status=AttemptStatus.in_progress)
        db.add(att3)
        await db.commit()
        await db.refresh(att3)

        sub3 = AttemptSubmit(
            time_taken_sec=120,
            answers=[
                AnswerSubmit(question_id=q1.id, selected_option=None), # unanswered (0)
                AnswerSubmit(question_id=q2.id, response_text=json.dumps(["A", "B", "D"])), # wrong D selected (-1)
                AnswerSubmit(question_id=q3.id, response_text=json.dumps(["A", "B", "C", "E"])), # wrong E selected (-1)
                AnswerSubmit(question_id=q4.id, response_text="66.671"), # >2 decimal places rejected (-0)
                AnswerSubmit(question_id=q5.id, selected_option=1), # wrong single (-1)
            ]
        )
        att_res3, res3 = await submit_attempt(db, att3.id, sub3, all_questions)
        # Expected: 0 + (-1) + (-1) + 0 (neg for q4 is 0.0) + (-1) = -3.0
        assert att_res3.score == -3.0, f"Expected -3.0, got {att_res3.score}"


if __name__ == "__main__":
    import asyncio
    test_multi_correct_scoring_3_options()
    test_multi_correct_scoring_4_options()
    test_numerical_input_validation()
    test_numerical_evaluation()
    test_question_type_detection_priority()
    test_multi_correct_answer_parsing()
    asyncio.run(test_async_submission_e2e())
    print("ALL TESTS (INCLUDING ASYNC E2E SUBMISSION) PASSED SUCCESSFULLY!")

