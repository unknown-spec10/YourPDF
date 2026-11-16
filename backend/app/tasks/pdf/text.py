"""Synchronous PDF processing functions (in-request, no queue).

Each function takes an absolute (or backend-relative) input path, runs the
same conversion logic the old queued tasks used to run, and returns
``(output_bytes, download_filename)``. Callers stream the bytes straight
back as a ``Response``. ``extract_text`` is the exception: with
``export_txt=False`` it returns ``(text, None)`` and the router replies
with JSON.
"""

import logging
import os
import shutil
import subprocess
import sys
import uuid
from typing import NamedTuple

from app.errors import DomainError, InvalidRequest
from pdf2docx import Converter
from pypdf import PdfReader, PdfWriter, Transformation

from app.tasks.common import (
    SUBPROCESS_TIMEOUT,
    SUBPROCESS_TIMEOUT_MESSAGE,
    cleanup_paths,
    ensure_tmp_dir,
    read_bytes,
    resolve_path,
    resolve_paths,
    write_bytes,
    write_text,
    run_tool,
)

from app.tasks.pdf import ocr as ocr_tasks
from app.tasks.common import download_name as _download_name
logger = logging.getLogger(__name__)

from app.limits import validate_render_budget  # noqa: E402  (kept beside the tasks it guards)



def extract_text_task(
    file_path: str, export_txt: bool, original_filename: str = None
) -> tuple[bytes | str, str | None]:
    """Extract text; export_txt=True returns (txt bytes, name), else (text, None)."""
    logger.info(f"Starting text extraction task. export_txt: {export_txt}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    output_filename = ""
    output_path = ""

    try:
        reader = PdfReader(file_path)
        extracted_content = ""
        for i, page in enumerate(reader.pages):
            try:
                text = page.extract_text(extraction_mode="layout")
            except TypeError:
                try:
                    text = page.extract_text(layout_mode=True)
                except Exception:
                    logger.warning(f"Layout extraction failed for page {i + 1}; falling back to plain mode.")
                    text = page.extract_text()
            except Exception:
                logger.warning(f"Layout extraction failed for page {i + 1}; falling back to plain mode.")
                text = page.extract_text()
            if text:
                extracted_content += f"--- Page {i + 1} ---\n{text}\n\n"

        if not extracted_content:
            extracted_content = "No text could be extracted from this document."

        if export_txt:
            output_filename = f"extracted_{uuid.uuid4()}.txt"
            tmp_dir = ensure_tmp_dir()
            output_path = os.path.join(tmp_dir, output_filename)

            write_text(output_path, extracted_content)

            download_name = _download_name(
                original_filename, output_filename, lambda base, ext: f"{base}_extracted.txt"
            )
            return extracted_content.encode("utf-8"), download_name
        else:
            return extracted_content, None
    except Exception as e:
        logger.error(f"Text extraction failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)

class PdfToDocxResult(NamedTuple):
    data: bytes
    download_name: str
    ocr_applied: bool
    notice: str | None

def _page_text_flags(page) -> tuple[bool, bool]:
    """Return ``(displayed, hidden)`` for one PyMuPDF page."""
    try:
        spans = page.get_texttrace()
    except Exception:
        # Malformed fonts can break span introspection; fall back to plain extraction.
        return bool(page.get_text().strip()), False
    return (
        any(span.get("type") != 3 for span in spans),
        any(span.get("type") == 3 for span in spans),
    )

def _pdf_text_layout(file_path: str) -> str:
    """Classify a PDF's text layer as ``digital``, ``ocr``, ``scan`` or ``mixed``.

    Every page with displayed (non-invisible) text is ``digital``; a page with only
    invisible text has an OCR layer; a page with neither is a raw scan.
    """
    import fitz

    try:
        with fitz.open(file_path) as doc:
            total = doc.page_count
            displayed = 0
            hidden = 0
            for page in doc:
                page_displayed, page_hidden = _page_text_flags(page)
                displayed += page_displayed
                hidden += page_hidden
    except Exception as e:
        logger.warning(f"Could not inspect the text layer of {file_path}: {e}")
        return "digital"

    if total == 0 or displayed == total:
        return "digital"
    if displayed == 0:
        return "ocr" if hidden else "scan"
    return "mixed"

def _docx_has_text(file_path: str) -> bool:
    from docx import Document
    from docx.oxml.ns import qn

    body = Document(file_path).element.body
    return any(t.text.strip() for t in body.iter(qn("w:t")) if t.text)

def pdf_to_docx_task(file_path: str, original_filename: str = None) -> PdfToDocxResult:
    """Convert a PDF to DOCX, OCR-ing scans and honouring an existing OCR layer."""
    logger.info(f"Starting PDF to DOCX task for {file_path}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"converted_{uuid.uuid4()}.docx"
    output_path = os.path.join(output_dir, output_filename)
    ocr_path = None

    try:
        layout = _pdf_text_layout(file_path)
        ocr_applied = False
        notice = None
        source_path = file_path
        ocr_mode = 0

        if layout == "ocr":
            # The text is already there, just invisible: extract it instead of the image.
            ocr_mode = 2
        elif layout == "scan":
            ocr_path = os.path.join(output_dir, f"ocr_{uuid.uuid4()}.pdf")
            try:
                ocr_tasks._run_ocrmypdf(file_path, ocr_path)
            except FileNotFoundError as e:
                logger.error(f"OCR could not run for {file_path}: {e!r}")
                raise InvalidRequest(
                    status_code=500,
                    detail=(
                        "OCR is required to convert this scanned PDF, but the OCR tool "
                        "could not be started on this machine."
                    ),
                ) from e
            except subprocess.TimeoutExpired as e:
                logger.error("OCR timed out after %s seconds", SUBPROCESS_TIMEOUT)
                raise InvalidRequest(
                    status_code=500,
                    detail=(
                        "OCR timed out while converting this scanned PDF. Try again, or "
                        "run it through the OCR tool first."
                    ),
                ) from e
            source_path = ocr_path
            ocr_mode = 2
            ocr_applied = True
            notice = (
                "This PDF had no text layer, so we ran OCR automatically. The Word file "
                "contains the recognized text only; the scanned page images are not included."
            )
        elif layout == "mixed":
            notice = (
                "Some pages had no readable text, so they are kept as page images in the "
                "Word file."
            )

        cv = Converter(source_path)
        try:
            cv.convert(output_path, start=0, end=None, ocr=ocr_mode)
        finally:
            cv.close()

        if not _docx_has_text(output_path):
            raise InvalidRequest(
                status_code=422,
                detail=(
                    "This PDF looks like a scan and we could not read any text from it. "
                    "Try a clearer scan, or run it through the OCR tool first."
                ),
            )

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}.docx"
        )
        return PdfToDocxResult(data, download_name, ocr_applied, notice)
    except DomainError:
        raise
    except Exception as e:
        logger.error(f"PDF to DOCX conversion failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path, ocr_path)

def docx_to_pdf_task(file_path: str, original_filename: str = None) -> tuple[bytes, str]:
    """Convert a DOCX to PDF via LibreOffice (or Word on Windows) and return bytes."""
    logger.info(f"Starting DOCX to PDF task for {file_path}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"converted_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        soffice_cmd = None
        if sys.platform == "win32":
            paths = [
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
            ]
            for p in paths:
                if os.path.exists(p):
                    soffice_cmd = p
                    break

        if not soffice_cmd:
            for cmd in ["soffice", "libreoffice"]:
                if shutil.which(cmd):
                    soffice_cmd = cmd
                    break

        converted = False
        if soffice_cmd:
            cmd = [soffice_cmd, "--headless", "--convert-to", "pdf", "--outdir", output_dir, file_path]
            logger.info(f"Running LibreOffice conversion: {' '.join(cmd)}")
            try:
                run_tool(cmd, timeout=SUBPROCESS_TIMEOUT)
            except subprocess.TimeoutExpired:
                logger.error("LibreOffice conversion timed out after %s seconds", SUBPROCESS_TIMEOUT)
                raise Exception(SUBPROCESS_TIMEOUT_MESSAGE)

            base_name = os.path.splitext(os.path.basename(file_path))[0]
            generated_pdf = os.path.join(output_dir, f"{base_name}.pdf")
            if os.path.exists(generated_pdf):
                if generated_pdf != output_path:
                    shutil.move(generated_pdf, output_path)
                converted = True

        if not converted and sys.platform == "win32":
            try:
                import win32com.client

                logger.info("Attempting MS Word COM fallback on Windows")
                word = win32com.client.Dispatch("Word.Application")
                word.Visible = False
                doc = word.Documents.Open(os.path.abspath(file_path))
                doc.SaveAs(os.path.abspath(output_path), FileFormat=17)
                doc.Close()
                word.Quit()
                converted = True
            except Exception as com_err:
                logger.error(f"MS Word COM fallback failed: {com_err}")

        if not converted:
            raise Exception("Could not convert DOCX to PDF. Neither LibreOffice headless nor MS Word is available.")

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}.pdf"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"DOCX to PDF conversion failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)
