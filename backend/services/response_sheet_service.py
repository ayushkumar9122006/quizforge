"""
QuiZee — Response Sheet PDF Generator Service
Generates official, beautifully-formatted response sheet PDFs in-memory
using PyMuPDF without any permanent file storage.
"""
import io
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import pymupdf


def _format_ist(dt: Optional[datetime]) -> str:
    if not dt:
        return "N/A"
    try:
        # If naive, assume UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        ist_dt = dt.astimezone(ist_tz)
        return ist_dt.strftime("%d %b %Y, %I:%M %p IST")
    except Exception:
        return str(dt)


def _format_duration(seconds: int) -> str:
    if not seconds or seconds < 0:
        return "0s"
    m = seconds // 60
    s = seconds % 60
    if m > 0:
        return f"{m}m {s}s"
    return f"{s}s"


def generate_response_sheet_pdf(
    attempt,
    quiz,
    student_user,
    total_participants: int = 1
) -> bytes:
    """
    Generates a complete, multi-page response sheet PDF in memory.
    """
    doc = pymupdf.open()
    page_w = 595.0
    page_h = 842.0
    left_m = 40.0
    right_m = 555.0
    usable_w = right_m - left_m

    def new_pdf_page():
        p = doc.new_page(width=page_w, height=page_h)
        return p

    page = new_pdf_page()
    curr_y = 45.0

    # ── Top Branding & Title ──────────────────────────────────────────────────
    # Brand Bar
    page.draw_rect(
        pymupdf.Rect(left_m, curr_y, right_m, curr_y + 44),
        color=(0.38, 0.40, 0.94),
        fill=(0.95, 0.95, 0.99),
    )
    page.insert_text(
        pymupdf.Point(left_m + 14, curr_y + 20),
        "QUIZEE — CANDIDATE OFFICIAL RESPONSE SHEET",
        fontsize=13,
        fontname="helv",
        fontfile=None,
        color=(0.25, 0.28, 0.85)
    )
    page.insert_text(
        pymupdf.Point(left_m + 14, curr_y + 35),
        "Authoritative Assessment Report & Detailed Answer Key Analysis",
        fontsize=8.5,
        fontname="helv",
        color=(0.45, 0.45, 0.55)
    )
    curr_y += 54.0

    # ── Student & Test Details Grid ───────────────────────────────────────────
    score = float(attempt.score)
    tot_marks = float(attempt.total_marks if attempt.total_marks > 0 else 1.0)
    pct = round((score / tot_marks) * 100, 1) if tot_marks > 0 else 0.0
    accuracy = float(attempt.accuracy * 100 if attempt.accuracy <= 1.0 else attempt.accuracy)
    rank_str = f"#{attempt.rank} of {total_participants}" if attempt.rank else f"1 of {total_participants}"

    info_box_h = 76.0
    page.draw_rect(
        pymupdf.Rect(left_m, curr_y, right_m, curr_y + info_box_h),
        color=(0.88, 0.90, 0.94),
        fill=(0.98, 0.98, 0.99),
    )

    col1_x = left_m + 12
    col2_x = left_m + 260

    # Left Column
    page.insert_text(pymupdf.Point(col1_x, curr_y + 18), "Candidate Name:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col1_x + 90, curr_y + 18), str(student_user.name), fontsize=9.5, fontname="helv", color=(0.10, 0.12, 0.18))

    page.insert_text(pymupdf.Point(col1_x, curr_y + 35), "Candidate Email:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col1_x + 90, curr_y + 35), str(student_user.email), fontsize=9, fontname="helv", color=(0.10, 0.12, 0.18))

    page.insert_text(pymupdf.Point(col1_x, curr_y + 52), "Assessment Title:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col1_x + 90, curr_y + 52), str(quiz.title)[:38], fontsize=9.5, fontname="helv", color=(0.10, 0.12, 0.18))

    page.insert_text(pymupdf.Point(col1_x, curr_y + 69), "Submitted At:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col1_x + 90, curr_y + 69), _format_ist(attempt.submitted_at), fontsize=9, fontname="helv", color=(0.10, 0.12, 0.18))

    # Right Column
    page.insert_text(pymupdf.Point(col2_x, curr_y + 18), "Final Score:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col2_x + 90, curr_y + 18), f"{score} / {tot_marks} ({pct}%)", fontsize=10, fontname="helv", color=(0.02, 0.55, 0.35))

    page.insert_text(pymupdf.Point(col2_x, curr_y + 35), "Candidate Rank:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col2_x + 90, curr_y + 35), rank_str, fontsize=9.5, fontname="helv", color=(0.25, 0.28, 0.85))

    page.insert_text(pymupdf.Point(col2_x, curr_y + 52), "Accuracy:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col2_x + 90, curr_y + 52), f"{round(accuracy, 1)}%", fontsize=9.5, fontname="helv", color=(0.10, 0.12, 0.18))

    page.insert_text(pymupdf.Point(col2_x, curr_y + 69), "Total Time Spent:", fontsize=9, fontname="helv", color=(0.45, 0.45, 0.50))
    page.insert_text(pymupdf.Point(col2_x + 90, curr_y + 69), _format_duration(attempt.time_taken_sec or 0), fontsize=9, fontname="helv", color=(0.10, 0.12, 0.18))

    curr_y += info_box_h + 10.0

    # ── Performance Metrics Pill Bar ──────────────────────────────────────────
    bar_h = 24.0
    page.draw_rect(
        pymupdf.Rect(left_m, curr_y, right_m, curr_y + bar_h),
        color=(0.85, 0.88, 0.92),
        fill=(0.94, 0.95, 0.98),
    )
    metric_summary = (
        f"Correct: {attempt.correct_count}   |   "
        f"Incorrect: {attempt.incorrect_count}   |   "
        f"Skipped: {attempt.skipped_count}   |   "
        f"Marked for Review: {attempt.marked_count}   |   "
        f"Total Questions: {len(quiz.questions or [])}"
    )
    page.insert_text(
        pymupdf.Point(left_m + 16, curr_y + 16),
        metric_summary,
        fontsize=9,
        fontname="helv",
        color=(0.22, 0.25, 0.35)
    )
    curr_y += bar_h + 16.0

    # ── Section & Questions Loop ──────────────────────────────────────────────
    questions = sorted(quiz.questions or [], key=lambda q: q.order_index)
    answers_map = {ans.question_id: ans for ans in (attempt.answers or [])}

    page.insert_text(
        pymupdf.Point(left_m, curr_y),
        "QUESTION-BY-QUESTION EVALUATION & CANDIDATE RESPONSES",
        fontsize=10.5,
        fontname="helv",
        color=(0.15, 0.18, 0.30)
    )
    curr_y += 12.0
    page.draw_line(pymupdf.Point(left_m, curr_y), pymupdf.Point(right_m, curr_y), color=(0.80, 0.82, 0.88), width=1)
    curr_y += 14.0

    opt_letters = ["A", "B", "C", "D", "E", "F"]

    for idx, q in enumerate(questions):
        ans = answers_map.get(q.id)
        pos_marks = float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0))
        neg_marks = float(getattr(q, "negative_marks", None) if getattr(q, "negative_marks", None) is not None else 0.0)

        # Determine status
        if ans is None or ans.selected_option is None or ans.selected_option < 0:
            status_text = "SKIPPED / UNANSWERED"
            status_color = (0.45, 0.48, 0.55)
            status_bg = (0.95, 0.95, 0.97)
            marks_awarded_str = "0.00"
        elif ans.is_correct:
            status_text = f"CORRECT (+{pos_marks:g})"
            status_color = (0.05, 0.55, 0.25)
            status_bg = (0.90, 0.98, 0.92)
            marks_awarded_str = f"+{ans.marks_awarded:g}"
        else:
            status_text = f"INCORRECT (-{neg_marks:g})"
            status_color = (0.85, 0.15, 0.15)
            status_bg = (0.99, 0.92, 0.92)
            marks_awarded_str = f"{ans.marks_awarded:g}"

        # Estimate card height needed
        options = sorted(q.options or [], key=lambda o: o.order_index)
        needed_height = 80.0 + (len(options) * 16.0)
        if q.explanation:
            needed_height += 24.0

        # Check page break
        if curr_y + needed_height > 780.0:
            page = new_pdf_page()
            curr_y = 50.0

        card_start_y = curr_y

        # Header bar of question card
        header_h = 22.0
        page.draw_rect(
            pymupdf.Rect(left_m, curr_y, right_m, curr_y + header_h),
            color=(0.85, 0.88, 0.92),
            fill=status_bg,
        )

        q_label = f"Question {idx + 1}  •  Section: {q.section or 'General'}"
        page.insert_text(
            pymupdf.Point(left_m + 8, curr_y + 15),
            q_label,
            fontsize=9,
            fontname="helv",
            color=(0.15, 0.18, 0.25)
        )

        status_display = f"Status: {status_text}   |   Marks: {marks_awarded_str}"
        page.insert_text(
            pymupdf.Point(right_m - 230, curr_y + 15),
            status_display,
            fontsize=8.5,
            fontname="helv",
            color=status_color
        )
        curr_y += header_h + 10.0

        # Question Text
        q_text = (q.text or "Question").strip()
        q_rect = pymupdf.Rect(left_m + 8, curr_y, right_m - 8, curr_y + 40.0)
        # Use insert_textbox with wrap
        rc = page.insert_textbox(
            q_rect,
            q_text,
            fontsize=9.5,
            fontname="helv",
            color=(0.10, 0.12, 0.18)
        )
        # If textbox overflowed, increment curr_y proportionally
        actual_lines = max(1, len(q_text) // 90 + 1)
        curr_y += min(40.0, max(16.0, actual_lines * 13.0)) + 6.0

        # Options List
        selected_opt_idx = ans.selected_option if ans else None
        correct_opt_idx = q.correct_answer

        for opt_i, opt in enumerate(options):
            opt_letter = opt_letters[opt_i] if opt_i < len(opt_letters) else str(opt_i + 1)
            opt_txt = opt.text or ""
            is_selected = (selected_opt_idx == opt_i)
            is_correct_opt = (correct_opt_idx == opt_i)

            bullet = f"({opt_letter}) {opt_txt}"
            opt_color = (0.25, 0.28, 0.35)

            marker = ""
            if is_selected and is_correct_opt:
                marker = "  ← [CANDIDATE SELECTED & CORRECT]"
                opt_color = (0.05, 0.55, 0.25)
            elif is_selected and not is_correct_opt:
                marker = "  ← [CANDIDATE SELECTED - INCORRECT]"
                opt_color = (0.85, 0.15, 0.15)
            elif is_correct_opt:
                marker = "  ← [OFFICIAL CORRECT OPTION]"
                opt_color = (0.05, 0.55, 0.25)

            line_text = f"{bullet}{marker}"
            page.insert_text(
                pymupdf.Point(left_m + 16, curr_y + 10),
                line_text[:95],
                fontsize=8.5,
                fontname="helv",
                color=opt_color
            )
            curr_y += 15.0

        # Candidate selected vs correct summary line
        curr_y += 4.0
        cand_str = f"Option {opt_letters[selected_opt_idx]}" if selected_opt_idx is not None and selected_opt_idx >= 0 and selected_opt_idx < len(opt_letters) else "None (Skipped)"
        corr_str = f"Option {opt_letters[correct_opt_idx]}" if correct_opt_idx is not None and correct_opt_idx >= 0 and correct_opt_idx < len(opt_letters) else "N/A"
        time_spent_str = _format_duration(ans.time_taken_sec) if ans else "0s"

        footer_line = f"Chosen Answer: {cand_str}   |   Correct Answer: {corr_str}   |   Time: {time_spent_str}"
        page.insert_text(
            pymupdf.Point(left_m + 12, curr_y + 10),
            footer_line,
            fontsize=8.5,
            fontname="helv",
            color=(0.35, 0.38, 0.45)
        )
        curr_y += 18.0

        # Optional explanation
        if q.explanation and q.explanation.strip():
            expl_text = f"Explanation: {q.explanation.strip()}"
            page.insert_text(
                pymupdf.Point(left_m + 12, curr_y + 10),
                expl_text[:110],
                fontsize=8.0,
                fontname="helv",
                color=(0.40, 0.42, 0.55)
            )
            curr_y += 16.0

        # Outline box around entire question card
        card_end_y = curr_y + 4.0
        page.draw_rect(
            pymupdf.Rect(left_m, card_start_y, right_m, card_end_y),
            color=(0.85, 0.88, 0.92),
            width=0.8,
        )
        curr_y = card_end_y + 12.0

    # ── Page Number Footers ───────────────────────────────────────────────────
    total_pages = len(doc)
    for p_num in range(total_pages):
        p = doc[p_num]
        footer_y = page_h - 25.0
        p.draw_line(pymupdf.Point(left_m, footer_y - 8), pymupdf.Point(right_m, footer_y - 8), color=(0.88, 0.90, 0.94), width=0.8)
        p.insert_text(
            pymupdf.Point(left_m, footer_y + 4),
            "QuiZee Assessment Platform  •  Official Student Response Sheet",
            fontsize=7.5,
            fontname="helv",
            color=(0.55, 0.58, 0.65)
        )
        page_str = f"Page {p_num + 1} of {total_pages}"
        p.insert_text(
            pymupdf.Point(right_m - 50, footer_y + 4),
            page_str,
            fontsize=7.5,
            fontname="helv",
            color=(0.55, 0.58, 0.65)
        )

    pdf_bytes = doc.tobytes(deflate=True)
    doc.close()
    return pdf_bytes
