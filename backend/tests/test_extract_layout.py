"""Layout-preserving text extraction tests.

Builds a small reportlab PDF (Helvetica, multiple drawString runs per
visual line plus a two-column block) and asserts layout-mode extraction
keeps each visual line's runs together on one output line.
"""
import io
import os
import uuid

from app.tasks.common import ensure_tmp_dir
from app.tasks.pdf_tasks import extract_text_task


def _make_layout_pdf_bytes() -> bytes:
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(612, 792))
    c.setFont("Helvetica", 10)

    # One visual row built from four positioned runs (table-like).
    y = 700
    c.drawString(50, y, "Widget Pro")
    c.drawString(250, y, "3")
    c.drawString(350, y, "29.99")
    c.drawString(450, y, "89.97")

    # Two-column block: left and right fragments share baselines.
    y2 = 600
    c.drawString(50, y2, "The quick brown fox jumps")
    c.drawString(330, y2, "Failure modes include:")
    c.drawString(50, y2 - 15, "over the lazy dog again")
    c.drawString(330, y2 - 15, "power loss and corrosion")
    c.save()
    return buf.getvalue()


def _run_task(pdf_bytes: bytes, export_txt: bool):
    tmp_dir = ensure_tmp_dir()
    path = os.path.join(tmp_dir, f"test_layout_{uuid.uuid4()}.pdf")
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return extract_text_task(path, export_txt, original_filename="layout.pdf")


def test_runs_stay_on_one_line():
    text, name = _run_task(_make_layout_pdf_bytes(), False)
    assert name is None
    lines = text.splitlines()
    widget_lines = [ln for ln in lines if "Widget Pro" in ln]
    assert widget_lines, f"expected a line with 'Widget Pro', got:\n{text}"
    assert any("29.99" in ln for ln in widget_lines), (
        f"runs split across lines:\n{text}"
    )
    assert any("89.97" in ln for ln in widget_lines)


def test_two_columns_stay_side_by_side():
    text, _ = _run_task(_make_layout_pdf_bytes(), False)
    lines = text.splitlines()
    fox_lines = [ln for ln in lines if "The quick brown fox jumps" in ln]
    assert fox_lines, f"expected left-column line, got:\n{text}"
    assert any("Failure modes include:" in ln for ln in fox_lines), (
        f"columns interleaved instead of side by side:\n{text}"
    )


def test_export_txt_returns_same_content():
    data, name = _run_task(_make_layout_pdf_bytes(), True)
    assert isinstance(data, bytes)
    assert name.endswith(".txt")
    assert b"Widget Pro" in data
    assert b"29.99" in data
    assert b"The quick brown fox jumps" in data
    assert b"Failure modes include:" in data
