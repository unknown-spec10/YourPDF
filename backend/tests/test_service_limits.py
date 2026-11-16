"""Tests for the hosted-service limits: total upload size and render budget.

These are properties of the deployed service rather than of any single tool, so they are
tested both directly and through the endpoints that must enforce them.

Deliberately cheap: the caps are checked *before* any native tool runs, so these tests need
neither Poppler nor LibreOffice. Uploads that must be rejected never need to be valid files.
"""

from __future__ import annotations

from io import BytesIO

import pytest
from fastapi import UploadFile

from app.config import settings
from app.limits import (
    RenderBudgetExceeded,
    UploadTooLarge,
    validate_render_budget,
    validate_total_size,
)
from app.tasks.pdf import pdf_to_images_task


def make_pdf(pages: int) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    for page in range(1, pages + 1):
        c.setFont("Helvetica", 12)
        c.drawString(72, 720, f"page {page}")
        c.showPage()
    c.save()
    return buf.getvalue()


def make_png() -> bytes:
    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (64, 64), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def upload(payload: bytes, name: str = "a.bin") -> UploadFile:
    """An UploadFile over an in-memory buffer, enough for the size checks."""
    return UploadFile(file=BytesIO(payload), filename=name)


# --- aggregate upload cap -------------------------------------------------------------


def test_validate_total_size_rejects_over_limit():
    files = [upload(b"x" * (11 * 1024 * 1024), f"{i}.pdf") for i in range(3)]

    with pytest.raises(UploadTooLarge) as excinfo:
        validate_total_size(files, max_size_mb=30)

    assert excinfo.value.http_status == 413
    assert "30 MB" in str(excinfo.value)


def test_validate_total_size_allows_under_limit():
    files = [upload(b"x" * (10 * 1024 * 1024), f"{i}.pdf") for i in range(2)]

    validate_total_size(files, max_size_mb=30)  # must not raise


def test_validate_total_size_zero_disables_the_cap():
    files = [upload(b"x" * (40 * 1024 * 1024), "a.pdf")]

    validate_total_size(files, max_size_mb=0)  # must not raise


def test_merge_endpoint_enforces_total_cap(client, monkeypatch):
    """The router must call the check, not just define it."""
    monkeypatch.setattr(settings, "max_total_upload_mb", 1)
    # Rejected before the file is ever parsed, so the bytes need not be a real PDF.
    payload = b"x" * (700 * 1024)

    response = client.post(
        "/api/v1/merge",
        files=[
            ("files", ("a.pdf", payload, "application/pdf")),
            ("files", ("b.pdf", payload, "application/pdf")),
        ],
    )

    assert response.status_code == 413
    assert "over the 1 MB limit" in response.json()["detail"]


def test_merge_endpoint_accepts_under_cap(client):
    """A small merge still works and is not blocked by the new check."""
    pdf = make_pdf(2)

    response = client.post(
        "/api/v1/merge",
        files=[
            ("files", ("a.pdf", pdf, "application/pdf")),
            ("files", ("b.pdf", pdf, "application/pdf")),
        ],
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"


# --- render budget --------------------------------------------------------------------


def test_render_budget_rejects_whole_document(client, monkeypatch):
    monkeypatch.setattr(settings, "max_render_pages", 100)
    pdf = make_pdf(150)

    response = client.post(
        "/api/v1/pdf-to-images",
        files={"file": ("big.pdf", pdf, "application/pdf")},
        data={"format": "png", "dpi": "100", "pages": "all"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "150" in detail and "100" in detail


def test_render_budget_counts_the_selection_not_the_document(tmp_path, monkeypatch):
    """Rendering 2 pages of a 10-page file is judged on those 2 pages, not on the document."""
    monkeypatch.setattr(settings, "max_render_pages", 1)
    path = tmp_path / "ten.pdf"
    path.write_bytes(make_pdf(10))

    # The budget rejects the 2-page selection before Poppler is ever invoked, so this test
    # needs no native tooling.
    with pytest.raises(RenderBudgetExceeded) as excinfo:
        pdf_to_images_task(str(path), "png", 100, pages="1-2")

    assert "2 pages" in str(excinfo.value) and "1" in str(excinfo.value)
    # The task deletes the upload it was given even when it rejects the job — that is the
    # existing cleanup contract, and it is why a rejected request leaves no debris behind.
    assert not path.exists()


def test_render_budget_function_boundaries():
    validate_render_budget(100, "pages")  # at the limit is fine

    with pytest.raises(RenderBudgetExceeded) as excinfo:
        validate_render_budget(101, "slides")

    assert excinfo.value.http_status == 400
    assert "slides" in str(excinfo.value)


def test_render_budget_zero_disables_it(monkeypatch):
    monkeypatch.setattr(settings, "max_render_pages", 0)

    validate_render_budget(10_000, "pages")  # must not raise


# --- dpi guard -----------------------------------------------------------------------


def test_dpi_outside_the_supported_range_is_rejected(client):
    """One A4 page at 2400 DPI is ~1 GB of pixels: a one-request OOM without this check."""
    pdf = make_pdf(1)
    files = {"file": ("a.pdf", pdf, "application/pdf")}

    too_high = client.post(
        "/api/v1/pdf-to-images", files=files, data={"format": "png", "dpi": "2400", "pages": "1"}
    )
    too_low = client.post(
        "/api/v1/pdf-to-images", files=files, data={"format": "png", "dpi": "1", "pages": "1"}
    )

    assert too_high.status_code == 400
    assert "72" in too_high.json()["detail"] and "300" in too_high.json()["detail"]
    assert too_low.status_code == 400


def test_dpi_inside_the_range_is_accepted():
    from app.validation import validate_dpi

    assert validate_dpi(72) == 72
    assert validate_dpi(300) == 300


# --- streaming responses --------------------------------------------------------------


def test_file_responses_are_streamed_not_length_delimited(client):
    """A chunked body is what lets a download exceed the host's 32 MiB response cap."""
    response = client.post(
        "/api/v1/images-to-pdf",
        files={"files": ("a.png", make_png(), "image/png")},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "content-length" not in response.headers
