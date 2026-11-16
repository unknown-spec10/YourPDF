"""PDF-to-Word tests: digital PDFs, scans, existing OCR layers, mixed and unreadable scans."""
import importlib.util
import io
import os
import shutil
import sys

import pytest


def _has_ocr_tools() -> bool:
    return shutil.which("tesseract") is not None and importlib.util.find_spec("ocrmypdf") is not None


requires_ocr = pytest.mark.skipif(
    not _has_ocr_tools(), reason="tesseract and/or ocrmypdf are not installed"
)


@pytest.fixture(autouse=True)
def _ocrmypdf_script_on_path(monkeypatch):
    """venv console scripts are not on PATH when pytest is run as ``python -m pytest``."""
    scripts = os.path.dirname(sys.executable)
    monkeypatch.setenv("PATH", scripts + os.pathsep + os.environ.get("PATH", ""))


def _make_digital_pdf(text: str = "Digital report content for PDF to Word 2026") -> bytes:
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(612, 792))
    c.setFont("Helvetica", 18)
    c.drawString(72, 700, text)
    c.showPage()
    c.save()
    return buf.getvalue()


def _make_blank_pdf() -> bytes:
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(612, 792))
    c.showPage()
    c.save()
    return buf.getvalue()


def _make_scan_pdf(text: str = "Scanned page hello world 2026") -> bytes:
    """Rasterize a text PDF into an image-only PDF (no text layer)."""
    import fitz

    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(612, 792))
    c.setFont("Helvetica", 24)
    c.drawString(72, 700, text)
    c.showPage()
    c.save()

    source = fitz.open(stream=buf.getvalue(), filetype="pdf")
    pixmap = source[0].get_pixmap(dpi=200)
    source.close()

    scan = fitz.open()
    page = scan.new_page(width=612, height=792)
    page.insert_image(page.rect, stream=pixmap.tobytes("png"))
    data = scan.tobytes()
    scan.close()
    return data


def _make_mixed_pdf(text: str = "Digital page text") -> bytes:
    """One page with a real text layer plus one image-only page (no OCR layer)."""
    import fitz

    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(612, 792))
    c.setFont("Helvetica", 24)
    c.drawString(72, 700, text)
    c.showPage()
    c.save()

    source = fitz.open(stream=buf.getvalue(), filetype="pdf")
    pixmap = source[0].get_pixmap(dpi=150)
    source.close()

    mixed = fitz.open()
    digital = mixed.new_page(width=612, height=792)
    digital.insert_text((72, 700), text, fontsize=24)
    scanned = mixed.new_page(width=612, height=792)
    scanned.insert_image(scanned.rect, stream=pixmap.tobytes("png"))
    data = mixed.tobytes()
    mixed.close()
    return data


def _docx_text(data: bytes) -> str:
    from docx import Document

    return "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)


def _post(client, pdf_bytes: bytes, name: str = "doc.pdf"):
    return client.post(
        "/api/pdf-to-docx",
        files={"file": (name, pdf_bytes, "application/pdf")},
    )


def test_docx_has_text_counts_table_content(tmp_path):
    from docx import Document

    from app.tasks.pdf import _docx_has_text

    table_doc = Document()
    table = table_doc.add_table(rows=1, cols=1)
    table.cell(0, 0).text = "Table-only content"
    table_path = tmp_path / "table_only.docx"
    table_doc.save(str(table_path))
    assert _docx_has_text(str(table_path)) is True

    empty_doc = Document()
    empty_doc.add_paragraph()
    empty_path = tmp_path / "empty.docx"
    empty_doc.save(str(empty_path))
    assert _docx_has_text(str(empty_path)) is False


def test_missing_ocr_tool_returns_friendly_500(client, monkeypatch):
    from app.tasks.pdf import ocr as ocr_tasks

    def _raise_missing(*args, **kwargs):
        raise FileNotFoundError(2, "The system cannot find the file specified")

    monkeypatch.setattr(ocr_tasks, "_run_ocrmypdf", _raise_missing)

    response = _post(client, _make_scan_pdf(), name="scan.pdf")

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "OCR is required to convert this scanned PDF, but the OCR tool could not be "
        "started on this machine."
    )


def test_digital_pdf_uses_text_layer(client):
    response = _post(client, _make_digital_pdf())

    assert response.status_code == 200
    text = _docx_text(response.content)
    assert len(text) > 0
    assert response.headers["x-ocr-applied"] == "0"
    assert "x-job-notice" not in response.headers


@requires_ocr
def test_existing_ocr_layer_is_reused(client, tmp_path):
    from app.tasks.pdf import _run_ocrmypdf

    scan_path = tmp_path / "scan.pdf"
    ocr_path = tmp_path / "scan_ocr.pdf"
    scan_path.write_bytes(_make_scan_pdf())
    _run_ocrmypdf(str(scan_path), str(ocr_path))

    response = _post(client, ocr_path.read_bytes(), name="scan_ocr.pdf")

    assert response.status_code == 200
    text = _docx_text(response.content)
    assert len(text) > 0
    assert response.headers["x-ocr-applied"] == "0"


@requires_ocr
def test_raw_scan_is_ocred_automatically(client):
    response = _post(client, _make_scan_pdf(), name="scan.pdf")

    assert response.status_code == 200
    text = _docx_text(response.content)
    assert len(text) > 0
    assert response.headers["x-ocr-applied"] == "1"
    assert response.headers["x-job-notice"]


@requires_ocr
def test_blank_scan_returns_422(client):
    response = _post(client, _make_blank_pdf(), name="blank.pdf")

    assert response.status_code == 422
    assert "could not read any text" in response.json()["detail"]
    assert not response.content.startswith(b"PK")


def test_pdf_text_layout_classifies_digital_scan_and_mixed(tmp_path):
    from app.tasks.pdf import _pdf_text_layout

    digital = tmp_path / "digital.pdf"
    digital.write_bytes(_make_digital_pdf())
    blank = tmp_path / "blank.pdf"
    blank.write_bytes(_make_blank_pdf())
    mixed = tmp_path / "mixed.pdf"
    mixed.write_bytes(_make_mixed_pdf())

    assert _pdf_text_layout(str(digital)) == "digital"
    assert _pdf_text_layout(str(blank)) == "scan"
    assert _pdf_text_layout(str(mixed)) == "mixed"


@requires_ocr
def test_pdf_text_layout_detects_existing_ocr_layer(tmp_path):
    from app.tasks.pdf import _pdf_text_layout, _run_ocrmypdf

    scan_path = tmp_path / "scan.pdf"
    scan_path.write_bytes(_make_scan_pdf())
    ocr_path = tmp_path / "scan_ocr.pdf"
    _run_ocrmypdf(str(scan_path), str(ocr_path))

    # OCR output carries the recognised text as an invisible layer, not visible text.
    assert _pdf_text_layout(str(ocr_path)) == "ocr"


def test_mixed_pdf_keeps_scanned_pages_as_images(client):
    """The mixed branch converts without OCR and tells the user what happened."""
    response = _post(client, _make_mixed_pdf(), name="mixed.pdf")

    assert response.status_code == 200
    assert response.headers["x-ocr-applied"] == "0"
    notice = response.headers.get("x-job-notice", "")
    assert "page images" in notice
    assert "Digital page text" in _docx_text(response.content)
