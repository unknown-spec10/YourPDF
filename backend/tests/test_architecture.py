"""Architecture guards: cheap source-level tests for invariants the types cannot express.

These exist because three separate bugs shipped from the same root cause — a rule that all
three routers were supposed to follow, enforced only by memory:

- the image router was not streaming, so large downloads hit the 32 MiB cap;
- `/sign` was the only multi-file endpoint without the aggregate cap;
- limits were copy-pasted into 23 call sites and drifted.

Each test below fails on the *shape of the code*, not on a behavioural sample, so the next
router or endpoint cannot quietly opt out.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.http_io import MEDIA_TYPES, file_response
from app.main import app as client_app

BACKEND = Path(__file__).resolve().parents[1]
APP = BACKEND / "app"
ROUTERS = sorted((APP / "routers").glob("*.py"))
ROUTER_SOURCES = {path.name: path.read_text(encoding="utf-8") for path in ROUTERS}


def _png() -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (16, 16), (10, 90, 200)).save(buf, format="PNG")
    return buf.getvalue()


def _pdf() -> bytes:
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawString(72, 720, "architecture guard")
    c.showPage()
    c.save()
    return buf.getvalue()


def _docx() -> bytes:
    from io import BytesIO

    from docx import Document

    buf = BytesIO()
    doc = Document()
    doc.add_paragraph("architecture guard")
    doc.save(buf)
    return buf.getvalue()


# --- every unary file response is streamed ---------------------------------------------


@pytest.mark.parametrize(
    ("endpoint", "files", "data"),
    [
        ("/api/v1/extract-text", {"file": ("a.pdf", _pdf(), "application/pdf")}, {"export_txt": "true"}),
        ("/api/v1/image/convert", {"file": ("a.png", _png(), "image/png")}, {"target_format": "webp"}),
    ],
)
def test_file_responses_are_streamed(client, endpoint, files, data):
    """Chunked framing is what lets a result exceed the host's 32 MiB response cap.

    One endpoint per router generation: the image router was the one that regressed, and the
    previous test only covered the PDF router.
    """
    response = client.post(endpoint, files=files, data=data)

    assert response.status_code == 200, response.text
    assert "content-length" not in response.headers, endpoint
    assert response.content


def test_no_router_builds_a_length_delimited_response():
    """Source-level: a new endpoint cannot reintroduce `Response(content=...)` for a file."""
    offenders = [
        name
        for name, source in ROUTER_SOURCES.items()
        if re.search(r"Response\(\s*content=", source)
    ]
    assert not offenders, f"routers returning a length-delimited response: {offenders}"


def test_file_response_helper_streams():
    response = file_response(b"payload", "out.pdf")

    assert "content-length" not in dict(response.headers)
    assert response.media_type == "application/pdf"


# --- the media table covers everything a router can emit -------------------------------


def test_media_types_cover_every_output_extension():
    """A missing entry silently becomes application/octet-stream on a real download."""
    expected = {
        ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff",
        ".gif", ".svg", ".txt", ".zip", ".docx", ".pptx",
    }
    assert expected <= set(MEDIA_TYPES)


# --- the aggregate cap is on every multi-file endpoint ---------------------------------


def test_every_multi_file_endpoint_checks_the_aggregate_size():
    """`/sign` was missed once: two files in one body, only per-file checks."""
    pdf_source = ROUTER_SOURCES["pdf.py"]
    office_source = ROUTER_SOURCES["office.py"]

    # merge, images-to-pdf, sign
    assert pdf_source.count("validate_total_size(") == 3
    # merge-docx, merge-pptx
    assert office_source.count("validate_total_size(") == 2


# --- tasks stay out of the HTTP layer --------------------------------------------------


def test_tasks_do_not_import_the_web_framework():
    """Tasks raise domain errors; `main.py` maps them to responses once.

    This is what keeps the processing layer testable without HTTP and lets the render budget be
    enforced after a DOCX is paginated.
    """
    offenders: list[str] = []
    for path in sorted((APP / "tasks").glob("*.py")):
        source = path.read_text(encoding="utf-8")
        if re.search(r"^\s*(from|import)\s+fastapi", source, re.MULTILINE):
            offenders.append(path.name)

    assert not offenders, f"tasks importing fastapi: {offenders}"


def test_routers_do_not_return_exception_text_or_500s():
    """25 copies of `except Exception -> 500 str(e)` used to live in the routers.

    That leaked temp paths and native-tool output to users and hid the error class from the
    logs. `main.py` now owns 500s; a router may still translate a *known* library failure into a
    400 (protect/unlock do), but it must not echo the exception.
    """
    leaky = {
        name: source
        for name, source in ROUTER_SOURCES.items()
        if re.search(r"detail\s*=\s*(str\(|f\"[^\"]*\{str\()", source)
    }
    assert not leaky, f"routers echoing exception text: {sorted(leaky)}"

    five_hundreds = {
        name: source for name, source in ROUTER_SOURCES.items() if "status_code=500" in source
    }
    assert not five_hundreds, f"routers building their own 500s: {sorted(five_hundreds)}"


def test_request_id_is_echoed(client):
    """The id is what connects a user's screenshot to a log line."""
    response = client.get("/health")

    assert response.headers.get("x-request-id")


def test_unexpected_errors_are_logged_not_leaked():
    """A 500 body must not contain the exception text, but must carry the id."""
    from app.routers import image as image_router

    def boom(*args, **kwargs):
        raise RuntimeError("secret path /tmp/upload_deadbeef.pdf and a gs banner")

    with TestClient(client_app, raise_server_exceptions=False) as failing:
        original = image_router.compress_image_task
        image_router.compress_image_task = boom
        try:
            response = failing.post(
                "/api/v1/image/compress",
                files={"file": ("a.png", _png(), "image/png")},
                data={"quality": "70"},
            )
        finally:
            image_router.compress_image_task = original

    assert response.status_code == 500
    body = response.json()
    assert "secret path" not in body["detail"]
    assert "gs banner" not in body["detail"]
    assert body["request_id"]
