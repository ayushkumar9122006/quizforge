"""
Test script for verifying QuiZee Response Sheet PDF generation with mixed question types.
Checks:
- Single correct MCQ
- Multi-correct MCQ (full marks, partial marks, negative mark)
- Numerical (correct, incorrect, skipped)
- Match the column with diagram image
- Section summary table
- Dynamic card heights & pagination
"""
import io
import sys
import base64
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent))

import pymupdf
from services.response_sheet_service import generate_response_sheet_pdf


class MockOption:
    def __init__(self, order_index, text):
        self.order_index = order_index
        self.text = text


class MockQuestion:
    def __init__(self, id, order_index, section, text, question_type, correct_answer=None, raw_answer=None, positive_marks=4.0, negative_marks=1.0, diagram=None, explanation=None, options=None):
        self.id = id
        self.order_index = order_index
        self.section = section
        self.text = text
        self.question_type = question_type
        self.correct_answer = correct_answer
        self.raw_answer = raw_answer
        self.positive_marks = positive_marks
        self.negative_marks = negative_marks
        self.marks = positive_marks
        self.diagram = diagram
        self.question_image = None
        self.explanation = explanation
        self.options = options or []


class MockAnswer:
    def __init__(self, question_id, selected_option=None, response_text=None, is_correct=False, marks_awarded=0.0, time_taken_sec=45):
        self.question_id = question_id
        self.selected_option = selected_option
        self.response_text = response_text
        self.is_correct = is_correct
        self.marks_awarded = marks_awarded
        self.time_taken_sec = time_taken_sec


class MockQuiz:
    def __init__(self, title, questions):
        self.title = title
        self.questions = questions


class MockAttempt:
    def __init__(self, score, total_marks, answers, rank=1, correct_count=4, incorrect_count=2, skipped_count=2, marked_count=1, time_taken_sec=420):
        self.score = score
        self.total_marks = total_marks
        self.accuracy = score / total_marks if total_marks > 0 else 0.0
        self.rank = rank
        self.correct_count = correct_count
        self.incorrect_count = incorrect_count
        self.skipped_count = skipped_count
        self.marked_count = marked_count
        self.time_taken_sec = time_taken_sec
        self.submitted_at = datetime.now(timezone.utc)
        self.answers = answers


class MockUser:
    def __init__(self, name="Aarav Sharma", email="aarav.sharma@example.com"):
        self.name = name
        self.email = email


def create_dummy_png_base64():
    doc = pymupdf.open()
    page = doc.new_page(width=300, height=150)
    page.draw_rect(pymupdf.Rect(10, 10, 290, 140), color=(0.3, 0.4, 0.8), fill=(0.95, 0.96, 1.0), width=1.5)
    page.insert_text(pymupdf.Point(30, 50), "Column I          Column II", fontsize=14, fontname="hebo", color=(0.1, 0.2, 0.5))
    page.insert_text(pymupdf.Point(30, 80), "A. Acidic         P. pH < 7", fontsize=12, fontname="helv", color=(0.2, 0.2, 0.3))
    page.insert_text(pymupdf.Point(30, 110), "B. Basic          Q. pH > 7", fontsize=12, fontname="helv", color=(0.2, 0.2, 0.3))
    pix = page.get_pixmap()
    doc.close()
    png_bytes = pix.tobytes("png")
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")


def test_mixed_8_questions_pdf():
    print("=== Testing Response Sheet PDF Generation with 8 Mixed Questions ===")

    dummy_diagram = create_dummy_png_base64()

    q1 = MockQuestion(
        id="q1", order_index=0, section="Physics - Section A",
        text="A particle moves along the x-axis such that its position is given by x(t) = 3t^2 - 12t + 4. At what time is the particle momentarily at rest?",
        question_type="single_correct", correct_answer=1, positive_marks=4.0, negative_marks=1.0,
        options=[MockOption(0, "t = 1 s"), MockOption(1, "t = 2 s"), MockOption(2, "t = 3 s"), MockOption(3, "t = 4 s")],
        explanation="v(t) = dx/dt = 6t - 12 = 0 => t = 2 s."
    )
    ans1 = MockAnswer("q1", selected_option=1, is_correct=True, marks_awarded=4.0, time_taken_sec=35)

    q2 = MockQuestion(
        id="q2", order_index=1, section="Physics - Section A",
        text="Which of the following statements are correct for an ideal inductor connected to an alternating voltage source V = V0 sin(wt)?",
        question_type="multi_correct", raw_answer='["A", "C"]', positive_marks=4.0, negative_marks=1.0,
        options=[
            MockOption(0, "The current lags voltage by pi/2"),
            MockOption(1, "The current leads voltage by pi/2"),
            MockOption(2, "Average power consumed over a complete cycle is zero"),
            MockOption(3, "Inductive reactance is inversely proportional to frequency")
        ],
        explanation="Current in a pure inductor lags the applied voltage by 90 degrees. Average power is <P> = Vrms * Irms * cos(pi/2) = 0."
    )
    # Candidate selected only A (subset of correct options, 0 wrong -> partial credit = floor(4 * 1 / 2) = +2)
    ans2 = MockAnswer("q2", response_text='["A"]', is_correct=False, marks_awarded=2.0, time_taken_sec=70)

    q3 = MockQuestion(
        id="q3", order_index=2, section="Physics - Section B",
        text="A ball of mass 0.5 kg is dropped from a height of 20 m. Taking g = 10 m/s^2, determine its velocity just before hitting the ground in m/s.",
        question_type="numerical", raw_answer="20", positive_marks=4.0, negative_marks=0.0,
        explanation="v = sqrt(2gh) = sqrt(2 * 10 * 20) = sqrt(400) = 20 m/s."
    )
    ans3 = MockAnswer("q3", response_text="20.00", is_correct=True, marks_awarded=4.0, time_taken_sec=50)

    q4 = MockQuestion(
        id="q4", order_index=3, section="Chemistry - Section A",
        text="Match the substances in Column I with their characteristic properties or pH classifications in Column II based on the provided experimental table.",
        question_type="match_the_column", correct_answer=1, positive_marks=4.0, negative_marks=1.0,
        diagram=dummy_diagram,
        options=[
            MockOption(0, "A-Q, B-P"),
            MockOption(1, "A-P, B-Q"),
            MockOption(2, "A-P, B-P"),
            MockOption(3, "A-Q, B-Q")
        ],
        explanation="Acids exhibit pH < 7 (P), whereas bases exhibit pH > 7 (Q). Hence A-P, B-Q."
    )
    ans4 = MockAnswer("q4", selected_option=1, is_correct=True, marks_awarded=4.0, time_taken_sec=65)

    q5 = MockQuestion(
        id="q5", order_index=4, section="Chemistry - Section A",
        text="Which of the following molecules possess a planar molecular geometry?",
        question_type="multi_correct", raw_answer='["A", "B", "C"]', positive_marks=4.0, negative_marks=1.0,
        options=[
            MockOption(0, "BF3"),
            MockOption(1, "XeF4"),
            MockOption(2, "C2H4"),
            MockOption(3, "CH4")
        ],
        explanation="BF3 is trigonal planar (sp2), XeF4 is square planar (sp3d2), C2H4 is planar (sp2). CH4 is tetrahedral (sp3)."
    )
    # Candidate selected A and D (D is wrong -> penalty -1)
    ans5 = MockAnswer("q5", response_text='["A", "D"]', is_correct=False, marks_awarded=-1.0, time_taken_sec=80)

    q6 = MockQuestion(
        id="q6", order_index=5, section="Chemistry - Section B",
        text="Calculate the percentage purity of a sample of CaCO3 if 2.00 g of it on heating yields 0.88 g of CO2 gas. (Molar masses: CaCO3=100, CO2=44).",
        question_type="numerical", raw_answer="100.00", positive_marks=4.0, negative_marks=1.0,
        explanation="Moles of CO2 = 0.88/44 = 0.02. Moles of pure CaCO3 = 0.02 => mass = 2.0 g. Purity = (2.0/2.0)*100 = 100%."
    )
    # Candidate entered 66.67 -> incorrect => -1.0 marks penalty
    ans6 = MockAnswer("q6", response_text="66.67", is_correct=False, marks_awarded=-1.0, time_taken_sec=90)

    q7 = MockQuestion(
        id="q7", order_index=6, section="Mathematics - Section A",
        text="Find the value of the integral int_0^(pi/2) sin^2(x) dx.",
        question_type="single_correct", correct_answer=2, positive_marks=4.0, negative_marks=1.0,
        options=[
            MockOption(0, "pi"),
            MockOption(1, "pi / 2"),
            MockOption(2, "pi / 4"),
            MockOption(3, "0")
        ],
        explanation="By symmetry, 2I = int_0^(pi/2) 1 dx = pi/2 => I = pi/4."
    )
    # Skipped
    ans7 = MockAnswer("q7", selected_option=None, is_correct=False, marks_awarded=0.0, time_taken_sec=15)

    q8 = MockQuestion(
        id="q8", order_index=7, section="Mathematics - Section B",
        text="Determine the radius of curvature at the origin for the curve y = 2x^2 + 3x.",
        question_type="numerical", raw_answer="2.5", positive_marks=4.0, negative_marks=0.0,
        explanation="R = (1 + (y')^2)^(3/2) / |y''|. At x=0, y'=3, y''=4 => R = (1 + 9)^(3/2) / 4 = 10*sqrt(10)/4."
    )
    # Skipped numerical
    ans8 = MockAnswer("q8", response_text=None, is_correct=False, marks_awarded=0.0, time_taken_sec=15)

    all_qs = [q1, q2, q3, q4, q5, q6, q7, q8]
    all_ans = [ans1, ans2, ans3, ans4, ans5, ans6, ans7, ans8]

    quiz = MockQuiz("JEE Advanced 2026 Grand Mock Assessment", all_qs)
    # Total marks = 32. Score = 4 + 2 + 4 + 4 - 1 - 1 + 0 + 0 = 12.0
    attempt = MockAttempt(score=12.0, total_marks=32.0, answers=all_ans, rank=3, correct_count=3, incorrect_count=3, skipped_count=2, marked_count=1, time_taken_sec=420)
    student = MockUser("Aarav Sharma", "aarav.sharma@example.com")

    pdf_bytes = generate_response_sheet_pdf(
        attempt=attempt,
        quiz=quiz,
        student_user=student,
        total_participants=45
    )

    assert isinstance(pdf_bytes, bytes), "PDF output must be bytes"
    assert pdf_bytes.startswith(b"%PDF-"), "Must be a valid PDF"
    assert len(pdf_bytes) > 5000, f"PDF size too small: {len(pdf_bytes)} bytes"

    # Inspect with PyMuPDF
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    print(f"✓ PDF generated successfully with {page_count} pages ({len(pdf_bytes):,} bytes).")

    # Verify text in pages
    full_text = ""
    for p in doc:
        full_text += p.get_text()

    assert "QUIZEE ASSESSMENT PLATFORM" in full_text
    assert "Aarav Sharma" in full_text
    assert "JEE Advanced 2026 Grand Mock Assessment" in full_text
    assert "SECTION-WISE SUMMARY & PERFORMANCE" in full_text
    assert "Physics - Section A" in full_text
    assert "Chemistry - Section A" in full_text
    assert "Mathematics - Section B" in full_text
    assert "Numerical Answer" in full_text
    assert "Multi-Correct MCQ" in full_text
    assert "Match the Column" in full_text
    assert "Your Answer:" in full_text
    assert "Correct Answer:" in full_text
    assert "Partial marks awarded" in full_text
    assert "Penalty applied" in full_text
    assert "QuiZee Assessment Platform" in full_text
    assert f"Page 1 of {page_count}" in full_text

    # Write to local file for visual confirmation
    out_path = Path(__file__).parent / "test_response_sheet_output.pdf"
    with open(out_path, "wb") as f:
        f.write(pdf_bytes)
    print(f"✓ Output written to {out_path} for inspection.")
    doc.close()
    print("=== ALL TESTS PASSED SUCCESSFULLY! ===")


if __name__ == "__main__":
    test_mixed_8_questions_pdf()
