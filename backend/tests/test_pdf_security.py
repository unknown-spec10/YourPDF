"""Golden roundtrip tests for PDF password protection.

Real pypdf-generated PDFs, no mocks of the units under test,
no network, no Redis.
"""

import io

import pytest
from pypdf import PdfReader, PdfWriter

from app.pdf_security import protect_pdf_bytes, unlock_pdf_bytes


def _make_pdf_bytes(pages: int = 2) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_protect_then_unlock_returns_original_page_count():
    raw = _make_pdf_bytes(pages=2)
    protected = protect_pdf_bytes(raw, "s3cr3t")
    assert PdfReader(io.BytesIO(protected)).is_encrypted
    unlocked = unlock_pdf_bytes(protected, "s3cr3t")
    assert len(PdfReader(io.BytesIO(unlocked)).pages) == 2


def test_unlock_with_wrong_password_raises():
    protected = protect_pdf_bytes(_make_pdf_bytes(), "correct-horse")
    with pytest.raises(ValueError, match="Incorrect password"):
        unlock_pdf_bytes(protected, "wrong-password")


def test_empty_password_rejected_by_protect_and_unlock():
    raw = _make_pdf_bytes(pages=1)
    with pytest.raises(ValueError, match="Password is required"):
        protect_pdf_bytes(raw, "")
    protected = protect_pdf_bytes(raw, "non-empty")
    with pytest.raises(ValueError, match="Password is required"):
        unlock_pdf_bytes(protected, "")


def test_tampered_bytes_raise():
    protected = protect_pdf_bytes(_make_pdf_bytes(), "s3cr3t")
    with pytest.raises(Exception):
        unlock_pdf_bytes(protected[: len(protected) // 2], "s3cr3t")
