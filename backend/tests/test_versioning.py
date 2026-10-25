"""API versioning: legacy /api/* and canonical /api/v1/* twins."""
import io

from pypdf import PdfWriter


def _pdf_file():
    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    return {"file": ("doc.pdf", buf.getvalue(), "application/pdf")}


def test_merge_legacy_and_v1_parity(client):
    """POST /api/merge and /api/v1/merge return identical PDF bytes."""
    from pypdf import PdfReader

    def _two_files():
        return [
            ("files", ("doc1.pdf", _pdf_bytes(1), "application/pdf")),
            ("files", ("doc2.pdf", _pdf_bytes(2), "application/pdf")),
        ]

    legacy = client.post("/api/merge", files=_two_files())
    versioned = client.post("/api/v1/merge", files=_two_files())
    assert legacy.status_code == 200
    assert versioned.status_code == 200
    assert versioned.content == legacy.content
    assert len(PdfReader(io.BytesIO(versioned.content)).pages) == 3


def _pdf_bytes(pages: int = 1) -> bytes:
    buf = io.BytesIO()
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    return buf.getvalue()


def test_pdf_info_v1_matches_legacy(client):
    """POST /api/v1/pdf-info returns the same JSON as legacy."""
    legacy = client.post("/api/pdf-info", files=_pdf_file())
    versioned = client.post("/api/v1/pdf-info", files=_pdf_file())
    assert legacy.status_code == 200
    assert versioned.status_code == 200
    assert versioned.json() == legacy.json() == {"num_pages": 1}


def test_pdf_info_v1_rejects_non_pdf_like_legacy(client):
    """POST /api/v1/pdf-info with .txt returns 400 same message as legacy."""
    files = {"file": ("test.txt", b"plain text data", "text/plain")}
    legacy = client.post("/api/pdf-info", files=files)
    versioned = client.post("/api/v1/pdf-info", files=files)
    assert legacy.status_code == 400
    assert versioned.status_code == 400
    assert versioned.json() == legacy.json()
    assert versioned.json()["detail"] == "Only PDF files are supported."


def test_health_stays_unversioned(client):
    """GET /health stays open at the root; no /api/v1/health twin."""
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/health").status_code == 404
