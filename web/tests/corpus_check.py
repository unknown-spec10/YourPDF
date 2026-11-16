"""Corpus runner: exercises every tool against real files you supply.

The smoke suite (`smoke_endpoints.py`) proves the endpoints are wired up, using small synthetic
fixtures. This is the other half: point it at a folder of *real* documents and it runs each tool
over them, checking structure (page counts, content types, readable output) rather than just a
200 status, plus the round-trips that catch silent corruption:

  * protect -> unlock returns a readable PDF with the same page count,
  * merge of a file with itself doubles the page count,
  * split returns exactly the pages asked for,
  * compress / rotate / watermark / add-page-numbers / ocr preserve the page count,
  * pdf-to-images returns one image for one page and a ZIP for many.

Layout it expects (everything optional except the PDFs):

    test-corpus/
      *.pdf            every PDF tool
      *.docx           docx-to-pdf, docx-to-images, merge-docx
      *.pptx           pptx-to-pdf, pptx-to-images, merge-pptx
      *.jpg *.png      image tools + images-to-pdf + the signature used by `sign`
      report.md        written by this script

An encrypted PDF can pair with a sibling `<name>.password` file containing its password; the
runner will use it for `unlock` and for reading the outputs.

Usage:
    python -m web.tests.corpus_check --dir test-corpus --base http://127.0.0.1:8080
"""

from __future__ import annotations

import argparse
import io
import pathlib
import sys
import time

import httpx
from pypdf import PdfReader, PdfWriter

PDF = "application/pdf"
PNG = "image/png"
ZIP = "application/zip"
REPO = pathlib.Path(__file__).resolve().parents[2]


class Row:
    __slots__ = ("file", "tool", "status", "ms", "size", "detail")

    def __init__(self, file: str, tool: str, status: str, ms: int, size: int, detail: str = ""):
        self.file = file
        self.tool = tool
        self.status = status  # PASS | FAIL | INFO
        self.ms = ms
        self.size = size
        self.detail = detail


def pages_of(raw: bytes, password: str | None = None) -> int | None:
    """Page count of a PDF, or None when it is not a readable PDF."""
    try:
        reader = PdfReader(io.BytesIO(raw))
        if reader.is_encrypted:
            if password is None:
                return None
            reader.decrypt(password)
        return len(reader.pages)
    except Exception:
        return None


def post(client, base, path, files, data=None, timeout=600.0):
    started = time.perf_counter()
    response = client.post(f"{base}{path}", files=files, data=data or {}, timeout=timeout)
    return response, int((time.perf_counter() - started) * 1000)


def check(
    rows: list[Row],
    client,
    base,
    name: str,
    tool: str,
    path: str,
    files,
    data=None,
    expect_type: str | None = None,
    expect_pages: int | None = None,
    expect_status: int = 200,
    password: str | None = None,
    timeout: float = 600.0,
    soft: bool = False,
):
    """Run one request and verify the shape of the answer."""
    try:
        response, ms = post(client, base, path, files, data, timeout)
    except Exception as exc:  # network/timeout
        rows.append(Row(name, tool, "FAIL", 0, 0, f"request error: {exc}"))
        return None

    body = response.content
    marker = f"HTTP {response.status_code}"

    if response.status_code != expect_status:
        snippet = body[:160].decode("utf-8", "replace")
        # On a locked PDF most tools *cannot* run; a 4xx there is the correct answer, not a
        # regression. A 5xx still is one.
        if soft and 400 <= response.status_code < 500:
            rows.append(Row(name, tool, "INFO", ms, len(body), f"{marker} (not applicable): {snippet[:80]}"))
            return None
        rows.append(Row(name, tool, "FAIL", ms, len(body), f"{marker}: {snippet}"))
        return None

    if expect_status != 200:
        rows.append(Row(name, tool, "PASS", ms, len(body), f"{marker} as expected"))
        return body

    if not body:
        rows.append(Row(name, tool, "FAIL", ms, 0, f"{marker} but empty body"))
        return None

    content_type = response.headers.get("content-type", "")
    if expect_type and expect_type not in content_type:
        rows.append(Row(name, tool, "FAIL", ms, len(body), f"content-type {content_type} != {expect_type}"))
        return None

    if expect_pages is not None:
        got = pages_of(body, password)
        if got != expect_pages:
            rows.append(Row(name, tool, "FAIL", ms, len(body), f"{got} pages, expected {expect_pages}"))
            return None

    rows.append(Row(name, tool, "PASS", ms, len(body), content_type.split(";")[0]))
    return body


def check_split_all(rows, client, base, name, files, total):
    """`mode=all` returns a ZIP of one-page PDFs; the page count lives inside the archive."""
    try:
        response, ms = post(client, base, "/api/v1/split", files, {"mode": "all"}, 900.0)
    except Exception as exc:
        rows.append(Row(name, "split all", "FAIL", 0, 0, f"request error: {exc}"))
        return
    if response.status_code != 200:
        rows.append(Row(name, "split all", "FAIL", ms, len(response.content),
                        f"HTTP {response.status_code}: {response.text[:120]}"))
        return
    import zipfile
    if "pdf" in response.headers.get("content-type", "").lower() and total == 1:
        pages = pages_of(response.content)
        status = "PASS" if pages == 1 else "FAIL"
        rows.append(Row(name, "split all", status, ms, len(response.content),
                        f"single-page PDF ({pages} page)"))
        return
    try:
        with zipfile.ZipFile(io.BytesIO(response.content)) as bundle:
            names = [n for n in bundle.namelist() if n.lower().endswith(".pdf")]
            counts = [pages_of(bundle.read(n)) for n in names]
    except Exception as exc:
        rows.append(Row(name, "split all", "FAIL", ms, len(response.content), f"not a ZIP: {exc}"))
        return
    if len(names) != total or any(c != 1 for c in counts):
        rows.append(Row(name, "split all", "FAIL", ms, len(response.content),
                        f"{len(names)} PDFs (expected {total}), pages {counts[:6]}"))
        return
    rows.append(Row(name, "split all", "PASS", ms, len(response.content), f"{len(names)} single-page PDFs"))


def run_pdf(rows, client, base, path: pathlib.Path, signature: pathlib.Path | None):
    name = path.name
    raw = path.read_bytes()
    pw_file = path.with_suffix(path.suffix + ".password")
    password = pw_file.read_text(encoding="utf-8").strip() if pw_file.exists() else None

    info, _ = post(client, base, "/api/v1/pdf-info", {"file": (name, raw, PDF)})
    total = None
    if info.status_code == 200:
        total = info.json().get("num_pages")
    else:
        rows.append(
            Row(name, "pdf-info", "INFO", 0, len(raw),
                f"HTTP {info.status_code} (encrypted? supply {name}.password)")
        )

    file = lambda p=PDF: (name, raw, p)  # noqa: E731
    pdf = lambda: {"file": file()}  # noqa: E731

    if password is not None:
        # A locked file can only be meaningfully tested by unlocking it. The other tools cannot
        # operate on it, so their refusal is recorded as information (a 5xx still fails).
        check(rows, client, base, name, "compress", "/api/v1/compress", pdf(),
              {"quality": "medium"}, expect_type=PDF, soft=True)
        check(rows, client, base, name, "watermark", "/api/v1/watermark", pdf(),
              {"text": "CONFIDENTIAL", "pages": "all"}, expect_type=PDF, soft=True)
        check(rows, client, base, name, "protect", "/api/v1/protect", pdf(),
              {"password": "corpus-test-123"}, expect_type=PDF, soft=True)
        check(rows, client, base, name, "unlock (supplied pw)", "/api/v1/unlock", pdf(),
              {"password": password}, expect_type=PDF, expect_pages=total)
        return

    cannot_read = total is None and password is None

    check(rows, client, base, name, "compress", "/api/v1/compress", pdf(),
          {"quality": "medium"}, expect_type=PDF, expect_pages=total)
    check(rows, client, base, name, "rotate 90", "/api/v1/rotate", pdf(),
          {"rotation": "90"}, expect_type=PDF, expect_pages=total)
    check(rows, client, base, name, "add-page-numbers", "/api/v1/add-page-numbers", pdf(),
          {"position": "bottom-center"}, expect_type=PDF, expect_pages=total)
    check(rows, client, base, name, "watermark", "/api/v1/watermark", pdf(),
          {"text": "CONFIDENTIAL", "pages": "all"}, expect_type=PDF, expect_pages=total)

    if total:
        order = ", ".join(str(p) for p in reversed(range(1, total + 1)))
        check(rows, client, base, name, "organize", "/api/v1/organize", pdf(),
              {"page_order": order}, expect_type=PDF, expect_pages=total)
        check(rows, client, base, name, "split p1", "/api/v1/split", pdf(),
              {"mode": "custom", "pages_spec": "1"}, expect_type=PDF, expect_pages=1)

    if total <= 20:
        check_split_all(rows, client, base, name, pdf(), total)

    check(rows, client, base, name, "pdf-to-images p1", "/api/v1/pdf-to-images", pdf(),
          {"format": "png", "dpi": "100", "pages": "1"}, expect_type="image/")
    if total <= 10:
        check(rows, client, base, name, "pdf-to-images all", "/api/v1/pdf-to-images", pdf(),
              {"format": "png", "dpi": "100", "pages": "all"}, expect_type=None)

    check(rows, client, base, name, "pdf-to-docx", "/api/v1/pdf-to-docx", pdf(),
          expect_type="wordprocessingml")
    check(rows, client, base, name, "extract-text json", "/api/v1/extract-text", pdf(),
          {}, expect_type="application/json")
    check(rows, client, base, name, "extract-text txt", "/api/v1/extract-text", pdf(),
          {"export_txt": "true"}, expect_type="text/plain")

    # Merge doubles the page count: the cheapest proof that pages are not dropped.
    check(rows, client, base, name, "merge x2", "/api/v1/merge",
          [("files", ("a.pdf", raw, PDF)), ("files", ("b.pdf", raw, PDF))],
          {"plan": ""}, expect_type=PDF, expect_pages=total * 2)

    if total <= 20:
        # OCR must not silently invalidate a digital signature; those files answer 400 by design.
        signed = b"/ByteRange" in raw or b"/Type /Sig" in raw or b"/Type/Sig" in raw
        check(rows, client, base, name, "ocr", "/api/v1/ocr", pdf(),
              {"language": "eng"}, expect_type=PDF, expect_pages=total, timeout=900.0,
              soft=signed)

    # An unknown mode used to come back as 200 with a zero-page PDF. Assert the contract so the
    # next regression shows up here rather than on a user's screen.
    bogus, _ = post(client, base, "/api/v1/split", pdf(), {"mode": "definitely-not-a-mode"}, 120.0)
    if bogus.status_code == 400:
        rows.append(Row(name, "split (bogus mode)", "PASS", 0, len(bogus.content), "rejected with 400"))
    else:
        pages = pages_of(bogus.content)
        rows.append(Row(name, "split (bogus mode)", "FAIL", 0, len(bogus.content),
                        f"HTTP {bogus.status_code}, {pages} pages — expected 400"))

    # protect -> unlock round trip: the only way to catch a "protect" that quietly breaks the file.
    protected = check(rows, client, base, name, "protect", "/api/v1/protect", pdf(),
                      {"password": "corpus-test-123"}, expect_type=PDF, expect_pages=total,
                      password="corpus-test-123")
    if protected:
        unlocked = check(rows, client, base, name, "unlock (round trip)", "/api/v1/unlock",
                         {"file": ("protected.pdf", protected, PDF)}, {"password": "corpus-test-123"},
                         expect_type=PDF, expect_pages=total)
        if unlocked is None:
            rows.append(Row(name, "unlock", "FAIL", 0, 0, "protect output could not be unlocked"))

    if not cannot_read:
        # Not an error: an unencrypted PDF *should* be refused.
        check(rows, client, base, name, "unlock (not encrypted)", "/api/v1/unlock", pdf(),
              {"password": "whatever"}, expect_status=400)

    if signature and total:
        check(rows, client, base, name, "sign", "/api/v1/sign",
              [("file", (name, raw, PDF)), ("signature", (signature.name, signature.read_bytes(), PNG))],
              {"pages": "all"}, expect_type=PDF, expect_pages=total)


def run_office(rows, client, base, path: pathlib.Path, kind: str):
    name = path.name
    raw = path.read_bytes()
    mime = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            if kind == "docx" else
            "application/vnd.openxmlformats-officedocument.presentationml.presentation")
    pdf_path = "/api/v1/docx-to-pdf" if kind == "docx" else "/api/v1/office/pptx-to-pdf"
    check(rows, client, base, name, f"{kind}-to-pdf", pdf_path,
          {"file": (name, raw, mime)}, expect_type=PDF)
    check(rows, client, base, name, f"{kind}-to-images", f"/api/v1/office/{kind}-to-images",
          {"file": (name, raw, mime)}, {"format": "png", "dpi": "100", "pages": "1"},
          expect_type="image/")
    check(rows, client, base, name, f"merge-{kind} x2", f"/api/v1/office/merge-{kind}",
          [("files", (f"a.{kind}", raw, mime)), ("files", (f"b.{kind}", raw, mime))])


def run_image(rows, client, base, path: pathlib.Path):
    name = path.name
    raw = path.read_bytes()
    ext = path.suffix.lower().lstrip(".")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp"}.get(ext, "application/octet-stream")
    file = (name, raw, mime)
    check(rows, client, base, name, "compress-image", "/api/v1/image/compress", {"file": file},
          {"quality": "75"}, expect_type="image/")
    check(rows, client, base, name, "resize-image", "/api/v1/image/resize", {"file": file},
          {"percentage": "50"}, expect_type="image/")
    check(rows, client, base, name, "rotate-image", "/api/v1/image/rotate", {"file": file},
          {"angle": "90"}, expect_type="image/")
    check(rows, client, base, name, "watermark-image", "/api/v1/image/watermark", {"file": file},
          {"text": "SAMPLE", "position": "center"}, expect_type="image/")
    check(rows, client, base, name, "convert-image", "/api/v1/image/convert", {"file": file},
          {"target_format": "webp"}, expect_type="image/")
    check(rows, client, base, name, "crop-image", "/api/v1/image/crop", {"file": file},
          {"x": "0", "y": "0", "width": "40", "height": "40"}, expect_type="image/")
    check(rows, client, base, name, "images-to-pdf", "/api/v1/images-to-pdf", [("files", (name, raw, mime))],
          expect_type=PDF)


def write_report(rows: list[Row], directory: pathlib.Path, base: str) -> None:
    total = len(rows)
    passed = sum(1 for r in rows if r.status == "PASS")
    failed = sum(1 for r in rows if r.status == "FAIL")
    lines = [
        "# Tool corpus report",
        "",
        f"- Server: `{base}`",
        f"- Cases: **{total}** · pass **{passed}** · fail **{failed}**",
        "",
        "| File | Tool | Result | ms | bytes | Detail |",
        "| --- | --- | --- | ---: | ---: | --- |",
    ]
    for r in rows:
        lines.append(f"| {r.file} | {r.tool} | {r.status} | {r.ms} | {r.size} | {r.detail} |")
    (directory / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"{'FILE':<28}{'TOOL':<24}{'RESULT':<8}{'MS':>7}{'BYTES':>10}  DETAIL")
    for r in rows:
        print(f"{r.file[:27]:<28}{r.tool[:23]:<24}{r.status:<8}{r.ms:>7}{r.size:>10}  {r.detail[:60]}")
    print("-" * 100)
    print(f"{passed} passed, {failed} failed, {total - passed - failed} info, {total} total")
    print(f"report written to {directory / 'report.md'}")


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", default="test-corpus", help="folder holding the documents")
    parser.add_argument("--base", default="http://127.0.0.1:8080", help="server origin")
    args = parser.parse_args()

    directory = pathlib.Path(args.dir)
    if not directory.is_dir():
        print(f"no such folder: {directory}")
        return 2

    pdfs = sorted(p for p in directory.glob("*") if p.suffix.lower() == ".pdf" and p.is_file())
    docxs = sorted(p for p in directory.glob("*") if p.suffix.lower() == ".docx")
    pptxs = sorted(p for p in directory.glob("*") if p.suffix.lower() == ".pptx")
    images = sorted(p for p in directory.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})

    if not any((pdfs, docxs, pptxs, images)):
        print(f"nothing to test in {directory} — drop PDFs (and optionally docx/pptx/images) there")
        return 2

    # The signature is a required input for `sign`; prefer a supplied one, else the bundled sample.
    signature = next((p for p in images if "sign" in p.stem.lower()), None)
    if signature is None:
        bundled = REPO / "web" / "fixtures" / "sample.png"
        signature = bundled if bundled.exists() else None

    rows: list[Row] = []
    with httpx.Client() as client:
        try:
            client.get(f"{args.base}/health", timeout=5)
        except Exception:
            print(f"server not reachable at {args.base} — start it first")
            return 2

        for path in pdfs:
            print(f"… {path.name}")
            run_pdf(rows, client, args.base, path, signature)
        for path in docxs:
            print(f"… {path.name} (office)")
            run_office(rows, client, args.base, path, "docx")
        for path in pptxs:
            print(f"… {path.name} (office)")
            run_office(rows, client, args.base, path, "pptx")
        for path in images:
            print(f"… {path.name} (image)")
            run_image(rows, client, args.base, path)

    write_report(rows, directory, args.base)
    return 1 if any(r.status == "FAIL" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
