"""
Layout-aware question parser for typeset JEE papers.

Why: papers produced from HTML/LaTeX (KaTeX, MathJax, LaTeX fonts) store every
formula as many small fragments in maths fonts. Reading text block-by-block
scrambles the order, separates "(a)" from its value, and loses powers, roots,
fractions and matrices. This parser works on positions instead:

  • Everything on the page (text spans, embedded images, vector drawings) is
    placed on one "global y" axis across pages, so a question can continue on
    the next page.
  • A question runs from its "Q12." header to the next question header or the
    next section banner (so "SECTION B: NUMERICAL…" never leaks into Q20).
  • Option labels "(a)…(d)" at the left margin split the options; the printed
    "Correct Answer: X" line gives the key.
  • Any statement or option that contains maths fonts, a table/fraction/root
    (vector drawing) or a picture is cut out of the PDF as a crisp image, so it
    looks exactly like the paper. Plain-text parts stay text.
  • Clean reading-order text is kept for every question (tag_text) so chapter
    tagging still works when the statement itself is shown as an image.
"""
from __future__ import annotations

import base64
import re
from typing import Any, Dict, List, Optional, Tuple

import pymupdf

PAGE_STRIDE = 100000.0            # global y = page_index * PAGE_STRIDE + y
ZOOM = 2.4                         # crop resolution (≈ 173 DPI): sharp maths, small files
# Fonts used by typeset maths (stacked fractions, roots, matrices). The old "Symbol"
# font is NOT here: it only swaps single glyphs (→, ×, α) that extract as Unicode fine.
MATH_FONT_RE = re.compile(r"KaTeX|MathJax|^CM(MI|SY|EX)\d|^CMR\d|STIX|Cambria ?Math|Math(Italic|Regular)|^MTPro", re.IGNORECASE)
LABEL_RE = re.compile(r"^\(\s*([a-dA-D1-4])\s*\)")
ANSWER_RE = re.compile(r"^(?:Correct\s+Answer|Answer|Ans|Key)\s*[:\-–]\s*(.+)$", re.IGNORECASE)
QHEAD_RE = re.compile(r"^(?:Q|Question)\s*(\d+)\s*[\.:]", re.IGNORECASE)
SUBJECTS = {"MATHEMATICS": "Mathematics", "MATHS": "Mathematics", "MATH": "Mathematics",
            "PHYSICS": "Physics", "CHEMISTRY": "Chemistry"}
BANNER_RE = re.compile(
    r"^(?:(?:PART|SUBJECT)\s*[-–:]?\s*[A-C1-3]?\s*[-–:.]?\s*)?"
    r"(?:(MATHEMATICS|MATHS|PHYSICS|CHEMISTRY)\b\s*[—–\-:]*\s*)?"
    r"(?:SECTION|PART)\s*[-–]?\s*([A-H1-8])\b\s*[:\-–—.]?\s*(.*)$",
    re.IGNORECASE,
)
SUBJECT_ONLY_RE = re.compile(r"^(?:(?:PART|SUBJECT)\s*[-–:]?\s*[A-C1-3]?\s*[-–:.]?\s*)?(MATHEMATICS|MATHS|PHYSICS|CHEMISTRY)\s*$", re.IGNORECASE)


def _section_kind(rest: str) -> Optional[str]:
    u = (rest or "").upper()
    if "NUMERICAL" in u or "INTEGER" in u:
        return "Numerical"
    if "MULTIPLE CORRECT" in u or "MORE THAN ONE" in u or "MULTI" in u and "CORRECT" in u:
        return "Multi-correct"
    if "MATCH" in u:
        return "Match"
    if "ASSERTION" in u:
        return "Assertion-Reason"
    if "MULTIPLE CHOICE" in u or "MCQ" in u or "SINGLE" in u:
        return "MCQ"
    return None


def _png_data_url(pix: pymupdf.Pixmap) -> str:
    return "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode("ascii")


class _Item:
    __slots__ = ("kind", "page", "rect", "text", "font", "size", "gy0", "gy1")

    def __init__(self, kind, page, rect, text="", font="", size=0.0):
        self.kind, self.page, self.rect, self.text, self.font, self.size = kind, page, pymupdf.Rect(rect), text, font, size
        self.gy0 = page * PAGE_STRIDE + self.rect.y0
        self.gy1 = page * PAGE_STRIDE + self.rect.y1

    @property
    def gcy(self):
        return (self.gy0 + self.gy1) / 2

    @property
    def is_math(self):
        return self.kind == "span" and bool(MATH_FONT_RE.search(self.font or ""))


def _collect(doc) -> List[_Item]:
    items: List[_Item] = []
    for p_idx, page in enumerate(doc):
        pw = page.rect.width
        for b in page.get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for line in b.get("lines", []):
                for s in line.get("spans", []):
                    if s["text"].strip():
                        items.append(_Item("span", p_idx, s["bbox"], s["text"], s.get("font", ""), s.get("size", 0)))
        for info in page.get_image_info(xrefs=True):
            r = pymupdf.Rect(info["bbox"])
            if r.width > 4 and r.height > 4:
                items.append(_Item("image", p_idx, r))
        try:
            drawings = page.get_drawings()
        except Exception:
            drawings = []
        for d in drawings:
            r = pymupdf.Rect(d.get("rect") or (0, 0, 0, 0))
            # skip full-width banners / page rules / backgrounds
            if r.width > 0.8 * pw or (r.width <= 0.5 and r.height <= 0.5):
                continue
            items.append(_Item("draw", p_idx, r))
    items.sort(key=lambda it: (it.gy0, it.rect.x0))
    return items


def _rows(spans: List[_Item]) -> List[List[_Item]]:
    """Group spans into visual lines (vertical overlap), each sorted left→right."""
    rows: List[List[_Item]] = []
    for s in sorted(spans, key=lambda x: (x.gcy, x.rect.x0)):
        placed = False
        for row in rows[-3:]:
            y0 = min(r.gy0 for r in row)
            y1 = max(r.gy1 for r in row)
            ov = min(y1, s.gy1) - max(y0, s.gy0)
            if ov > 0.45 * min(s.gy1 - s.gy0, y1 - y0):
                row.append(s)
                placed = True
                break
        if not placed:
            rows.append([s])
    for row in rows:
        row.sort(key=lambda x: x.rect.x0)
    rows.sort(key=lambda r: min(x.gy0 for x in r))
    return rows


_SUP = dict(zip("0123456789+-−=()nitho", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱᵗʰᵒ"))
_SUB = dict(zip("0123456789+-−=()aeox", "₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₒₓ"))


def _script(text: str, table: Dict[str, str]) -> Optional[str]:
    t = text.strip()
    if t and all(ch in table for ch in t):
        return "".join(table[ch] for ch in t)
    return None


def _row_text(row: List[_Item]) -> str:
    # small raised / lowered spans are super- / subscripts (BaSO₄, mol⁻¹, 7ᵗʰ)
    plain = [s for s in row if not s.is_math and s.size]
    main = max((s.size for s in plain), default=0)
    big = [s for s in plain if s.size >= 0.9 * main]
    mid = sorted((s.rect.y0 + s.rect.y1) / 2 for s in big)[len(big) // 2] if big else None
    out = ""
    prev = None
    for s in row:
        t = s.text
        if mid is not None and not s.is_math and s.size and s.size < 0.85 * main:
            cy = (s.rect.y0 + s.rect.y1) / 2
            conv = _script(t, _SUP) if cy < mid - 1 else _script(t, _SUB) if cy > mid + 1 else None
            if conv:
                out += conv
                prev = s
                continue
        if prev is not None and s.rect.x0 - prev.rect.x1 > 1.2 and not out.endswith(" ") and not t.startswith(" "):
            out += " "
        out += t
        prev = s
    return re.sub(r"[​‌‍⁡⁢⁣]", "", out).strip()


_BREAK_BEFORE = re.compile(
    r"^(?:[A-H]\s*[.=:)]|\(?[ivx]{1,4}\)|\([a-h]\)|\d{1,2}[.)]\s|Statement\s+[IV]+|Assertion|Reason|Column|"
    r"Choose the|In the light|\[Numerical|[•▪◦\-–]\s)",
    re.IGNORECASE,
)


def _text_of(spans: List[_Item]) -> str:
    """Reading-order text; wrapped lines are joined, list items / statements keep their own line."""
    out: List[str] = []
    for line in (_row_text(r) for r in _rows(spans)):
        if not line:
            continue
        if out and not _BREAK_BEFORE.match(line) and not out[-1].endswith(":"):
            out[-1] = out[-1] + " " + line
        else:
            out.append(line)
    return re.sub(r"[ \t]+", " ", "\n".join(out)).strip()


def _crop(doc, items: List[_Item], g0: float, g1: float, x0: Optional[float] = None, pad: float = 3.0) -> Optional[str]:
    """Render the content inside [g0, g1] (global y) as one PNG, stitched across pages."""
    inside = [it for it in items if g0 <= it.gcy < g1]
    if not inside:
        return None
    parts = []
    for p_idx in sorted({it.page for it in inside}):
        on = [it for it in inside if it.page == p_idx]
        page = doc[p_idx]
        rx0 = min(it.rect.x0 for it in on) if x0 is None else x0
        rect = pymupdf.Rect(
            max(0, rx0 - pad), max(0, min(it.rect.y0 for it in on) - pad),
            min(page.rect.width, max(it.rect.x1 for it in on) + pad), min(page.rect.height, max(it.rect.y1 for it in on) + pad),
        )
        if rect.is_empty or rect.width < 2 or rect.height < 2:
            continue
        parts.append(page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=rect, alpha=False))
    if not parts:
        return None
    if len(parts) == 1:
        return _png_data_url(parts[0])
    w = max(p.width for p in parts)
    h = sum(p.height for p in parts)
    canvas = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h), False)
    canvas.clear_with(255)
    y = 0
    for p in parts:
        p.set_origin(0, y)
        canvas.copy(p, p.irect)
        y += p.height
    return _png_data_url(canvas)


def _visual(items: List[_Item]) -> bool:
    return any(it.kind in ("image", "draw") or it.is_math for it in items)


def parse_layout(doc) -> Dict[str, Any]:
    """
    → {"questions": {q_num: {...}}, "sections": [labels in order]}
    Each question: text, tag_text, statement_image, diagram, statement_is_image,
    options [{label, text, image}], answer_raw, section, section_kind, subject.
    """
    items = _collect(doc)
    spans = [it for it in items if it.kind == "span"]
    rows = _rows(spans)

    # question headers and banners as boundaries
    heads: List[Tuple[float, float, int]] = []      # (gy0, gy1, number)
    banners: List[Tuple[float, Optional[str], Optional[str], Optional[str]]] = []  # (gy0, subject, letter, kind)
    seen = set()
    for row in rows:
        txt = _row_text(row)
        x0 = row[0].rect.x0
        m = QHEAD_RE.match(row[0].text.strip()) or QHEAD_RE.match(txt)
        if m and (len(row[0].text.strip()) <= 14 or len(txt) <= 14) and int(m.group(1)) not in seen:
            seen.add(int(m.group(1)))
            hs = row[0]
            heads.append((hs.gy0, hs.gy1, int(m.group(1))))
            continue
        if len(txt) <= 140:
            bm = BANNER_RE.match(txt)
            if bm and (bm.group(1) or len(txt) <= 90):
                subj = SUBJECTS.get((bm.group(1) or "").upper())
                banners.append((min(s.gy0 for s in row), subj, bm.group(2).upper(), _section_kind(bm.group(3))))
                continue
            sm = SUBJECT_ONLY_RE.match(txt)
            if sm:
                banners.append((min(s.gy0 for s in row), SUBJECTS.get(sm.group(1).upper()), None, None))
    if len(heads) < 2:
        return {"questions": {}, "sections": []}

    boundaries = sorted([h[0] for h in heads] + [b[0] for b in banners])
    questions: Dict[int, Dict[str, Any]] = {}
    section_order: List[str] = []

    for gy0, gy1, num in heads:
        end = next((b for b in boundaries if b > gy0 + 1), float("inf"))
        # subject / section from the latest banner above
        subj = letter = kind = None
        for bgy, bsubj, bletter, bkind in banners:
            if bgy < gy0:
                if bsubj:
                    subj = bsubj
                    letter = kind = None
                if bletter:
                    letter, kind = bletter, bkind
            else:
                break
        section = None
        if subj and letter:
            section = f"{subj} – Section {letter}" + (f" ({kind})" if kind else "")
        elif letter:
            section = f"Section {letter}" + (f" ({kind})" if kind else "")
        if section and section not in section_order:
            section_order.append(section)

        body = [it for it in items if gy1 + 0.5 < it.gcy < end - 0.5]
        body_spans = [it for it in body if it.kind == "span"]
        brows = _rows(body_spans)

        # answer line
        answer_raw, answer_gy = None, None
        for row in brows:
            t = _row_text(row)
            am = ANSWER_RE.match(t)
            if am:
                answer_raw = am.group(1).strip()
                answer_gy = min(s.gy0 for s in row)
                break
        content_end = answer_gy if answer_gy is not None else end

        # option labels at the left of a row
        margin = min((r[0].rect.x0 for r in brows), default=0)
        labels: List[Tuple[_Item, str]] = []
        for row in brows:
            first = row[0]
            if first.gy0 >= content_end:
                break
            lm = LABEL_RE.match(first.text.strip())
            if lm and first.rect.x0 <= margin + 40:
                lab = lm.group(1).upper()
                lab = chr(ord("A") + int(lab) - 1) if lab.isdigit() else lab
                if not labels or ord(lab) == ord(labels[-1][1]) + 1:
                    if not labels and lab != "A":
                        continue
                    labels.append((first, lab))
        if len(labels) < 2:
            labels = []

        centers = [lab.gcy for lab, _ in labels]
        if labels:
            lab0 = labels[0][0]
            stmt_end = lab0.gy0 - 1
            # a fraction's numerator sits just above its "(a)" label: keep it with the option
            margin_rows = {id(s) for row in brows if row[0].rect.x0 < lab0.rect.x0 - 2 for s in row}
            above = [it for it in body if it.kind != "image" and id(it) not in margin_rows
                     and it.gcy < lab0.gy0 and it.gy0 >= lab0.gy0 - 14
                     and it.rect.x0 >= lab0.rect.x1 - 2 and it.rect.x1 <= lab0.rect.x1 + 220]
            if above:
                stmt_end = min(it.gy0 for it in above) - 0.5
        else:
            stmt_end = content_end

        stmt_items = [it for it in body if it.gcy < stmt_end and not (answer_gy is not None and it.gcy >= answer_gy)]
        stmt_spans = [it for it in stmt_items if it.kind == "span"]
        stmt_text = _text_of(stmt_spans)
        has_math_or_table = any(it.is_math or it.kind == "draw" for it in stmt_items)
        has_pictures = any(it.kind == "image" for it in stmt_items)

        statement_image = diagram = None
        if has_math_or_table:
            statement_image = _crop(doc, items, gy1 + 0.5, stmt_end)
        elif has_pictures:
            pics = [it for it in stmt_items if it.kind == "image"]
            diagram = _crop(doc, items, min(p.gy0 for p in pics), max(p.gy1 for p in pics), pad=2)
            # cropping the picture area keeps labels drawn around the image too

        options = []
        for i, (lab_item, lab) in enumerate(labels):
            top = stmt_end if i == 0 else (centers[i - 1] + centers[i]) / 2
            bottom = content_end if i == len(labels) - 1 else (centers[i] + centers[i + 1]) / 2
            if i == len(labels) - 1 and len(centers) > 1:
                bottom = min(bottom, centers[i] + max(14.0, (centers[i] - centers[i - 1]) / 2 + 2))
            o_items = [it for it in body if top <= it.gcy < bottom and it is not lab_item and it.rect.x0 >= lab_item.rect.x1 - 2]
            o_spans = [it for it in o_items if it.kind == "span"]
            # same-span label + text, e.g. "(a) A and B only"
            head_txt = LABEL_RE.sub("", lab_item.text.strip(), count=1).strip()
            o_text = ((head_txt + " ") if head_txt else "") + _text_of(o_spans)
            o_text = o_text.strip()
            image = None
            if _visual(o_items):
                image = _crop(doc, o_items, top, bottom, pad=2)
            options.append({"label": lab, "text": "" if image else o_text, "image": image, "tag_text": o_text})

        tag_text = "\n".join([stmt_text] + [o["tag_text"] for o in options if o["tag_text"]]).strip()
        questions[num] = {
            "text": "" if statement_image else stmt_text,
            "tag_text": tag_text or stmt_text,
            "statement_image": statement_image,
            "statement_is_image": bool(statement_image),
            "diagram": diagram,
            "options": [{"label": o["label"], "text": o["text"], "image": o["image"]} for o in options],
            "answer_raw": answer_raw,
            "section": section,
            "section_kind": kind,
            "subject": subj,
            "raw_text": stmt_text + "\n" + "\n".join(f"({o['label'].lower()}) {o['tag_text']}" for o in options),
        }
    return {"questions": questions, "sections": section_order}
