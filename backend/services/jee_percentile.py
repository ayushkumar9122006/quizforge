"""
Estimated JEE Main percentile from marks out of 300.

ESTIMATE ONLY. Interpolates published JEE Main 2025 marks-vs-percentile analyses:
  • 100–300 marks: careers360 "JEE Main 2025 Marks vs Percentile vs Rank"
  • 0–100 marks:   Physics Wallah "JEE Main Marks vs Percentile 2025" (labelled expected)
The real percentile depends on the difficulty of the student's shift and on the
year, so the UI always shows this as "≈ estimate".
"""
from __future__ import annotations

SOURCE_NOTE = (
    "Estimate from published JEE Main 2025 marks-vs-percentile analyses (careers360, Physics Wallah). "
    "Actual percentile varies by shift and year."
)

# (marks out of 300, percentile) — monotonic anchor points
_POINTS: list[tuple[float, float]] = [
    (0, 0.0), (10, 9.70), (20, 33.23), (30, 56.57), (40, 71.30), (50, 80.98),
    (60, 86.91), (70, 90.70), (80, 93.15), (90, 94.75), (100, 96.06), (119, 96.98),
    (140, 98.73), (160, 99.24), (180, 99.57), (200, 99.78), (222, 99.90), (240, 99.956),
    (259, 99.989), (270, 99.9947), (286, 99.9974), (300, 100.0),
]


def estimate_percentile(marks_out_of_300: float | None) -> float | None:
    if marks_out_of_300 is None:
        return None
    m = max(0.0, min(300.0, float(marks_out_of_300)))
    for (x0, y0), (x1, y1) in zip(_POINTS, _POINTS[1:]):
        if m <= x1:
            return round(y0 + (y1 - y0) * (m - x0) / (x1 - x0), 2)
    return 100.0


def marks_for_percentile(percentile: float) -> float:
    """Approximate marks (out of 300) needed for a percentile — used for target hints."""
    p = max(0.0, min(100.0, float(percentile)))
    for (x0, y0), (x1, y1) in zip(_POINTS, _POINTS[1:]):
        if p <= y1:
            return round(x0 + (x1 - x0) * ((p - y0) / (y1 - y0) if y1 > y0 else 0), 1)
    return 300.0


def scale_to_300(score: float, total: float) -> float | None:
    if not total:
        return None
    return round(max(-75.0, float(score)) / float(total) * 300.0, 1)
