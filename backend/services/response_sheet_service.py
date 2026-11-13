"""
QuiZee — Candidate Official Response Sheet PDF Generator Service
Generates official, print-ready, high-resolution response sheet PDFs in-memory
using PyMuPDF with dynamic card heights, proportional diagrams, comprehensive
section summaries, and precise multi-correct/numerical/matching visual hierarchy.
"""
import io
import os
import re
import json
import math
import base64
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Set, Tuple
import pymupdf


def _format_ist(dt: Optional[datetime]) -> str:
    if not dt:
        return "N/A"
    try:
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


def _parse_multi_selected(resp_text: Optional[str], sel_opt: Optional[int]) -> Set[int]:
    selected = set()
    if resp_text and str(resp_text).strip():
        val = str(resp_text).strip()
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                for x in parsed:
                    if isinstance(x, int):
                        selected.add(x)
                    elif isinstance(x, str) and x.strip().isdigit():
                        selected.add(int(x.strip()))
                    elif isinstance(x, str) and len(x.strip()) == 1 and x.strip().upper() in "ABCDEF":
                        selected.add(ord(x.strip().upper()) - ord('A'))
        except Exception:
            tokens = re.findall(r"\b([A-Fa-f0-9])\b", val)
            for t in tokens:
                if t.isdigit():
                    selected.add(int(t))
                else:
                    selected.add(ord(t.upper()) - ord('A'))
    if sel_opt is not None and sel_opt >= 0:
        selected.add(sel_opt)
    return selected


def _parse_multi_correct(raw_answer: Optional[str], correct_answer: Optional[int]) -> Set[int]:
    correct = set()
    if raw_answer and str(raw_answer).strip():
        val = str(raw_answer).strip()
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                for x in parsed:
                    if isinstance(x, int):
                        correct.add(x)
                    elif isinstance(x, str) and x.strip().isdigit():
                        correct.add(int(x.strip()))
                    elif isinstance(x, str) and len(x.strip()) == 1 and x.strip().upper() in "ABCDEF":
                        correct.add(ord(x.strip().upper()) - ord('A'))
        except Exception:
            pass
        if not correct:
            tokens = re.findall(r"\b([A-Fa-f0-9])\b", val)
            for t in tokens:
                if t.isdigit():
                    correct.add(int(t))
                else:
                    correct.add(ord(t.upper()) - ord('A'))
    if not correct and correct_answer is not None and correct_answer >= 0:
        correct.add(correct_answer)
    return correct


def _extract_image_bytes(img_val: Optional[str]) -> Optional[bytes]:
    if not img_val or not isinstance(img_val, str):
        return None
    val = img_val.strip()
    if not val:
        return None
    if val.startswith("data:image"):
        comma = val.find(",")
        if comma != -1:
            try:
                return base64.b64decode(val[comma + 1:])
            except Exception:
                return None
    elif os.path.exists(val) and os.path.isfile(val):
        try:
            with open(val, "rb") as f:
                return f.read()
        except Exception:
            return None
    return None


def generate_response_sheet_pdf(
    attempt,
    quiz,
    student_user,
    total_participants: int = 1
) -> bytes:
    """
    Generates a complete, multi-page authoritative response sheet PDF in memory.
    Adheres to competitive exam standards with dynamic card heights, clean typography,
    proportional diagrams, and complete question-type evaluation states.
    """
    doc = pymupdf.open()
    page_w = 595.28  # A4 width (pts)
    page_h = 841.89  # A4 height (pts)
    left_m = 36.0
    right_m = 559.0
    usable_w = right_m - left_m  # 523.0
    top_m = 38.0
    bottom_m = 794.0

    # Scratch page for dynamic text measurement
    scratch_doc = pymupdf.open()
    scratch_page = scratch_doc.new_page(width=page_w, height=10000.0)

    def measure_text_height(text: str, width: float, fontsize: float, fontname: str = "helv") -> float:
        if not text or not text.strip():
            return 0.0
        rect = pymupdf.Rect(0, 0, width, 10000.0)
        rc = scratch_page.insert_textbox(rect, text.strip(), fontsize=fontsize, fontname=fontname)
        used_h = 10000.0 - rc
        return max(fontsize * 1.25, used_h)

    def new_pdf_page():
        p = doc.new_page(width=page_w, height=page_h)
        return p

    opt_letters = ["A", "B", "C", "D", "E", "F", "G", "H"]
    questions = sorted(quiz.questions or [], key=lambda q: q.order_index)
    answers_map = {ans.question_id: ans for ans in (attempt.answers or [])}

    page = new_pdf_page()
    curr_y = top_m

    # ── 1. Page Header (Official Brand Banner) ───────────────────────────────
    header_h = 46.0
    # Navy brand banner
    page.draw_rect(
        pymupdf.Rect(left_m, curr_y, right_m, curr_y + header_h),
        color=(0.14, 0.17, 0.42),
        fill=(0.14, 0.17, 0.42),
    )
    # White logo & brand title
    page.insert_text(
        pymupdf.Point(left_m + 14, curr_y + 20),
        "QUIZEE ASSESSMENT PLATFORM",
        fontsize=14,
        fontname="hebo",
        color=(1.0, 1.0, 1.0)
    )
    # Subtitle
    page.insert_text(
        pymupdf.Point(left_m + 14, curr_y + 36),
        "Official Candidate Response Sheet & Detailed Answer Key Analysis",
        fontsize=8.5,
        fontname="helv",
        color=(0.82, 0.85, 0.98)
    )
    # Right pill badge: Exam Report
    page.insert_text(
        pymupdf.Point(right_m - 120, curr_y + 27),
        "ASSESSMENT REPORT",
        fontsize=9,
        fontname="hebo",
        color=(0.90, 0.92, 1.0)
    )
    curr_y += header_h + 8.0

    # ── 2. Candidate & Assessment Summary Card ───────────────────────────────
    score = float(attempt.score)
    tot_marks = float(attempt.total_marks if attempt.total_marks > 0 else 1.0)
    pct = round((score / tot_marks) * 100, 1) if tot_marks > 0 else 0.0
    accuracy = float(attempt.accuracy * 100 if attempt.accuracy <= 1.0 else attempt.accuracy)
    rank_str = f"#{attempt.rank or 1} of {total_participants}"

    info_box_h = 72.0
    page.draw_rect(
        pymupdf.Rect(left_m, curr_y, right_m, curr_y + info_box_h),
        color=(0.84, 0.87, 0.92),
        fill=(0.98, 0.985, 0.995),
        width=0.8
    )

    col1_x = left_m + 12
    col2_x = left_m + 265

    # Left Column
    page.insert_text(pymupdf.Point(col1_x, curr_y + 16), "Candidate Name:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    page.insert_text(pymupdf.Point(col1_x + 92, curr_y + 16), str(student_user.name)[:30], fontsize=9.5, fontname="hebo", color=(0.08, 0.10, 0.16))

    page.insert_text(pymupdf.Point(col1_x, curr_y + 32), "Candidate Email:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    page.insert_text(pymupdf.Point(col1_x + 92, curr_y + 32), str(student_user.email)[:32], fontsize=9, fontname="helv", color=(0.10, 0.12, 0.20))

    page.insert_text(pymupdf.Point(col1_x, curr_y + 48), "Assessment Title:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    page.insert_text(pymupdf.Point(col1_x + 92, curr_y + 48), str(quiz.title)[:34], fontsize=9, fontname="hebo", color=(0.10, 0.12, 0.20))

    page.insert_text(pymupdf.Point(col1_x, curr_y + 64), "Submitted At:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    page.insert_text(pymupdf.Point(col1_x + 92, curr_y + 64), _format_ist(attempt.submitted_at), fontsize=8.5, fontname="helv", color=(0.15, 0.18, 0.25))

    # Right Column
    page.insert_text(pymupdf.Point(col2_x, curr_y + 16), "Final Score:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    score_color = (0.05, 0.55, 0.25) if score >= 0 else (0.85, 0.15, 0.15)
    page.insert_text(pymupdf.Point(col2_x + 88, curr_y + 16), f"{score:g} / {tot_marks:g}  ({pct}%)", fontsize=10.5, fontname="hebo", color=score_color)

    page.insert_text(pymupdf.Point(col2_x, curr_y + 32), "Candidate Rank:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    page.insert_text(pymupdf.Point(col2_x + 88, curr_y + 32), rank_str, fontsize=9.5, fontname="hebo", color=(0.20, 0.25, 0.75))

    page.insert_text(pymupdf.Point(col2_x, curr_y + 48), "Accuracy:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    page.insert_text(pymupdf.Point(col2_x + 88, curr_y + 48), f"{round(accuracy, 1)}%", fontsize=9, fontname="helv", color=(0.10, 0.12, 0.20))

    page.insert_text(pymupdf.Point(col2_x, curr_y + 64), "Total Time Spent:", fontsize=8.5, fontname="hebo", color=(0.40, 0.44, 0.52))
    page.insert_text(pymupdf.Point(col2_x + 88, curr_y + 64), _format_duration(attempt.time_taken_sec or 0), fontsize=9, fontname="helv", color=(0.10, 0.12, 0.20))

    curr_y += info_box_h + 6.0

    # ── 3. Performance Metrics Pill Bar ───────────────────────────────────────
    bar_h = 22.0
    page.draw_rect(
        pymupdf.Rect(left_m, curr_y, right_m, curr_y + bar_h),
        color=(0.84, 0.87, 0.92),
        fill=(0.94, 0.95, 0.98),
        width=0.7
    )
    metric_summary = (
        f"Correct: {attempt.correct_count}   |   "
        f"Incorrect: {attempt.incorrect_count}   |   "
        f"Skipped: {attempt.skipped_count}   |   "
        f"Marked for Review: {attempt.marked_count}   |   "
        f"Total Questions: {len(questions)}"
    )
    page.insert_text(
        pymupdf.Point(left_m + 14, curr_y + 14.5),
        metric_summary,
        fontsize=8.5,
        fontname="hebo",
        color=(0.18, 0.22, 0.35)
    )
    curr_y += bar_h + 10.0

    # ── 4. Section Summary Table ─────────────────────────────────────────────
    # Compute per-section statistics
    section_names = []
    for q in questions:
        sec = (q.section or "General").strip()
        if sec not in section_names:
            section_names.append(sec)

    sec_stats = []
    for sec in section_names:
        sec_qs = [q for q in questions if (q.section or "General").strip() == sec]
        total_sec_q = len(sec_qs)
        max_sec_marks = sum(float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (q.marks or 1.0)) for q in sec_qs)
        sec_obtained = 0.0
        sec_corr = 0
        sec_inc = 0
        sec_skip = 0

        for q in sec_qs:
            ans = answers_map.get(q.id)
            q_type = getattr(q, "question_type", "single_correct") or "single_correct"
            if ans is None:
                sec_skip += 1
            else:
                sec_obtained += float(ans.marks_awarded or 0.0)
                if q_type == "numerical":
                    if ans.response_text is None or str(ans.response_text).strip() == "":
                        sec_skip += 1
                    elif ans.is_correct:
                        sec_corr += 1
                    else:
                        sec_inc += 1
                elif q_type == "multi_correct":
                    sel_set = _parse_multi_selected(ans.response_text, ans.selected_option)
                    if len(sel_set) == 0:
                        sec_skip += 1
                    elif ans.is_correct:
                        sec_corr += 1
                    else:
                        sec_inc += 1
                else:
                    if ans.selected_option is None or ans.selected_option < 0:
                        sec_skip += 1
                    elif ans.is_correct:
                        sec_corr += 1
                    else:
                        sec_inc += 1

        sec_stats.append({
            "name": sec,
            "questions": total_sec_q,
            "max_marks": max_sec_marks,
            "obtained": sec_obtained,
            "correct": sec_corr,
            "incorrect": sec_inc,
            "skipped": sec_skip,
        })

    # Render Section Summary Table
    sec_th_h = 18.0
    sec_row_h = 16.0
    total_sec_table_h = 14.0 + sec_th_h + (len(sec_stats) * sec_row_h) + (sec_row_h if len(sec_stats) > 1 else 0.0)

    page.insert_text(
        pymupdf.Point(left_m, curr_y + 10),
        "SECTION-WISE SUMMARY & PERFORMANCE",
        fontsize=9.5,
        fontname="hebo",
        color=(0.12, 0.15, 0.28)
    )
    curr_y += 14.0

    # Header Row
    page.draw_rect(
        pymupdf.Rect(left_m, curr_y, right_m, curr_y + sec_th_h),
        color=(0.20, 0.24, 0.42),
        fill=(0.20, 0.24, 0.42),
    )
    col_x = [left_m + 10, left_m + 155, left_m + 235, left_m + 325, left_m + 395, left_m + 465]
    page.insert_text(pymupdf.Point(col_x[0], curr_y + 12), "Section Name", fontsize=8, fontname="hebo", color=(1, 1, 1))
    page.insert_text(pymupdf.Point(col_x[1], curr_y + 12), "Questions", fontsize=8, fontname="hebo", color=(1, 1, 1))
    page.insert_text(pymupdf.Point(col_x[2], curr_y + 12), "Marks Obtained", fontsize=8, fontname="hebo", color=(1, 1, 1))
    page.insert_text(pymupdf.Point(col_x[3], curr_y + 12), "Correct", fontsize=8, fontname="hebo", color=(1, 1, 1))
    page.insert_text(pymupdf.Point(col_x[4], curr_y + 12), "Incorrect", fontsize=8, fontname="hebo", color=(1, 1, 1))
    page.insert_text(pymupdf.Point(col_x[5], curr_y + 12), "Skipped", fontsize=8, fontname="hebo", color=(1, 1, 1))
    curr_y += sec_th_h

    for s_idx, s in enumerate(sec_stats):
        row_fill = (0.98, 0.985, 0.995) if s_idx % 2 == 0 else (1.0, 1.0, 1.0)
        page.draw_rect(
            pymupdf.Rect(left_m, curr_y, right_m, curr_y + sec_row_h),
            color=(0.88, 0.90, 0.94),
            fill=row_fill,
            width=0.5
        )
        page.insert_text(pymupdf.Point(col_x[0], curr_y + 11), str(s["name"])[:26], fontsize=8, fontname="hebo", color=(0.12, 0.15, 0.22))
        page.insert_text(pymupdf.Point(col_x[1], curr_y + 11), str(s["questions"]), fontsize=8, fontname="helv", color=(0.15, 0.18, 0.25))
        page.insert_text(pymupdf.Point(col_x[2], curr_y + 11), f"{s['obtained']:g} / {s['max_marks']:g}", fontsize=8, fontname="hebo", color=(0.05, 0.55, 0.25) if s["obtained"] >= 0 else (0.85, 0.15, 0.15))
        page.insert_text(pymupdf.Point(col_x[3], curr_y + 11), str(s["correct"]), fontsize=8, fontname="helv", color=(0.05, 0.55, 0.25))
        page.insert_text(pymupdf.Point(col_x[4], curr_y + 11), str(s["incorrect"]), fontsize=8, fontname="helv", color=(0.85, 0.15, 0.15))
        page.insert_text(pymupdf.Point(col_x[5], curr_y + 11), str(s["skipped"]), fontsize=8, fontname="helv", color=(0.45, 0.48, 0.55))
        curr_y += sec_row_h

    # Optional Total Row if multiple sections
    if len(sec_stats) > 1:
        page.draw_rect(
            pymupdf.Rect(left_m, curr_y, right_m, curr_y + sec_row_h),
            color=(0.80, 0.84, 0.90),
            fill=(0.93, 0.94, 0.98),
            width=0.7
        )
        page.insert_text(pymupdf.Point(col_x[0], curr_y + 11), "Total", fontsize=8, fontname="hebo", color=(0.10, 0.12, 0.20))
        page.insert_text(pymupdf.Point(col_x[1], curr_y + 11), str(len(questions)), fontsize=8, fontname="hebo", color=(0.10, 0.12, 0.20))
        page.insert_text(pymupdf.Point(col_x[2], curr_y + 11), f"{score:g} / {tot_marks:g}", fontsize=8, fontname="hebo", color=score_color)
        page.insert_text(pymupdf.Point(col_x[3], curr_y + 11), str(attempt.correct_count), fontsize=8, fontname="hebo", color=(0.05, 0.55, 0.25))
        page.insert_text(pymupdf.Point(col_x[4], curr_y + 11), str(attempt.incorrect_count), fontsize=8, fontname="hebo", color=(0.85, 0.15, 0.15))
        page.insert_text(pymupdf.Point(col_x[5], curr_y + 11), str(attempt.skipped_count), fontsize=8, fontname="hebo", color=(0.45, 0.48, 0.55))
        curr_y += sec_row_h

    curr_y += 14.0

    # Divider before questions
    page.draw_line(pymupdf.Point(left_m, curr_y), pymupdf.Point(right_m, curr_y), color=(0.82, 0.85, 0.90), width=0.8)
    curr_y += 10.0

    page.insert_text(
        pymupdf.Point(left_m, curr_y),
        "QUESTION-BY-QUESTION EVALUATION & CANDIDATE RESPONSES",
        fontsize=10,
        fontname="hebo",
        color=(0.12, 0.15, 0.28)
    )
    curr_y += 12.0

    # ── 5. Question-by-Question Evaluation Loop ──────────────────────────────
    for idx, q in enumerate(questions):
        ans = answers_map.get(q.id)
        q_type = getattr(q, "question_type", "single_correct") or "single_correct"
        pos_marks = float(getattr(q, "positive_marks", None) if getattr(q, "positive_marks", None) is not None else (4.0 if q_type == "numerical" else (q.marks or 1.0)))
        neg_marks = float(getattr(q, "negative_marks", None) if getattr(q, "negative_marks", None) is not None else (1.0 if q_type == "numerical" else 0.0))
        is_match = (q_type == "match_the_column")
        is_numerical = (q_type == "numerical")
        is_multi = (q_type == "multi_correct")

        # Friendly type label
        if is_numerical:
            type_label = "Numerical Answer"
        elif is_multi:
            type_label = "Multi-Correct MCQ"
        elif is_match:
            type_label = "Match the Column"
        else:
            type_label = "Single Correct MCQ"

        # Determine Attempt Status & Marks
        time_spent_str = _format_duration(ans.time_taken_sec) if ans else "0s"

        if is_numerical:
            entered_val = str(ans.response_text).strip() if (ans and ans.response_text is not None and str(ans.response_text).strip() != "") else None
            if entered_val is None:
                status_text = "SKIPPED / NOT ATTEMPTED"
                status_color = (0.45, 0.48, 0.55)
                status_bg = (0.95, 0.96, 0.98)
                marks_str = "0.00"
            elif ans.is_correct:
                status_text = "CORRECT"
                status_color = (0.05, 0.55, 0.25)
                status_bg = (0.90, 0.98, 0.92)
                marks_str = f"+{ans.marks_awarded:g}"
            else:
                status_text = "INCORRECT"
                status_color = (0.85, 0.15, 0.15)
                status_bg = (0.99, 0.92, 0.92)
                marks_str = f"{ans.marks_awarded:g}"

        elif is_multi:
            sel_set = _parse_multi_selected(ans.response_text, ans.selected_option) if ans else set()
            corr_set = _parse_multi_correct(q.raw_answer, q.correct_answer)
            if len(sel_set) == 0:
                status_text = "SKIPPED / NOT ATTEMPTED"
                status_color = (0.45, 0.48, 0.55)
                status_bg = (0.95, 0.96, 0.98)
                marks_str = "0.00"
            elif ans.is_correct:
                status_text = "CORRECT (FULL MARKS)"
                status_color = (0.05, 0.55, 0.25)
                status_bg = (0.90, 0.98, 0.92)
                marks_str = f"+{ans.marks_awarded:g}"
            elif ans.marks_awarded > 0:
                status_text = "PARTIAL MARKS"
                status_color = (0.28, 0.25, 0.85)
                status_bg = (0.93, 0.94, 0.99)
                marks_str = f"+{ans.marks_awarded:g}"
            else:
                status_text = "INCORRECT"
                status_color = (0.85, 0.15, 0.15)
                status_bg = (0.99, 0.92, 0.92)
                marks_str = f"{ans.marks_awarded:g}"

        else:
            # Single MCQ or Match the Column
            sel_opt = ans.selected_option if ans else None
            if sel_opt is None or sel_opt < 0:
                status_text = "SKIPPED / NOT ATTEMPTED"
                status_color = (0.45, 0.48, 0.55)
                status_bg = (0.95, 0.96, 0.98)
                marks_str = "0.00"
            elif ans.is_correct:
                status_text = "CORRECT"
                status_color = (0.05, 0.55, 0.25)
                status_bg = (0.90, 0.98, 0.92)
                marks_str = f"+{ans.marks_awarded:g}"
            else:
                status_text = "INCORRECT"
                status_color = (0.85, 0.15, 0.15)
                status_bg = (0.99, 0.92, 0.92)
                marks_str = f"{ans.marks_awarded:g}"

        # ── Pre-estimate dynamic height for this card ─────────────────────────
        options = sorted(q.options or [], key=lambda o: o.order_index)
        q_text = (q.text or "").strip()
        q_text_h = measure_text_height(q_text, usable_w - 24, fontsize=10.5, fontname="hebo")

        # Check diagram / image asset
        raw_img_bytes = None
        img_h = 0.0
        img_w = 0.0
        img_val = q.diagram or q.question_image
        if img_val:
            raw_img_bytes = _extract_image_bytes(img_val)
            if raw_img_bytes:
                try:
                    pix = pymupdf.Pixmap(raw_img_bytes)
                    if pix.width > 0 and pix.height > 0:
                        aspect = pix.height / pix.width
                        max_w = min(460.0, usable_w - 30)
                        max_h = 220.0 if is_match else 180.0
                        calc_w = min(max_w, float(pix.width))
                        calc_h = calc_w * aspect
                        if calc_h > max_h:
                            calc_h = max_h
                            calc_w = calc_h / aspect
                        img_w = calc_w
                        img_h = calc_h + 16.0  # padding + label
                    pix = None
                except Exception:
                    raw_img_bytes = None
                    img_h = 0.0

        # Estimate answer block height
        if is_numerical:
            answer_block_h = 56.0
        elif is_multi:
            # Multi options + candidate selection summary + scoring rule outcome explanation
            answer_block_h = (len(options) * 16.0) + 40.0
        else:
            answer_block_h = (len(options) * 16.0) + 24.0

        explanation_h = 0.0
        if q.explanation and q.explanation.strip():
            explanation_h = measure_text_height(f"Official Explanation: {q.explanation.strip()}", usable_w - 28, fontsize=8.5, fontname="helv") + 16.0

        card_total_estimated_h = 24.0 + q_text_h + img_h + answer_block_h + explanation_h + 24.0

        # ── Dynamic Pagination Check ──────────────────────────────────────────
        # If card doesn't fit on current page and we've already drawn content, start fresh page!
        if curr_y + card_total_estimated_h > bottom_m:
            if curr_y > top_m + 30.0:
                page = new_pdf_page()
                curr_y = top_m

        card_start_y = curr_y

        # Card Header
        header_h = 22.0
        page.draw_rect(
            pymupdf.Rect(left_m, curr_y, right_m, curr_y + header_h),
            color=(0.84, 0.87, 0.92),
            fill=status_bg,
            width=0.7
        )

        left_hdr = f"Question {idx + 1}   •   Section: {q.section or 'General'}   •   {type_label}"
        page.insert_text(
            pymupdf.Point(left_m + 10, curr_y + 15),
            left_hdr,
            fontsize=9,
            fontname="hebo",
            color=(0.12, 0.15, 0.25)
        )

        right_hdr = f"Status: {status_text}   |   Marks: {marks_str}   |   Time: {time_spent_str}"
        page.insert_text(
            pymupdf.Point(right_m - 250, curr_y + 15),
            right_hdr,
            fontsize=8.5,
            fontname="hebo",
            color=status_color
        )
        curr_y += header_h + 8.0

        # Problem Statement (with robust text wrap)
        q_rect = pymupdf.Rect(left_m + 10, curr_y, right_m - 10, curr_y + q_text_h + 10.0)
        page.insert_textbox(
            q_rect,
            q_text,
            fontsize=10.5,
            fontname="hebo",
            color=(0.08, 0.10, 0.16)
        )
        curr_y += q_text_h + 8.0

        # Diagram / Matching Table Visual
        if raw_img_bytes and img_h > 0:
            if is_match:
                page.insert_text(
                    pymupdf.Point(left_m + 10, curr_y + 8),
                    "Original Matching Table (from PDF Source):",
                    fontsize=8,
                    fontname="hebo",
                    color=(0.31, 0.27, 0.85)
                )
                curr_y += 12.0
            img_x = left_m + (usable_w - img_w) / 2.0
            img_rect = pymupdf.Rect(img_x, curr_y, img_x + img_w, curr_y + (img_h - 16.0))
            page.draw_rect(img_rect, color=(0.84, 0.87, 0.92), width=0.6)
            try:
                page.insert_image(img_rect, stream=raw_img_bytes)
            except Exception:
                pass
            curr_y += (img_h - 16.0) + 10.0

        # ── Question Answers / Input Display ──────────────────────────────────
        if is_numerical:
            # Dedicated Numerical Answer Box
            num_box_h = 44.0
            page.draw_rect(
                pymupdf.Rect(left_m + 10, curr_y, right_m - 10, curr_y + num_box_h),
                color=(0.84, 0.87, 0.92),
                fill=(0.98, 0.985, 0.995),
                width=0.7
            )

            cand_entered = str(ans.response_text).strip() if (ans and ans.response_text is not None and str(ans.response_text).strip() != "") else "Not Attempted"
            official_raw = str(q.raw_answer).strip() if (q.raw_answer and str(q.raw_answer).strip() != "") else "N/A"

            # Left: Candidate's Answer
            page.insert_text(pymupdf.Point(left_m + 20, curr_y + 18), "Your Answer:", fontsize=9, fontname="hebo", color=(0.35, 0.38, 0.45))
            cand_color = (0.05, 0.55, 0.25) if ans and ans.is_correct else ((0.85, 0.15, 0.15) if cand_entered != "Not Attempted" else (0.50, 0.52, 0.60))
            page.insert_text(pymupdf.Point(left_m + 95, curr_y + 18), cand_entered, fontsize=10, fontname="hebo", color=cand_color)

            # Right: Official Correct Answer
            page.insert_text(pymupdf.Point(left_m + 260, curr_y + 18), "Correct Answer:", fontsize=9, fontname="hebo", color=(0.35, 0.38, 0.45))
            page.insert_text(pymupdf.Point(left_m + 345, curr_y + 18), official_raw, fontsize=10, fontname="hebo", color=(0.05, 0.55, 0.25))

            # Status line inside box
            status_summary = f"Status: {status_text}   |   Marks Awarded: {marks_str} / {pos_marks:g}   |   Rule: Integer / Decimal (≤ 2 places)"
            page.insert_text(pymupdf.Point(left_m + 20, curr_y + 34), status_summary, fontsize=8, fontname="helv", color=(0.40, 0.44, 0.50))
            curr_y += num_box_h + 8.0

        elif is_multi:
            # Multi-Correct Options + Breakdown
            sel_set = _parse_multi_selected(ans.response_text, ans.selected_option) if ans else set()
            corr_set = _parse_multi_correct(q.raw_answer, q.correct_answer)

            for opt_i, opt in enumerate(options):
                opt_letter = opt_letters[opt_i] if opt_i < len(opt_letters) else str(opt_i + 1)
                opt_txt = (opt.text or "").strip()
                is_selected = (opt_i in sel_set)
                is_correct_opt = (opt_i in corr_set)

                bullet = f"({opt_letter}) {opt_txt}"
                opt_color = (0.22, 0.25, 0.32)

                if is_selected and is_correct_opt:
                    marker = "  [✓ SELECTED & CORRECT]"
                    opt_color = (0.05, 0.55, 0.25)
                    font_w = "hebo"
                elif is_selected and not is_correct_opt:
                    marker = "  [✗ SELECTED - WRONG]"
                    opt_color = (0.85, 0.15, 0.15)
                    font_w = "hebo"
                elif is_correct_opt:
                    marker = "  [✓ CORRECT KEY (NOT SELECTED)]"
                    opt_color = (0.25, 0.28, 0.85)
                    font_w = "hebo"
                else:
                    marker = ""
                    font_w = "helv"

                line_text = f"{bullet}{marker}"
                page.insert_text(
                    pymupdf.Point(left_m + 16, curr_y + 11),
                    line_text[:100],
                    fontsize=8.5,
                    fontname=font_w,
                    color=opt_color
                )
                curr_y += 15.0

            # Multi-Correct Summary & Partial/Negative Explanation Banner
            curr_y += 3.0
            cand_letters_str = ", ".join(opt_letters[i] for i in sorted(list(sel_set)) if i < len(opt_letters)) if len(sel_set) > 0 else "None (Not Attempted)"
            corr_letters_str = ", ".join(opt_letters[i] for i in sorted(list(corr_set)) if i < len(opt_letters)) if len(corr_set) > 0 else "N/A"

            # Determine scoring reason note
            incorrect_sel = sel_set - corr_set
            correct_sel = sel_set & corr_set
            if len(sel_set) == 0:
                rule_note = "Outcome: Question skipped. Awarded 0 marks."
            elif len(incorrect_sel) > 0:
                rule_note = f"Outcome: Wrong option selected ({', '.join(opt_letters[i] for i in incorrect_sel)}). Penalty applied: -{neg_marks:g} marks."
            elif sel_set == corr_set:
                rule_note = f"Outcome: All correct options selected without errors. Full credit awarded: +{pos_marks:g} marks."
            else:
                rule_note = f"Outcome: Partial marks awarded: +{ans.marks_awarded:g} (Selected {len(correct_sel)} of {len(corr_set)} correct options, 0 incorrect)."

            page.draw_rect(
                pymupdf.Rect(left_m + 10, curr_y, right_m - 10, curr_y + 28.0),
                color=(0.86, 0.88, 0.94),
                fill=(0.96, 0.97, 0.99),
                width=0.6
            )
            page.insert_text(
                pymupdf.Point(left_m + 16, curr_y + 12),
                f"Your Selected: [{cand_letters_str}]   |   Official Correct Key: [{corr_letters_str}]",
                fontsize=8.5,
                fontname="hebo",
                color=(0.12, 0.15, 0.25)
            )
            page.insert_text(
                pymupdf.Point(left_m + 16, curr_y + 23),
                rule_note,
                fontsize=8,
                fontname="helv",
                color=(0.30, 0.35, 0.45)
            )
            curr_y += 34.0

        else:
            # Single MCQ or Match the Column Options
            selected_opt_idx = ans.selected_option if ans else None
            correct_opt_idx = q.correct_answer

            for opt_i, opt in enumerate(options):
                opt_letter = opt_letters[opt_i] if opt_i < len(opt_letters) else str(opt_i + 1)
                opt_txt = (opt.text or "").strip()
                is_selected = (selected_opt_idx == opt_i)
                is_correct_opt = (correct_opt_idx == opt_i)

                bullet = f"({opt_letter}) {opt_txt}"
                opt_color = (0.22, 0.25, 0.32)

                if is_selected and is_correct_opt:
                    marker = "  [✓ CANDIDATE SELECTED & CORRECT]"
                    opt_color = (0.05, 0.55, 0.25)
                    font_w = "hebo"
                elif is_selected and not is_correct_opt:
                    marker = "  [✗ CANDIDATE SELECTED - INCORRECT]"
                    opt_color = (0.85, 0.15, 0.15)
                    font_w = "hebo"
                elif is_correct_opt:
                    marker = "  [✓ OFFICIAL CORRECT OPTION]"
                    opt_color = (0.02, 0.50, 0.35)
                    font_w = "hebo"
                else:
                    marker = ""
                    font_w = "helv"

                line_text = f"{bullet}{marker}"
                page.insert_text(
                    pymupdf.Point(left_m + 16, curr_y + 11),
                    line_text[:100],
                    fontsize=8.5,
                    fontname=font_w,
                    color=opt_color
                )
                curr_y += 15.0

            # Candidate selected vs official correct answer summary
            curr_y += 3.0
            cand_str = f"Option {opt_letters[selected_opt_idx]}" if selected_opt_idx is not None and 0 <= selected_opt_idx < len(opt_letters) else "None (Not Attempted)"
            corr_str = f"Option {opt_letters[correct_opt_idx]}" if correct_opt_idx is not None and 0 <= correct_opt_idx < len(opt_letters) else "N/A"

            footer_line = f"Candidate Answer: {cand_str}   |   Official Key: {corr_str}   |   Result: {status_text} ({marks_str})"
            page.draw_rect(
                pymupdf.Rect(left_m + 10, curr_y, right_m - 10, curr_y + 18.0),
                color=(0.86, 0.88, 0.94),
                fill=(0.96, 0.97, 0.99),
                width=0.6
            )
            page.insert_text(
                pymupdf.Point(left_m + 16, curr_y + 12),
                footer_line,
                fontsize=8.5,
                fontname="hebo",
                color=(0.15, 0.18, 0.25)
            )
            curr_y += 24.0

        # Explanation / Solution Box
        if q.explanation and q.explanation.strip():
            expl_text = f"Explanation & Solution: {q.explanation.strip()}"
            expl_h = measure_text_height(expl_text, usable_w - 30, fontsize=8.5, fontname="helv")
            expl_box_h = expl_h + 8.0
            page.draw_rect(
                pymupdf.Rect(left_m + 10, curr_y, right_m - 10, curr_y + expl_box_h),
                color=(0.78, 0.82, 0.92),
                fill=(0.95, 0.96, 0.99),
                width=0.6
            )
            page.insert_textbox(
                pymupdf.Rect(left_m + 16, curr_y + 4, right_m - 16, curr_y + expl_box_h),
                expl_text,
                fontsize=8.5,
                fontname="helv",
                color=(0.20, 0.24, 0.38)
            )
            curr_y += expl_box_h + 8.0

        # Draw outer bounding box for entire question card
        card_end_y = curr_y + 2.0
        page.draw_rect(
            pymupdf.Rect(left_m, card_start_y, right_m, card_end_y),
            color=(0.82, 0.85, 0.90),
            width=0.8
        )
        curr_y = card_end_y + 10.0

    # ── 6. Running Headers & Footers on Every Page ───────────────────────────
    total_pages = len(doc)
    for p_num in range(total_pages):
        p = doc[p_num]

        # Top Running Header on subsequent pages (Pages 2+)
        if p_num > 0:
            p.insert_text(
                pymupdf.Point(left_m, 22.0),
                f"QUIZEE  •  {quiz.title[:45]}",
                fontsize=8,
                fontname="hebo",
                color=(0.40, 0.44, 0.52)
            )
            p.insert_text(
                pymupdf.Point(right_m - 170, 22.0),
                f"Candidate: {student_user.name[:25]}",
                fontsize=8,
                fontname="helv",
                color=(0.40, 0.44, 0.52)
            )
            p.draw_line(
                pymupdf.Point(left_m, 26.0),
                pymupdf.Point(right_m, 26.0),
                color=(0.86, 0.88, 0.92),
                width=0.6
            )

        # Bottom Running Footer (All Pages)
        footer_y = page_h - 22.0
        p.draw_line(
            pymupdf.Point(left_m, footer_y - 7.0),
            pymupdf.Point(right_m, footer_y - 7.0),
            color=(0.86, 0.88, 0.92),
            width=0.6
        )
        p.insert_text(
            pymupdf.Point(left_m, footer_y + 4.0),
            "QuiZee Assessment Platform  •  Candidate Official Response Sheet",
            fontsize=8,
            fontname="helv",
            color=(0.48, 0.52, 0.60)
        )
        p.insert_text(
            pymupdf.Point(right_m - 60, footer_y + 4.0),
            f"Page {p_num + 1} of {total_pages}",
            fontsize=8,
            fontname="hebo",
            color=(0.48, 0.52, 0.60)
        )

    scratch_doc.close()
    pdf_bytes = doc.tobytes(deflate=True)
    doc.close()
    return pdf_bytes
