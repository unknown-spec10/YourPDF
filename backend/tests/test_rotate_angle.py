"""Arbitrary-angle PDF rotation tests.

Fast path (multiple of 90) keeps the /Rotate behavior; any other angle
rotates content onto a resized page whose box follows the corner math.
Endpoint validation (0 and >360 rejected) is covered via the test client.
"""
import io
import math
import os
import uuid

import pytest
from pypdf import PdfReader, PdfWriter

from app.tasks.common import ensure_tmp_dir
from app.tasks.pdf_tasks import rotate_pdf_task


def _expected_box(w: float, h: float, theta: float) -> tuple[float, float]:
    rad = math.radians(theta)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    xs = [x * cos_a + y * sin_a for x, y in ((0, 0), (w, 0), (w, h), (0, h))]
    ys = [-x * sin_a + y * cos_a for x, y in ((0, 0), (w, 0), (w, h), (0, h))]
    return round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3)


def _make_content_pdf(w: float = 612, h: float = 792) -> bytes:
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setFont("Helvetica", 12)
    c.drawString(50, h - 50, "Hello rotation content")
    c.drawString(50, h - 70, "Second line of content for extraction checks.")
    c.save()
    return buf.getvalue()


def _run_task(pdf_bytes: bytes, rotation: float):
    tmp_dir = ensure_tmp_dir()
    path = os.path.join(tmp_dir, f"test_rotate_{uuid.uuid4()}.pdf")
    with open(path, "wb") as f:
        f.write(pdf_bytes)
    return rotate_pdf_task(path, rotation, original_filename="doc.pdf")


def _page_dims(page) -> tuple[float, float]:
    box = page.mediabox
    return float(box.width), float(box.height)


@pytest.mark.parametrize("angle", [90, 90.0, 180, 270])
def test_multiples_of_90_use_fast_path(angle):
    data, name = _run_task(_make_content_pdf(200, 300), angle)
    assert "doc_rotated" in name
    page = PdfReader(io.BytesIO(data)).pages[0]
    assert page.rotation == angle
    # Raw box untouched (transform path would have resized it to 300x200).
    w, h = _page_dims(page)
    assert (w, h) == pytest.approx((200, 300))


def test_37_degree_box_math_and_content():
    data, _ = _run_task(_make_content_pdf(), 37)
    page = PdfReader(io.BytesIO(data)).pages[0]
    exp_w, exp_h = _expected_box(612, 792, 37)
    w, h = _page_dims(page)
    assert w == pytest.approx(exp_w, abs=0.5)
    assert h == pytest.approx(exp_h, abs=0.5)
    assert page.rotation == 0
    assert (page.extract_text() or "").strip() != ""


def test_12_5_degrees_works():
    data, _ = _run_task(_make_content_pdf(), 12.5)
    page = PdfReader(io.BytesIO(data)).pages[0]
    exp_w, exp_h = _expected_box(612, 792, 12.5)
    w, h = _page_dims(page)
    assert w == pytest.approx(exp_w, abs=0.5)
    assert h == pytest.approx(exp_h, abs=0.5)


def test_negative_45_matches_315():
    page_neg = PdfReader(io.BytesIO(_run_task(_make_content_pdf(), -45)[0])).pages[0]
    page_pos = PdfReader(io.BytesIO(_run_task(_make_content_pdf(), 315)[0])).pages[0]
    wn, hn = _page_dims(page_neg)
    wp, hp = _page_dims(page_pos)
    assert wn == pytest.approx(wp, abs=0.01)
    assert hn == pytest.approx(hp, abs=0.01)


def test_prerotated_page_folds_existing_rotation():
    reader = PdfReader(io.BytesIO(_make_content_pdf()))
    writer = PdfWriter()
    page = reader.pages[0]
    page.rotate(90)
    writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)

    data, _ = _run_task(buf.getvalue(), 45)
    out = PdfReader(io.BytesIO(data)).pages[0]
    exp_w, exp_h = _expected_box(612, 792, 135)
    w, h = _page_dims(out)
    assert w == pytest.approx(exp_w, abs=0.5)
    assert h == pytest.approx(exp_h, abs=0.5)
    assert out.rotation == 0


def _pdf_file(name: str = "doc.pdf") -> dict:
    return {"file": (name, _make_content_pdf(200, 300), "application/pdf")}


def test_endpoint_zero_rejected(client):
    response = client.post("/api/rotate", files=_pdf_file(), data={"rotation": "0"})
    assert response.status_code == 400
    assert "non-zero" in response.json()["detail"]


def test_endpoint_405_rejected(client):
    response = client.post("/api/rotate", files=_pdf_file(), data={"rotation": "405"})
    assert response.status_code == 400


def test_endpoint_arbitrary_angle_roundtrip(client):
    response = client.post("/api/rotate", files=_pdf_file(), data={"rotation": "37"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 1
