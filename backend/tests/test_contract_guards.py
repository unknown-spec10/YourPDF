"""Contract guards found by the corpus runner.

Each of these used to answer 200 with something wrong (or 500), which is worse than refusing:
a caller cannot tell "done" from "did nothing".

The corpus runner (`web/tests/corpus_check.py`) found them against real files; these tests keep
them fixed without needing a live server.
"""

from __future__ import annotations

import io

import pytest
from pypdf import PdfReader, PdfWriter

from app.tasks.pdf.ocr import _ocr_user_message


def _pdf_bytes(pages: int = 1) -> bytes:
    """A minimal but genuinely readable PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    doc = canvas.Canvas(buffer, pagesize=A4)
    for index in range(1, pages + 1):
        doc.setFont("Helvetica", 12)
        doc.drawString(72, 720, f"page {index}")
        doc.showPage()
    doc.save()
    return buffer.getvalue()


def _encrypted_pdf_bytes(password: str = "secret") -> bytes:
    reader = PdfReader(io.BytesIO(_pdf_bytes(2)))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(password)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _file(name: str = "doc.pdf", data: bytes | None = None) -> dict:
    return {"file": (name, data if data is not None else _pdf_bytes(), "application/pdf")}


# --- split: an unknown mode is a client error, not an empty document -------------------------


# An empty `mode` is not in this list on purpose: multipart drops empty fields, so the
# endpoint falls back to its default "custom" rather than seeing an invalid value.
@pytest.mark.parametrize("mode", ["every", "bogus", "ALL-PAGES", "customised"])
def test_split_rejects_unknown_mode(client, mode):
    """`mode=every` used to return 200 with a 0-page PDF, which looks like success."""
    response = client.post("/api/split", files=_file(), data={"mode": mode, "pages_spec": "1"})

    assert response.status_code == 400
    assert "custom" in response.json()["detail"].lower()


def test_split_still_accepts_the_two_documented_modes(client):
    custom = client.post("/api/split", files=_file(), data={"mode": "custom", "pages_spec": "1"})
    every = client.post("/api/split", files=_file(data=_pdf_bytes(3)), data={"mode": "all"})

    assert custom.status_code == 200
    assert len(PdfReader(io.BytesIO(custom.content)).pages) == 1
    assert every.status_code == 200


# --- unlock: an unprotected PDF is not a successful unlock ----------------------------------


def test_unlock_refuses_pdf_that_is_not_protected(client):
    """It used to hand the file back unchanged, so the UI reported success and changed nothing."""
    response = client.post("/api/unlock", files=_file(), data={"password": "anything"})

    assert response.status_code == 400
    assert "not password-protected" in response.json()["detail"].lower()


def test_unlock_round_trips_a_real_password(client):
    protected = client.post("/api/protect", files=_file(), data={"password": "corpus-test-123"})
    assert protected.status_code == 200

    unlocked = client.post(
        "/api/unlock",
        files={"file": ("locked.pdf", protected.content, "application/pdf")},
        data={"password": "corpus-test-123"},
    )

    assert unlocked.status_code == 200
    assert len(PdfReader(io.BytesIO(unlocked.content)).pages) == 1


# --- watermark: a locked input is a 400 with an instruction, not a 500 ----------------------


def test_watermark_on_encrypted_pdf_is_a_clear_400(client):
    """pypdf raised deep inside page access, surfacing as an opaque 500."""
    response = client.post(
        "/api/watermark",
        files=_file("locked.pdf", _encrypted_pdf_bytes()),
        data={"text": "CONFIDENTIAL", "pages": "all"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"].lower()
    assert "password-protected" in detail
    assert "unlock" in detail


# --- OCR: refusals the user can act on are 400s with the real reason, not opaque 500s ---------


def test_signed_pdf_is_classified_from_ocrmypdf_stderr():
    """Verbatim from a real run against a digitally signed certificate."""
    raw = (
        "DigitalSignatureError: Input PDF has a digital signature. OCR would alter the document,\n"
        "invalidating the signature."
    )
    message = _ocr_user_message(raw)

    assert message is not None
    assert "digitally signed" in message
    assert "signature" in message


def test_encrypted_pdf_is_classified():
    raw = "EncryptedPdfError: Input PDF is encrypted. The encryption must be removed with --password."
    assert "password-protected" in (_ocr_user_message(raw) or "")


def test_unknown_ocr_failure_has_no_user_message():
    assert _ocr_user_message("Segmentation fault (core dumped)") is None


# --- signed PDFs: warn instead of silently invalidating the signature ------------------------


def _signed_pdf_bytes() -> bytes:
    """A PDF carrying a signature flag, which is what the detector keys on."""
    from pypdf.generic import DictionaryObject, NameObject, NumberObject

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    acroform = DictionaryObject({NameObject("/SigFlags"): NumberObject(3)})
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_detects_a_signed_pdf():
    from app.pdf_signatures import has_digital_signature_bytes

    assert has_digital_signature_bytes(_signed_pdf_bytes()) is True
    assert has_digital_signature_bytes(_pdf_bytes()) is False


def test_compress_warns_when_it_invalidates_a_signature(client):
    """The page count still comes back, but the client is told the signature is gone."""
    response = client.post(
        "/api/compress",
        files={"file": ("signed.pdf", _signed_pdf_bytes(), "application/pdf")},
        data={"quality": "medium"},
    )

    assert response.status_code == 200
    assert "signed" in response.headers.get("x-job-notice", "").lower()


def test_unsigned_pdf_gets_no_warning(client):
    response = client.post(
        "/api/compress", files=_file(), data={"quality": "medium"}
    )

    assert response.status_code == 200
    assert "x-job-notice" not in response.headers


def test_notice_is_header_safe():
    """HTTP headers are latin-1; a stray em dash turned the whole response into a 500."""
    from app.pdf_signatures import NOTICE

    assert NOTICE.encode("latin-1")  # raises UnicodeEncodeError otherwise
