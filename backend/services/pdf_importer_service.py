"""
QuiZee — High-Accuracy Bulk Question Importer Service
Hybrid extraction engine combining:
1. PyMuPDF vector rendering & page-boundary aware question segmentation.
2. Coordinate-based bounding box image & diagram association.
3. High-resolution source page cropping for side-by-side admin review.
4. Deterministic answer key and option parser (never guesses printed answers).
5. Comprehensive multi-layer validation engine.
"""
import re
import base64
import io
import json
from typing import List, Dict, Any, Optional, Tuple
import pymupdf  # PyMuPDF
from PIL import Image

from schemas.quiz import (
    BulkImportOptionItem,
    BulkImportQuestionItem,
    BulkImportAnalyzeResponse,
)


def _image_to_base64_data_url(img_bytes: bytes, ext: str = "png") -> str:
    """Convert raw image bytes to base64 data URL."""
    mime = "image/png" if ext.lower() in ["png", "webp"] else "image/jpeg"
    b64 = base64.b64encode(img_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _pixmap_to_base64_data_url(pix: pymupdf.Pixmap) -> str:
    """Convert PyMuPDF pixmap to base64 PNG data URL."""
    png_bytes = pix.tobytes("png")
    return _image_to_base64_data_url(png_bytes, "png")


def _stitch_images_vertically(images_bytes: List[bytes]) -> str:
    """Stitch multiple PNG images vertically into one seamless source preview."""
    if not images_bytes:
        return ""
    if len(images_bytes) == 1:
        return _image_to_base64_data_url(images_bytes[0], "png")

    pil_images = [Image.open(io.BytesIO(b)) for b in images_bytes]
    total_width = max(img.width for img in pil_images)
    total_height = sum(img.height for img in pil_images) + (len(pil_images) - 1) * 10

    stitched = Image.new("RGB", (total_width, total_height), (255, 255, 255))
    y_offset = 0
    for img in pil_images:
        # Center horizontally if widths differ
        x_offset = (total_width - img.width) // 2
        stitched.paste(img, (x_offset, y_offset))
        y_offset += img.height + 10

    buf = io.BytesIO()
    stitched.save(buf, format="PNG")
    return _image_to_base64_data_url(buf.getvalue(), "png")


def _clean_text(text: str) -> str:
    """Clean whitespace, trailing headers, and control artifacts."""
    if not text:
        return ""
    # Normalize unicode spaces
    t = text.replace("\xa0", " ").replace("\r\n", "\n")
    # Collapse 3+ newlines
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _data_url_to_bytes(data_url: str) -> bytes:
    """Extract raw bytes from a base64 data URL."""
    # Format: data:<mime>;base64,<data>
    if "," in data_url:
        b64_part = data_url.split(",", 1)[1]
    else:
        b64_part = data_url
    return base64.b64decode(b64_part)


def parse_match_column_data(text: str) -> Optional[str]:
    """Parse a match-the-column question body into structured JSON.

    Handles both:
    1. Text-based match questions with explicit statements in Column-I and Column-II.
    2. Diagram-based match questions where Column-I items are structures shown in the diagram.

    Returns a JSON string:
    {
        "column_1": [{"label": "A", "text": "..."}, ...],
        "column_2": [{"label": "1", "text": "..."}, ...]
    }
    or None if parsing fails / not enough data found.
    """
    # Locate where the column lists begin (after Column-I / Column-II header lines)
    col_header = re.search(r"Column\s*[-\u2013]?\s*II[^\n]*\n", text, re.IGNORECASE)
    if not col_header:
        col_header = re.search(r"Column\s*[-\u2013]?\s*I[^\n]*\n", text, re.IGNORECASE)
    if not col_header:
        return None

    body = text[col_header.end():]

    # Trim body at the combination-option section (e.g. '(a) A-3...'), answer key, or explanation
    trim_m = re.search(
        r"(?:\n\s*\([a-d]\)\s+[A-D]\s*[-\u2013]|(?:Correct\s+Answer|Answer|Ans|Key)\s*:|Explanation\s*:)",
        body,
        re.IGNORECASE,
    )
    if trim_m:
        body = body[:trim_m.start()]

    # Find all item markers: (A)-(D) for Column-I, (1)-(4) for Column-II
    markers = list(re.finditer(r"\(([A-D1-4])\)", body))
    if not markers:
        return None

    col1: Dict[str, str] = {}
    col2: Dict[str, str] = {}

    for i, m in enumerate(markers):
        label = m.group(1)
        start = m.end()
        end = markers[i + 1].start() if i + 1 < len(markers) else len(body)
        raw_val = _clean_text(body[start:end])

        if label in ["A", "B", "C", "D"]:
            col1[label] = raw_val or "[Structure shown in diagram]"
        elif label in ["1", "2", "3", "4"]:
            col2[label] = raw_val

    if not col1 and not col2:
        return None

    col1_items = [{"label": k, "text": col1[k]} for k in sorted(col1.keys())]
    col2_items = [{"label": k, "text": col2[k]} for k in sorted(col2.keys())]

    return json.dumps(
        {"column_1": col1_items, "column_2": col2_items},
        ensure_ascii=False,
    )


def extract_options_and_answer(raw_body: str) -> Tuple[str, List[Dict[str, Any]], Optional[int], Optional[str], Optional[str]]:
    """
    Parses a question body into:
    (statement_text, options_list, correct_answer_idx, raw_answer_str, explanation)
    """
    # 1. Extract printed answer key if available
    ans_patterns = [
        r"Correct\s+Answer:\s*([A-Za-z0-9,\s\-]+)",
        r"Answer:\s*([A-Za-z0-9,\s\-]+)",
        r"Ans:\s*([A-Za-z0-9,\s\-]+)",
        r"Key:\s*([A-Za-z0-9,\s\-]+)",
    ]
    correct_raw = None
    cleaned_body = raw_body

    for pat in ans_patterns:
        m = re.search(pat, cleaned_body, re.IGNORECASE)
        if m:
            raw_val = m.group(1).strip()
            # Clean up trailing section headers if captured on same line (e.g. 'A\nSECTION B')
            raw_val = re.split(r"\n|SECTION", raw_val, flags=re.IGNORECASE)[0].strip()
            correct_raw = raw_val
            # Cut off answer line from the body for option parsing
            cleaned_body = cleaned_body[:m.start()] + cleaned_body[m.end():]
            break

    # 2. Extract explanation if present
    explanation = None
    exp_m = re.search(r"Explanation:\s*([\s\S]+)", cleaned_body, re.IGNORECASE)
    if exp_m:
        explanation = exp_m.group(1).strip()
        cleaned_body = cleaned_body[:exp_m.start()]

    # 3. Detect Match-the-Column combination choices: (a) A-..., (b) A-..., etc.
    is_match = bool(re.search(r"Column\s*[-–]\s*I", cleaned_body, re.IGNORECASE) or "MATCH THE COLUMN" in cleaned_body.upper())
    comb_opts = list(re.finditer(r"(?:^|\n)\s*\(([a-d])\)\s*([A-D]\s*[-–]\s*\d[\s\S]*?)(?=(?:\n\s*\([a-d]\)|\Z))", cleaned_body))

    options = []
    statement = cleaned_body

    if is_match and len(comb_opts) >= 2:
        statement = cleaned_body[:comb_opts[0].start()].strip()
        for i, om in enumerate(comb_opts):
            options.append({
                "order_index": i,
                "label": chr(ord("A") + i),
                "text": om.group(2).strip(),
                "image": None
            })
    else:
        # Standard options (a)-(f) or (A)-(D)
        # Prefer lowercase (a)-(f) first to avoid matching uppercase letters inside chemical formulas
        std_opts = list(re.finditer(r"(?:^|\n)\s*\(([a-f])\)\s*([\s\S]*?)(?=(?:\n\s*\([a-f]\)|\Z))", cleaned_body))
        if len(std_opts) < 2:
            std_opts = list(re.finditer(r"(?:^|\n)\s*\(([A-F1-4])\)\s*([\s\S]*?)(?=(?:\n\s*\([A-F1-4]\)|\Z))", cleaned_body))

        if len(std_opts) >= 2:
            statement = cleaned_body[:std_opts[0].start()].strip()
            for i, om in enumerate(std_opts):
                label = om.group(1).upper()
                if label in ["1", "2", "3", "4"]:
                    label = chr(ord("A") + int(label) - 1)
                options.append({
                    "order_index": i,
                    "label": label,
                    "text": om.group(2).strip(),
                    "image": None
                })

    # 4. Map correct answer letter to 0-based index
    correct_idx = None
    if correct_raw:
        single_letter_m = re.match(r"^([a-fA-F1-4])(?:\.|\))?$", correct_raw.strip())
        if single_letter_m:
            l = single_letter_m.group(1).upper()
            if l in ["1", "2", "3", "4"]:
                l = chr(ord("A") + int(l) - 1)
            for oi, opt in enumerate(options):
                if opt.get("label") == l:
                    correct_idx = oi
                    break
            if correct_idx is None and options:
                char_code = ord(l) - ord("A")
                if 0 <= char_code < len(options):
                    correct_idx = char_code

    return _clean_text(statement), options, correct_idx, correct_raw, explanation


def detect_question_type(text: str, options: List[Dict], raw_answer: Optional[str]) -> str:
    """Classifies question type strictly following user requirements."""
    upper = text.upper()
    
    # 1. Match the Column
    if "MATCH THE COLUMN" in upper or ("COLUMN-I" in upper and "COLUMN-II" in upper) or ("COLUMN I" in upper and "COLUMN II" in upper):
        return "match_column"

    # 2. Assertion - Reason
    if ("ASSERTION" in upper and "REASON" in upper) or ("ASSERTION (A)" in upper and "REASON (R)" in upper):
        return "assertion_reason"

    # 3. Multi-Correct
    if raw_answer and ("," in raw_answer or "AND" in raw_answer.upper() or len(raw_answer.strip().split()) > 1):
        return "multi_correct"

    # 4. Numerical Answer
    if not options or len(options) == 0:
        if any(term in upper for term in ["INTEGER", "NUMERICAL", "CALCULATE", "VALUE OF"]):
            return "numerical"

    # Default to single_correct
    return "single_correct"


async def analyze_pdf(
    file_bytes: bytes,
    filename: str = "questions.pdf",
    default_pos_marks: float = 4.0,
    default_neg_marks: float = 1.0,
    default_section: str = "General"
) -> BulkImportAnalyzeResponse:
    """
    Main entry point: Analyzes uploaded PDF with hybrid PyMuPDF engine,
    extracts all questions, diagrams, options, and authoritative answer keys,
    and returns a structured intermediate representation for admin review.
    """
    doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    total_pages = len(doc)

    # ── 1. Locate all question start markers across pages ───────────────────────
    # A question header typically looks like 'Q1.', 'Q 1.', 'Question 1:', etc.
    question_starts: List[Tuple[int, float, int]] = [] # (page_idx, y0, question_number)
    
    for p_idx in range(total_pages):
        page = doc[p_idx]
        blocks = [b for b in page.get_text("blocks") if b[6] == 0]
        # Sort blocks top-to-bottom
        for b in sorted(blocks, key=lambda x: x[1]):
            line_txt = b[4].strip()
            # Match Q1., Q2., Question 1., etc.
            m = re.match(r"^(?:Q|Question)\s*(\d+)\s*[\.:]", line_txt, re.IGNORECASE)
            if m:
                q_num = int(m.group(1))
                question_starts.append((p_idx, b[1], q_num))

    # If no 'Q1.' headers found, fallback to numbered list '1.', '2.', etc.
    if len(question_starts) < 2:
        question_starts = []
        for p_idx in range(total_pages):
            page = doc[p_idx]
            blocks = [b for b in page.get_text("blocks") if b[6] == 0]
            for b in sorted(blocks, key=lambda x: x[1]):
                line_txt = b[4].strip()
                m = re.match(r"^(\d{1,3})\s*[\.:]\s+[A-Z]", line_txt)
                if m:
                    q_num = int(m.group(1))
                    question_starts.append((p_idx, b[1], q_num))

    # Sort starts in natural order
    question_starts.sort(key=lambda s: (s[0], s[1]))

    # Deduplicate in case a header appeared twice on the same line
    unique_starts = []
    seen_nums = set()
    for s in question_starts:
        if s[2] not in seen_nums:
            unique_starts.append(s)
            seen_nums.add(s[2])
    question_starts = unique_starts

    # ── 2. Determine exact 2D bounding boxes & spans per question ───────────────
    # q_num -> dict of { page_idx: (y_min, y_max) }
    q_page_spans: Dict[int, Dict[int, Tuple[float, float]]] = {}

    for i, (p_idx, y_start, q_num) in enumerate(question_starts):
        # Look for next question start
        next_start = question_starts[i + 1] if i + 1 < len(question_starts) else None

        if q_num not in q_page_spans:
            q_page_spans[q_num] = {}

        if next_start is None:
            # Last question — goes to end of this page or last page
            q_page_spans[q_num][p_idx] = (y_start, doc[p_idx].rect.height)
            for p in range(p_idx + 1, total_pages):
                q_page_spans[q_num][p] = (0, doc[p].rect.height)
        elif next_start[0] == p_idx:
            # Next question is on the same page
            q_page_spans[q_num][p_idx] = (y_start, next_start[1])
        else:
            # Spans across page boundaries!
            # Current page: from y_start to bottom of page
            q_page_spans[q_num][p_idx] = (y_start, doc[p_idx].rect.height)
            # Intermediate pages: full page
            for p in range(p_idx + 1, next_start[0]):
                q_page_spans[q_num][p] = (0, doc[p].rect.height)
            # Final page: from top of page (0) to next question's start y
            q_page_spans[q_num][next_start[0]] = (0, next_start[1])

    # ── 3. Extract and map embedded images by coordinate containment ────────────
    # q_num -> list of base64 PNG data URLs
    q_extracted_images: Dict[int, List[str]] = {s[2]: [] for s in question_starts}

    for p_idx in range(total_pages):
        page = doc[p_idx]
        page_imgs = page.get_images()
        for img_tuple in page_imgs:
            xref = img_tuple[0]
            rects = page.get_image_rects(xref)
            for r in rects:
                center_y = (r.y0 + r.y1) / 2
                # Find matching question on this page
                matched_q = None
                for q_num, spans in q_page_spans.items():
                    if p_idx in spans:
                        ymin, ymax = spans[p_idx]
                        if ymin <= center_y <= ymax:
                            matched_q = q_num
                            break

                if matched_q:
                    try:
                        extracted = doc.extract_image(xref)
                        if extracted and "image" in extracted:
                            b64_url = _image_to_base64_data_url(extracted["image"], extracted.get("ext", "png"))
                            if b64_url not in q_extracted_images[matched_q]:
                                q_extracted_images[matched_q].append(b64_url)
                    except Exception:
                        pass

    # ── 4. Build high-res source crop preview for side-by-side view ─────────────
    # q_num -> base64 PNG data URL
    q_source_crops: Dict[int, str] = {}
    zoom_mat = pymupdf.Matrix(2.0, 2.0)  # 144 DPI high resolution

    for q_num, spans in q_page_spans.items():
        crop_bytes_list = []
        for p_idx, (ymin, ymax) in sorted(spans.items()):
            page = doc[p_idx]
            pw = page.rect.width
            ph = page.rect.height
            # Add comfortable padding around question bounds
            clip_ymin = max(0, ymin - 6)
            clip_ymax = min(ph, ymax + 6)
            clip_rect = pymupdf.Rect(20, clip_ymin, pw - 20, clip_ymax)
            pix = page.get_pixmap(matrix=zoom_mat, clip=clip_rect)
            crop_bytes_list.append(pix.tobytes("png"))

        if crop_bytes_list:
            q_source_crops[q_num] = _stitch_images_vertically(crop_bytes_list)

    # ── 5. Extract text blocks and build structured question items ──────────────
    questions_out: List[BulkImportQuestionItem] = []
    ready_count = 0
    needs_review_count = 0

    for i, (p_start, y_start, q_num) in enumerate(question_starts):
        spans = q_page_spans.get(q_num, {})
        source_pages = [p + 1 for p in sorted(spans.keys())]

        # Gather all text blocks across the question's page spans
        raw_text_parts = []
        for p_idx, (ymin, ymax) in sorted(spans.items()):
            page = doc[p_idx]
            blocks = [b for b in page.get_text("blocks") if b[6] == 0]
            for b in sorted(blocks, key=lambda x: x[1]):
                # Center of block
                b_cy = (b[1] + b[3]) / 2
                if ymin - 4 <= b_cy <= ymax + 4:
                    raw_text_parts.append(b[4])

        full_raw_body = "\n".join(raw_text_parts)

        # Remove leading Q1., Q2. etc. from statement body
        full_raw_body = re.sub(r"^(?:Q|Question)\s*\d+\s*[\.:]\s*", "", full_raw_body.strip(), flags=re.IGNORECASE)

        # Parse statement, options, correct answer, explanation
        statement, options_dict_list, correct_idx, raw_ans, explanation = extract_options_and_answer(full_raw_body)

        # Determine section: Admin-configured default_section is authoritative
        section = default_section or "Section A"

        # Topic metadata: Extracted independently, does NOT override question section
        topic = None
        if "Kinetics" in filename or "Kinetics" in statement:
            topic = "Chemical Kinetics"
        elif "Organic" in filename or "GOC" in filename or "GOC" in statement:
            topic = "General Organic Chemistry"

        # Strip accidental section header text from problem statement
        statement = re.sub(r"^SECTION\s+[A-Z]\s*—?[^\n]*\n+", "", statement, flags=re.IGNORECASE).strip()

        # Classify question type
        q_type = detect_question_type(statement + " " + (full_raw_body), options_dict_list, raw_ans)

        # Primary question image & diagram
        images = q_extracted_images.get(q_num, [])
        primary_image = None
        diagram_image = None
        match_data_json = None

        # All Match-the-Column questions use image-first table extraction from original PDF
        is_match_column = (q_type == "match_column")

        if is_match_column:
            # ── RULE 1: IMAGE-FIRST TABLE EXTRACTION FROM ORIGINAL PDF ───────────
            # Locate the complete matching table from original PDF page preserving
            # all rows, columns, headings, diagrams, structures, labels, and borders.
            table_cropped = False
            for p_idx, (ymin, ymax) in sorted(spans.items()):
                page = doc[p_idx]
                blocks = [b for b in page.get_text("blocks") if b[6] == 0]
                q_blocks = [
                    b for b in sorted(blocks, key=lambda x: x[1])
                    if (ymin - 4) <= ((b[1] + b[3]) / 2) <= (ymax + 4)
                ]

                col_header_y = None
                opt_start_y = None
                for b in q_blocks:
                    txt = b[4].strip()
                    if (
                        re.search(r"Column\s*[-\u2013]?\s*I(?:\b|\s*\(|\s*\[|\n)", txt, re.IGNORECASE)
                        and col_header_y is None
                    ):
                        if txt.startswith("Column-I") or "\nColumn-I" in txt:
                            col_header_y = b[1]
                        elif not txt.startswith("Match the Column"):
                            col_header_y = b[1]

                    if (
                        re.search(r"^\s*\([a-d1-4]\)\s+[A-Da-d1-4]\s*[-\u2013]", txt, re.IGNORECASE)
                        and opt_start_y is None
                    ):
                        opt_start_y = b[1]

                if col_header_y is None and len(q_blocks) >= 2:
                    col_header_y = q_blocks[1][1]

                if col_header_y is not None and opt_start_y is not None and opt_start_y > col_header_y:
                    clip_rect = pymupdf.Rect(
                        25,
                        max(0, col_header_y - 4),
                        page.rect.width - 25,
                        min(page.rect.height, opt_start_y - 2),
                    )
                    table_pix = page.get_pixmap(matrix=zoom_mat, clip=clip_rect)
                    diagram_image = _pixmap_to_base64_data_url(table_pix)
                    primary_image = None
                    table_cropped = True
                    break

            if not table_cropped:
                # Fallback to question bounds if specific table headers were ambiguous
                if spans:
                    p_idx = min(spans.keys())
                    ymin, ymax = spans[p_idx]
                    page = doc[p_idx]
                    clip_rect = pymupdf.Rect(25, max(0, ymin - 4), page.rect.width - 25, min(page.rect.height, ymax + 4))
                    table_pix = page.get_pixmap(matrix=zoom_mat, clip=clip_rect)
                    diagram_image = _pixmap_to_base64_data_url(table_pix)
                    primary_image = None

            # ── RULE 2: EXTRACT ONLY THE INTRODUCTORY STATEMENT ──────────────────
            # The statement must contain only the problem introduction, without
            # appended reconstructed Column-I/II items or generic placeholders.
            col1_m = re.search(r"\n\s*Column\s*[-\u2013]?\s*I(?:\b|\s*\(|\s*\[)", statement, re.IGNORECASE)
            if col1_m:
                statement = _clean_text(statement[:col1_m.start()])
            else:
                statement = _clean_text(re.split(r"\n\s*Column\s*[-\u2013]?\s*I", statement, flags=re.IGNORECASE)[0])

            # Populate structured match_data if available (as structured backup)
            match_data_json = parse_match_column_data(full_raw_body)
        else:
            # Standard diagram handling for non-visual-match questions
            if images:
                if len(images) == 1:
                    composite_image = images[0]
                else:
                    img_bytes_list = [_data_url_to_bytes(url) for url in images]
                    composite_image = _stitch_images_vertically(img_bytes_list)

                if statement.strip():
                    diagram_image = composite_image
                else:
                    primary_image = composite_image

        # Build options model
        options_models = []
        for opt in options_dict_list:
            options_models.append(BulkImportOptionItem(
                order_index=opt["order_index"],
                label=opt["label"],
                text=opt["text"],
                image=opt.get("image")
            ))

        # ── 6. Deterministic Validation Engine ─────────────────────────────────
        needs_review = False
        review_notes = []
        confidence = 1.0

        if not statement and not primary_image and not diagram_image:
            needs_review = True
            review_notes.append("Question statement text is missing")
            confidence -= 0.4

        if q_type in ["single_correct", "match_column", "assertion_reason"]:
            if len(options_models) < 2:
                needs_review = True
                review_notes.append(f"Expected >= 2 options, found {len(options_models)}")
                confidence -= 0.3
            if correct_idx is None:
                needs_review = True
                review_notes.append(f"Printed correct answer could not be verified (raw: '{raw_ans}')")
                confidence -= 0.25

        if q_type == "match_column" and not diagram_image:
            if "COLUMN-I" not in statement.upper() and "COLUMN I" not in statement.upper():
                review_notes.append("Match the column structure may need formatting review")
                confidence -= 0.1

        confidence = max(0.1, round(confidence, 2))

        if needs_review:
            needs_review_count += 1
        else:
            ready_count += 1

        item = BulkImportQuestionItem(
            question_number=q_num,
            question_type=q_type,
            section=section,
            topic=topic,
            text=statement,
            question_image=primary_image,
            diagram=diagram_image,
            match_data=match_data_json,
            options=options_models,
            correct_answer=correct_idx,
            raw_answer=raw_ans,
            positive_marks=default_pos_marks,
            negative_marks=default_neg_marks if q_type != "numerical" else 0.0,
            source_page=p_start + 1,
            source_pages=source_pages,
            source_image=q_source_crops.get(q_num),
            confidence=confidence,
            needs_review=needs_review,
            review_notes=review_notes,
        )
        questions_out.append(item)

    doc.close()

    return BulkImportAnalyzeResponse(
        filename=filename,
        total_questions=len(questions_out),
        ready_count=ready_count,
        needs_review_count=needs_review_count,
        questions=questions_out
    )
