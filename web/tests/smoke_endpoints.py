"""Endpoint smoke suite for the web build.

Exercises every tool endpoint against a running server and reports per-endpoint status,
latency and payload size. Missing native tools (LibreOffice, Ghostscript, Poppler, ocrmypdf)
are reported as SKIP with the reason instead of FAIL, so a green run means the transport and
the app agree — not that this particular machine happens to have the right binaries.

Run from the repo root::

    .\\myenv\\Scripts\\python.exe -m web.tests.smoke_endpoints
    .\\myenv\\Scripts\\python.exe -m web.tests.smoke_endpoints --base http://127.0.0.1:8081

Exits 1 if any endpoint FAILs. SKIPs never fail the run but are always printed.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

REPO = Path(__file__).resolve().parent.parent.parent
FIXTURES = REPO / "web" / "fixtures"

PDF = "application/pdf"
PNG = "image/png"
JPG = "image/jpeg"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


# --- capability probes ----------------------------------------------------------------


def gs_command() -> str | None:
    for name in ("gswin64c", "gswin32c", "gs"):
        if shutil.which(name):
            return name
    for candidate in (
        r"C:\Program Files\gs\gs10.05.1\bin\gswin64c.exe",
        r"C:\Program Files (x86)\gs\gs10.05.1\bin\gswin32c.exe",
    ):
        if Path(candidate).exists():
            return candidate
    return None


def soffice_command() -> str | None:
    for name in ("soffice", "libreoffice"):
        if shutil.which(name):
            return name
    for candidate in (
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ):
        if Path(candidate).exists():
            return candidate
    return None


CAPABILITIES: dict[str, tuple[bool, str]] = {}


def probe_capabilities() -> None:
    checks = {
        "gs": ("Ghostscript", bool(gs_command())),
        "poppler": ("Poppler (pdftoppm)", bool(shutil.which("pdftoppm"))),
        "ocrmypdf": ("ocrmypdf", bool(shutil.which("ocrmypdf"))),
        "tesseract": ("Tesseract", bool(shutil.which("tesseract"))),
        "soffice": ("LibreOffice", bool(soffice_command())),
    }
    for key, (label, present) in checks.items():
        CAPABILITIES[key] = (present, label)


# --- case definition ------------------------------------------------------------------


@dataclass
class Case:
    name: str
    path: str
    # (field name, filename, content, mime). A repeated field appears more than once, which is
    # what httpx wants as a list rather than a dict.
    files: list[tuple[str, str, bytes, str]] = field(default_factory=list)
    data: dict[str, str] = field(default_factory=dict)
    method: str = "POST"
    expect_status: int = 200
    expect_type: str | None = None  # substring of content-type; None = any
    requires: tuple[str, ...] = ()
    note: str = ""


@dataclass
class Result:
    name: str
    outcome: str  # PASS / FAIL / SKIP
    status: int | None = None
    ms: int = 0
    size: int = 0
    detail: str = ""


# --- fixtures -------------------------------------------------------------------------


def make_pdf(pages: int = 3) -> bytes:
    """Build the PDF fixture in memory: no temp file, so the suite works under a sandbox that
    denies writes outside the workspace."""
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    for page in range(1, pages + 1):
        c.setFont("Helvetica-Bold", 24)
        c.drawString(72, 720, f"YourPDF smoke page {page}")
        c.setFont("Helvetica", 12)
        c.drawString(72, 690, "The quick brown fox jumps over the lazy dog.")
        c.drawString(72, 670, f"Page {page} of {pages}.")
        c.showPage()
    c.save()
    return buf.getvalue()


def load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


# protect/unlock are a dependent pair — the second consumes the first's output — so they run
# outside the CASES table. Declared here so the coverage test can still see them.
PAIRED_PATHS = ("/api/v1/protect", "/api/v1/unlock")


def covered_paths() -> set[str]:
    """Every endpoint this suite exercises, including the paired ones."""
    return {case.path for case in build_cases(b"%PDF-1.4\n")} | set(PAIRED_PATHS)


def build_cases(pdf: bytes) -> list[Case]:
    pdf_file = [("file", "smoke.pdf", pdf, PDF)]
    pdf_pair = [("files", "a.pdf", pdf, PDF), ("files", "b.pdf", pdf, PDF)]
    big_pdf = make_pdf(150)
    big_pdf_file = [("file", "big.pdf", big_pdf, PDF)]
    docx_file = [("file", "sample.docx", load("sample.docx"), DOCX)]
    docx_pair = [("files", "a.docx", load("sample.docx"), DOCX), ("files", "b.docx", load("sample2.docx"), DOCX)]
    pptx_file = [("file", "sample.pptx", load("sample.pptx"), PPTX)]
    pptx_pair = [("files", "a.pptx", load("sample.pptx"), PPTX), ("files", "b.pptx", load("sample2.pptx"), PPTX)]
    jpg_file = [("file", "sample.jpg", load("sample.jpg"), JPG)]
    png_file = [("file", "sample.png", load("sample.png"), PNG)]

    return [
        # --- PDF ---
        Case("pdf/compress", "/api/v1/compress", pdf_file, {"quality": "medium"}, expect_type=PDF, requires=("gs",)),
        Case("pdf/merge", "/api/v1/merge", pdf_pair, {"plan": ""}, expect_type=PDF),
        Case("pdf/split", "/api/v1/split", pdf_file, {"mode": "custom", "pages_spec": "1-2"}),
        Case(
            "pdf/pdf-to-images",
            "/api/v1/pdf-to-images",
            pdf_file,
            {"format": "png", "dpi": "100", "pages": "1"},
            expect_type="image/png",
            requires=("poppler",),
        ),
        Case("pdf/images-to-pdf", "/api/v1/images-to-pdf", [("files", "a.png", load("sample.png"), PNG)], expect_type=PDF),
        Case("pdf/extract-text", "/api/v1/extract-text", pdf_file, {"export_txt": "false"}, expect_type="application/json"),
        Case("pdf/extract-text(txt)", "/api/v1/extract-text", pdf_file, {"export_txt": "true"}, expect_type="text/plain"),
        Case("pdf/pdf-to-docx", "/api/v1/pdf-to-docx", pdf_file, expect_type="wordprocessingml"),
        Case("pdf/docx-to-pdf", "/api/v1/docx-to-pdf", docx_file, expect_type=PDF, requires=("soffice",)),
        Case("pdf/rotate", "/api/v1/rotate", pdf_file, {"rotation": "90"}, expect_type=PDF),
        Case("pdf/organize", "/api/v1/organize", pdf_file, {"page_order": "3,1,2"}, expect_type=PDF),
        Case(
            "pdf/watermark",
            "/api/v1/watermark",
            pdf_file,
            {"text": "CONFIDENTIAL", "color": "gray", "opacity": "0.3", "rotation": "45", "font_size": "48", "pages": "all"},
            expect_type=PDF,
        ),
        Case(
            "pdf/sign",
            "/api/v1/sign",
            pdf_file + [("signature", "signature.png", load("sample.png"), PNG)],
            {
                "pages": "all",
                "cx": "50",
                "cy": "40",
                "width": "25",
                "rotation": "0",
                "add_date": "true",
                "date_text": "2026-11-15",
                "date_size": "12",
                "date_position": "below",
            },
            expect_type=PDF,
        ),
        Case("pdf/add-page-numbers", "/api/v1/add-page-numbers", pdf_file, {"position": "bottom-center"}, expect_type=PDF),
        Case("pdf/ocr", "/api/v1/ocr", pdf_file, {"language": "eng"}, expect_type=PDF, requires=("ocrmypdf", "tesseract", "gs")),
        Case("pdf/pdf-info", "/api/v1/pdf-info", pdf_file, expect_type="application/json"),
        # --- image ---
        Case("image/compress", "/api/v1/image/compress", jpg_file, {"quality": "75"}, expect_type="image/"),
        Case("image/resize", "/api/v1/image/resize", jpg_file, {"percentage": "50"}, expect_type="image/"),
        Case("image/crop", "/api/v1/image/crop", jpg_file, {"x": "5", "y": "5", "width": "50", "height": "50"}, expect_type="image/"),
        Case("image/convert", "/api/v1/image/convert", jpg_file, {"target_format": "webp"}, expect_type="image/"),
        Case("image/rotate", "/api/v1/image/rotate", jpg_file, {"angle": "90"}, expect_type="image/"),
        Case(
            "image/watermark",
            "/api/v1/image/watermark",
            png_file,
            {"text": "SAMPLE", "color": "gray", "opacity": "0.3", "position": "center"},
            expect_type="image/",
        ),
        # --- office ---
        Case("office/merge-docx", "/api/v1/office/merge-docx", docx_pair, expect_type="wordprocessingml", requires=("soffice",)),
        Case(
            "office/docx-to-images",
            "/api/v1/office/docx-to-images",
            docx_file,
            {"format": "png", "dpi": "100"},
            requires=("soffice", "poppler"),
        ),
        Case(
            "office/docx-to-images(p1)",
            "/api/v1/office/docx-to-images",
            docx_file,
            {"format": "png", "dpi": "100", "pages": "1"},
            expect_type="image/",
            requires=("soffice", "poppler"),
        ),
        Case("office/pptx-to-pdf", "/api/v1/office/pptx-to-pdf", pptx_file, expect_type=PDF, requires=("soffice",)),
        Case(
            "office/pptx-to-images",
            "/api/v1/office/pptx-to-images",
            pptx_file,
            {"format": "png", "dpi": "100"},
            requires=("soffice", "poppler"),
        ),
        Case("office/merge-pptx", "/api/v1/office/merge-pptx", pptx_pair, expect_type="presentationml", requires=("soffice",)),
        # --- service ---
        Case("health", "/health", method="GET", expect_type="application/json"),
        # --- validation: these must be rejected, not crash ---
        Case("guard/wrong-extension", "/api/v1/compress", jpg_file, {"quality": "medium"}, expect_status=400, note="jpg into a PDF-only tool"),
        # An empty multipart field never reaches the handler: the parser drops it, so FastAPI
        # answers 422 "field required" before the endpoint's own 400 check can run.
        Case(
            "guard/empty-page-order",
            "/api/v1/organize",
            pdf_file,
            {"page_order": ""},
            expect_status=422,
            note="empty field dropped by the parser -> 422",
        ),
        Case("guard/zero-rotation", "/api/v1/rotate", pdf_file, {"rotation": "0"}, expect_status=400, note="zero rotation rejected"),
        # The render budget counts the *selection*, not the document: 150 pages requested
        # wholesale is refused, the same document rendered 2 pages at a time is not.
        Case(
            "guard/render-budget",
            "/api/v1/pdf-to-images",
            big_pdf_file,
            {"format": "png", "dpi": "100", "pages": "all"},
            expect_status=400,
            note="150 pages over the 100-page budget",
            requires=("poppler",),
        ),
        Case(
            "guard/render-budget-subset",
            "/api/v1/pdf-to-images",
            big_pdf_file,
            {"format": "png", "dpi": "100", "pages": "1-2"},
            note="same document, 2 selected pages",
            requires=("poppler",),
        ),
    ]


# --- runner ---------------------------------------------------------------------------


def run_case(client: httpx.Client, base: str, case: Case) -> Result:
    if case.requires:
        missing = [CAPABILITIES[k][1] for k in case.requires if not CAPABILITIES.get(k, (False, k))[0]]
        if missing:
            return Result(case.name, "SKIP", detail="missing " + ", ".join(missing))

    started = time.perf_counter()
    try:
        files = [(field, (filename, content, mime)) for field, filename, content, mime in case.files] or None
        response = client.request(case.method, base + case.path, files=files, data=case.data or None)
    except httpx.HTTPError as exc:
        return Result(case.name, "FAIL", detail=f"transport: {exc!r}")
    elapsed = int((time.perf_counter() - started) * 1000)

    content_type = response.headers.get("content-type", "")
    body = response.content
    result = Result(case.name, "PASS", response.status_code, elapsed, len(body))

    if response.status_code != case.expect_status:
        result.outcome = "FAIL"
        result.detail = f"expected {case.expect_status}, got {response.status_code}: {body[:300].decode('utf-8', 'replace')}"
    elif case.expect_type and case.expect_type not in content_type:
        result.outcome = "FAIL"
        result.detail = f"content-type {content_type!r} lacks {case.expect_type!r}"
    elif not body:
        result.outcome = "FAIL"
        result.detail = "empty body"
    elif case.note:
        result.detail = case.note

    return result


def run_protect_unlock(client: httpx.Client, base: str, pdf: bytes) -> list[Result]:
    """protect then unlock: the second depends on the first, so they run as a pair."""
    results: list[Result] = []
    files = {"file": ("smoke.pdf", pdf, PDF)}
    started = time.perf_counter()
    protected = client.post(base + "/api/v1/protect", files=files, data={"password": "smoke-pass"})
    elapsed = int((time.perf_counter() - started) * 1000)
    ok = protected.status_code == 200 and PDF in protected.headers.get("content-type", "")
    results.append(
        Result("pdf/protect", "PASS" if ok else "FAIL", protected.status_code, elapsed, len(protected.content),
               "" if ok else protected.content[:300].decode("utf-8", "replace"))
    )
    if not ok:
        results.append(Result("pdf/unlock", "SKIP", detail="protect failed, nothing to unlock"))
        return results

    started = time.perf_counter()
    unlocked = client.post(
        base + "/api/v1/unlock",
        files={"file": ("protected.pdf", protected.content, PDF)},
        data={"password": "smoke-pass"},
    )
    elapsed = int((time.perf_counter() - started) * 1000)
    ok = unlocked.status_code == 200 and PDF in unlocked.headers.get("content-type", "")
    results.append(
        Result("pdf/unlock", "PASS" if ok else "FAIL", unlocked.status_code, elapsed, len(unlocked.content),
               "" if ok else unlocked.content[:300].decode("utf-8", "replace"))
    )
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test every web endpoint.")
    parser.add_argument("--base", default="http://127.0.0.1:8081", help="server origin")
    parser.add_argument("--timeout", type=float, default=240.0, help="per-request timeout (s)")
    parser.add_argument(
        "--fail-on-skip",
        action="store_true",
        help="exit non-zero if any case was skipped — use this in the container, where a "
        "missing native tool must fail the build rather than silently reduce coverage",
    )
    args = parser.parse_args()

    probe_capabilities()
    print("capabilities:")
    for present, label in CAPABILITIES.values():
        print(f"  {'ok  ' if present else 'MISS'} {label}")

    pdf = make_pdf()

    results: list[Result] = []
    with httpx.Client(timeout=args.timeout) as client:
        for case in build_cases(pdf):
            results.append(run_case(client, args.base, case))
        results.extend(run_protect_unlock(client, args.base, pdf))

    width = max(len(r.name) for r in results) + 2
    print()
    header = f"{'ENDPOINT'.ljust(width)}{'RESULT'.ljust(8)}{'HTTP'.ljust(6)}{'ms'.rjust(7)}{'bytes'.rjust(10)}  detail"
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r.name.ljust(width)}{r.outcome.ljust(8)}"
            f"{(str(r.status) if r.status is not None else '-').ljust(6)}"
            f"{r.ms:>7}{r.size:>10}  {r.detail[:70]}"
        )

    passed = sum(r.outcome == "PASS" for r in results)
    failed = [r for r in results if r.outcome == "FAIL"]
    skipped = [r for r in results if r.outcome == "SKIP"]
    print("-" * len(header))
    print(f"{passed} passed, {len(failed)} failed, {len(skipped)} skipped, {len(results)} total")
    if failed:
        return 1
    if args.fail_on_skip and skipped:
        print("FAIL: --fail-on-skip set and at least one case was skipped")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
