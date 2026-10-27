"""Synchronous PDF processing functions (in-request, no queue).

Each function takes an absolute (or backend-relative) input path, runs the
same conversion logic the old queued tasks used to run, and returns
``(output_bytes, download_filename)``. Callers stream the bytes straight
back as a ``Response``. ``extract_text`` is the exception: with
``export_txt=False`` it returns ``(text, None)`` and the router replies
with JSON.
"""

import json
import logging
import math
import os
import shutil
import subprocess
import sys
import uuid
import zipfile

import img2pdf
from fastapi import HTTPException
from pdf2docx import Converter
from pdf2image import convert_from_path
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject

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
)

logger = logging.getLogger(__name__)


def _download_name(original_filename: str | None, fallback: str, build) -> str:
    if original_filename:
        base, ext = os.path.splitext(original_filename)
        return build(base, ext)
    return fallback


def _resolve_ghostscript_binary() -> str:
    """Resolve the Ghostscript binary robustly across platforms.

    On Windows the binary is ``gswin64c.exe``/``gswin32c.exe``, not ``gs``,
    so probe ``shutil.which`` first then fall back to well-known install
    locations (mirrors the LibreOffice probing in ``docx_to_pdf_task``).
    """
    for name in ("gswin64c", "gswin32c", "gs"):
        found = shutil.which(name)
        if found:
            return found
    candidates = [
        r"D:/gs10.05.1/bin/gswin64c.exe",
        r"D:\gs10.05.1\bin\gswin64c.exe",
        r"C:\Program Files\gs\gs10.05.1\bin\gswin64c.exe",
        r"C:\Program Files (x86)\gs\gs10.05.1\bin\gswin32c.exe",
        r"C:\Program Files\gs\bin\gswin64c.exe",
        r"C:\Program Files (x86)\gs\bin\gswin32c.exe",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    raise Exception(
        "Ghostscript is not installed or not on PATH. "
        "Install Ghostscript (gswin64c/gswin32c on Windows, gs elsewhere) "
        "and ensure it is reachable via PATH."
    )


def compress_pdf_task(file_path: str, quality: str, original_filename: str = None) -> tuple[bytes, str]:
    """Run Ghostscript compression and return the compressed PDF bytes."""
    logger.info(f"Starting compression task for {file_path} with quality {quality}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        logger.error(f"Input file not found: {file_path}")
        raise FileNotFoundError(f"Input file not found: {file_path}")

    quality_presets = {
        "low": "/printer",
        "medium": "/ebook",
        "high": "/screen",
    }
    preset = quality_presets.get(quality.lower(), "/ebook")

    output_dir = os.path.dirname(file_path)
    output_filename = f"compressed_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    gs_cmd = [
        _resolve_ghostscript_binary(),
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        f"-dPDFSETTINGS={preset}",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
    ]

    if quality.lower() == "medium":
        gs_cmd.extend(
            [
                "-dDownsampleColorImages=true",
                "-dColorImageDownsampleType=/Bicubic",
                "-dColorImageResolution=150",
                "-dDownsampleGrayImages=true",
                "-dGrayImageDownsampleType=/Bicubic",
                "-dGrayImageResolution=150",
                "-dDownsampleMonoImages=true",
                "-dMonoImageDownsampleType=/Bicubic",
                "-dMonoImageResolution=150",
                "-dColorImageFilter=/DCTEncode",
                "-dGrayImageFilter=/DCTEncode",
            ]
        )
    elif quality.lower() == "high":
        gs_cmd.extend(
            [
                "-dDownsampleColorImages=true",
                "-dColorImageDownsampleType=/Bicubic",
                "-dColorImageResolution=60",
                "-dDownsampleGrayImages=true",
                "-dGrayImageDownsampleType=/Bicubic",
                "-dGrayImageResolution=60",
                "-dDownsampleMonoImages=true",
                "-dMonoImageDownsampleType=/Bicubic",
                "-dMonoImageResolution=100",
                "-dColorImageFilter=/DCTEncode",
                "-dGrayImageFilter=/DCTEncode",
            ]
        )

    gs_cmd.extend([f"-sOutputFile={output_path}", file_path])

    try:
        logger.info(f"Running command: {' '.join(gs_cmd)}")
        subprocess.run(gs_cmd, capture_output=True, text=True, check=True, timeout=SUBPROCESS_TIMEOUT)

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Ghostscript executed but output file was not created or is empty.")

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_compressed{ext}"
        )
        logger.info("PDF compression completed successfully.")
        return data, download_name

    except subprocess.TimeoutExpired:
        logger.error("Ghostscript timed out after %s seconds", SUBPROCESS_TIMEOUT)
        raise Exception(SUBPROCESS_TIMEOUT_MESSAGE)
    except subprocess.CalledProcessError as e:
        logger.error(f"Ghostscript failed (exit code {e.returncode}): {e.stderr}")
        raise Exception(f"Ghostscript compression failed: {e.stderr}")
    except FileNotFoundError as e:
        logger.error(f"Ghostscript binary not found: {e}")
        raise Exception(
            "Ghostscript is not installed or not on PATH. "
            "Install Ghostscript (gswin64c/gswin32c on Windows, gs elsewhere) "
            "and ensure it is reachable via PATH."
        )
    except Exception as e:
        logger.error(f"Task failed: {str(e)}")
        raise e
    finally:
        for path in (file_path, output_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"Cleaned up local file: {path}")
                except Exception as cleanup_err:
                    logger.warning(f"Failed to remove {path}: {cleanup_err}")


def _parse_merge_plan(plan, num_files: int) -> list | None:
    """Parse the optional merge ``plan`` into a list of {file, pages} blocks.

    ``plan`` is the raw JSON string from the ``plan`` form field (or an
    already-decoded list, accepted for direct unit use). Returns ``None``
    when the plan is missing/empty so callers keep the legacy append-all
    behavior. Raises ``HTTPException`` 400 on any shape/index error.
    """
    if plan is None:
        return None
    if isinstance(plan, str):
        if not plan.strip():
            return None
        try:
            parsed = json.loads(plan)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Invalid merge plan: must be a JSON array string, "
                'e.g. \'[{"file": 0, "pages": "1-2"}]\'.',
            )
    else:
        parsed = plan
    if parsed is None:
        return None
    if isinstance(parsed, list) and len(parsed) == 0:
        return None
    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=400,
            detail="Invalid merge plan: must be a JSON array of {file, pages} blocks.",
        )
    for i, block in enumerate(parsed):
        if not isinstance(block, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid merge plan block at index {i}: "
                "each block must be an object with 'file' and 'pages'.",
            )
        if "file" not in block or "pages" not in block:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid merge plan block at index {i}: "
                "each block must contain 'file' and 'pages'.",
            )
        f = block["file"]
        if isinstance(f, bool) or not isinstance(f, int):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file index at plan block {i}: "
                "'file' must be a zero-based integer index.",
            )
        if f < 0 or f >= num_files:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file index {f} at plan block {i}: "
                f"only {num_files} files uploaded (valid range 0-{num_files - 1}).",
            )
        p = block["pages"]
        if not isinstance(p, str):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid pages specification at plan block {i} for file index {f}: "
                "must be a string like '1-3, 5' or 'all'.",
            )
        if not p.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Invalid pages specification at plan block {i} for file index {f}: "
                "pages string must not be empty.",
            )
    return parsed


def _parse_merge_pages_spec(pages_spec: str, total_pages: int, file_index: int) -> list[int]:
    """Parse a 1-based pages string into zero-based page indices.

    Supports ``all``, comma-separated numbers, closed ranges (``1-3``) and
    open-ended ranges (``3-`` means 3 to end). Raises ``HTTPException`` 400
    for unparsable input or page numbers beyond ``total_pages``.
    """
    if not isinstance(pages_spec, str):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pages specification for file index {file_index}: "
            "must be a string like '1-3, 5' or 'all'.",
        )
    s = pages_spec.strip()
    if not s:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pages specification for file index {file_index}: "
            "pages string must not be empty.",
        )
    if s.lower() == "all":
        return list(range(total_pages))
    pages: list[int] = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            if part.count("-") != 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            start_str, end_str = part.split("-", 1)
            start_str = start_str.strip()
            end_str = end_str.strip()
            if not start_str and not end_str:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            try:
                start = 1 if not start_str else int(start_str)
                end = total_pages if not end_str else int(end_str)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if start < 1 or end < 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: page numbers must be >= 1.",
                )
            if start > end:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: start page {start} exceeds end page {end} in range '{part}'.",
                )
            for p in range(start, end + 1):
                if p < 1 or p > total_pages:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Page {p} out of range for file index {file_index}: "
                        f"file has {total_pages} pages.",
                    )
                pages.append(p - 1)
        else:
            try:
                p = int(part)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if p < 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: page numbers must be >= 1.",
                )
            if p > total_pages:
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {p} out of range for file index {file_index}: "
                    f"file has {total_pages} pages.",
                )
            pages.append(p - 1)
    if not pages:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pages specification '{pages_spec}' for file index "
            f"{file_index}: no pages selected. "
            "Expected formats like '1-3', '5', '3-' or 'all'.",
        )
    return pages


def _parse_watermark_pages(pages: str, total_pages: int) -> list[int]:
    """Parse a 1-based pages string into zero-based page indices.

    Supports ``all`` (case-insensitive), comma-separated numbers, closed
    ranges (``1-3``) and open-ended ranges (``3-`` means 3 to end).
    Raises ``HTTPException`` 400 for unparsable input, empty selection,
    or page numbers beyond ``total_pages``.
    """
    if not isinstance(pages, str):
        raise HTTPException(
            status_code=400,
            detail="Invalid pages specification: must be a string like '1-3, 5' or 'all'.",
        )
    s = pages.strip()
    if not s:
        raise HTTPException(
            status_code=400,
            detail="Invalid pages specification: no pages selected. "
            "Expected formats like '1-3', '5', '3-' or 'all'.",
        )
    if s.lower() == "all":
        return list(range(total_pages))
    result: list[int] = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            if part.count("-") != 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            start_str, end_str = part.split("-", 1)
            start_str = start_str.strip()
            end_str = end_str.strip()
            if not start_str and not end_str:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            try:
                start = 1 if not start_str else int(start_str)
                end = total_pages if not end_str else int(end_str)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if start < 1 or end < 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': page numbers must be >= 1.",
                )
            if start > end:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': start page {start} exceeds "
                    f"end page {end} in range '{part}'.",
                )
            for p in range(start, end + 1):
                if p < 1 or p > total_pages:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Page {p} out of range: file has {total_pages} pages.",
                    )
                result.append(p - 1)
        else:
            try:
                p = int(part)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if p < 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': page numbers must be >= 1.",
                )
            if p > total_pages:
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {p} out of range: file has {total_pages} pages.",
                )
            result.append(p - 1)
    if not result:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pages specification '{pages}': no pages selected. "
            "Expected formats like '1-3', '5', '3-' or 'all'.",
        )
    return result


def merge_pdfs_task(
    file_paths: list[str], original_filename: str = None, plan=None
) -> tuple[bytes, str]:
    """Combine PDFs in order and return the merged PDF bytes.

    When ``plan`` is missing/empty, appends each file whole (legacy
    behavior). Otherwise ``plan`` is a JSON string (or decoded list) of
    ``{"file": <zero-based index>, "pages": "<range|all>"}`` blocks applied
    in order; e.g. ``[{"file": 0, "pages": "1-2"}]``.
    """
    logger.info(f"Starting PDF merge task for files: {file_paths}")

    resolved_paths = resolve_paths(file_paths)

    parsed_plan = _parse_merge_plan(plan, len(resolved_paths))

    output_filename = f"merged_{uuid.uuid4()}.pdf"
    tmp_dir = ensure_tmp_dir()
    output_path = os.path.join(tmp_dir, output_filename)

    merger = PdfWriter()
    try:
        if parsed_plan is None:
            for fp in resolved_paths:
                if os.path.exists(fp):
                    merger.append(fp)
                else:
                    logger.error(f"Merge file not found: {fp}")
                    raise FileNotFoundError(f"File to merge not found: {fp}")
        else:
            readers: list[PdfReader] = []
            for fp in resolved_paths:
                if not os.path.exists(fp):
                    logger.error(f"Merge file not found: {fp}")
                    raise FileNotFoundError(f"File to merge not found: {fp}")
                readers.append(PdfReader(fp))
            for block in parsed_plan:
                file_index = block["file"]
                pages_spec = block["pages"]
                total_pages = len(readers[file_index].pages)
                for page_num in _parse_merge_pages_spec(pages_spec, total_pages, file_index):
                    merger.add_page(readers[file_index].pages[page_num])

        with open(output_path, "wb") as f:
            merger.write(f)
        merger.close()

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_merged{ext}"
        )
        return data, download_name

    except Exception as e:
        logger.error(f"Merge task failed: {e}")
        raise e
    finally:
        try:
            merger.close()
        except Exception:
            pass
        for fp in resolved_paths:
            if fp and os.path.exists(fp):
                try:
                    os.remove(fp)
                except Exception as err:
                    logger.warning(f"Failed to remove input PDF: {err}")
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except Exception:
                pass


def split_pdf_task(file_path: str, mode: str, pages_spec: str, original_filename: str = None) -> tuple[bytes, str]:
    """Split by custom range (PDF) or every page (ZIP) and return the bytes."""
    logger.info(f"Starting split task. Mode: {mode}, Spec: {pages_spec}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File to split not found: {file_path}")

    tmp_dir = ensure_tmp_dir()

    output_filename = ""
    output_path = ""

    try:
        reader = PdfReader(file_path)
        total_pages = len(reader.pages)

        if mode.lower() == "all" and total_pages > 1:
            output_filename = f"split_{uuid.uuid4()}.zip"
            output_path = os.path.join(tmp_dir, output_filename)

            with zipfile.ZipFile(output_path, "w") as zipf:
                for page_num in range(total_pages):
                    writer = PdfWriter()
                    writer.add_page(reader.pages[page_num])

                    page_name = f"page_{page_num + 1}.pdf"
                    page_temp_path = os.path.join(tmp_dir, page_name)

                    with open(page_temp_path, "wb") as f:
                        writer.write(f)

                    zipf.write(page_temp_path, page_name)
                    os.remove(page_temp_path)

            download_name = _download_name(
                original_filename, output_filename, lambda base, ext: f"{base}_split.zip"
            )
        else:
            if mode.lower() == "all":
                pages_to_extract = [0]
            else:
                pages_to_extract = []
                for part in pages_spec.split(","):
                    part = part.strip()
                    if not part:
                        continue
                    if "-" in part:
                        start_str, end_str = part.split("-")
                        pages_to_extract.extend(range(int(start_str) - 1, int(end_str)))
                    else:
                        pages_to_extract.append(int(part) - 1)

            writer = PdfWriter()
            for page_num in pages_to_extract:
                if 0 <= page_num < total_pages:
                    writer.add_page(reader.pages[page_num])

            output_filename = f"split_{uuid.uuid4()}.pdf"
            output_path = os.path.join(tmp_dir, output_filename)
            with open(output_path, "wb") as f:
                writer.write(f)

            download_name = _download_name(
                original_filename, output_filename, lambda base, ext: f"{base}_split.pdf"
            )

        data = read_bytes(output_path)
        return data, download_name

    except Exception as e:
        logger.error(f"Split task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def pdf_to_images_task(file_path: str, img_format: str, dpi: int, original_filename: str = None) -> tuple[bytes, str]:
    """Rasterize PDF pages; single page returns an image, otherwise a ZIP."""
    logger.info(f"Starting PDF to Image task. Format: {img_format}, DPI: {dpi}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    tmp_dir = ensure_tmp_dir()

    output_filename = ""
    output_path = ""

    try:
        images = convert_from_path(file_path, dpi=dpi)

        if len(images) == 1:
            output_filename = f"image_{uuid.uuid4()}.{img_format.lower()}"
            output_path = os.path.join(tmp_dir, output_filename)
            images[0].save(output_path, format=img_format.upper())

            download_name = _download_name(
                original_filename,
                output_filename,
                lambda base, ext: f"{base}.{img_format.lower()}",
            )
        else:
            output_filename = f"images_{uuid.uuid4()}.zip"
            output_path = os.path.join(tmp_dir, output_filename)
            with zipfile.ZipFile(output_path, "w") as zipf:
                for idx, img in enumerate(images):
                    img_name = f"page_{idx + 1}.{img_format.lower()}"
                    temp_img_path = os.path.join(tmp_dir, img_name)

                    img.save(temp_img_path, format=img_format.upper())
                    zipf.write(temp_img_path, img_name)
                    os.remove(temp_img_path)

            download_name = _download_name(
                original_filename, output_filename, lambda base, ext: f"{base}_images.zip"
            )

        data = read_bytes(output_path)
        return data, download_name
    except Exception as e:
        logger.error(f"PDF to Image conversion failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def images_to_pdf_task(file_paths: list[str], original_filename: str = None) -> tuple[bytes, str]:
    """Compile images into a single PDF and return the bytes."""
    logger.info(f"Starting Images to PDF task for files: {file_paths}")

    resolved_paths = resolve_paths(file_paths)

    output_filename = f"compiled_{uuid.uuid4()}.pdf"
    tmp_dir = ensure_tmp_dir()
    output_path = os.path.join(tmp_dir, output_filename)

    try:
        valid_paths = [fp for fp in resolved_paths if os.path.exists(fp)]
        if not valid_paths:
            raise Exception("No valid image files exist to compile.")

        pdf_bytes = img2pdf.convert(valid_paths, rotation=img2pdf.Rotation.ifvalid)
        write_bytes(output_path, pdf_bytes)

        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_compiled.pdf"
        )
        return pdf_bytes, download_name
    except Exception as e:
        logger.error(f"Images to PDF task failed: {e}")
        raise e
    finally:
        for fp in resolved_paths:
            if fp and os.path.exists(fp):
                try:
                    os.remove(fp)
                except Exception:
                    pass
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except Exception:
                pass


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


def pdf_to_docx_task(file_path: str, original_filename: str = None) -> tuple[bytes, str]:
    """Convert a PDF to DOCX and return the bytes."""
    logger.info(f"Starting PDF to DOCX task for {file_path}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"converted_{uuid.uuid4()}.docx"
    output_path = os.path.join(output_dir, output_filename)

    try:
        cv = Converter(file_path)
        cv.convert(output_path, start=0, end=None)
        cv.close()

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}.docx"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"PDF to DOCX conversion failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


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
                subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=SUBPROCESS_TIMEOUT)
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


def create_watermark_pdf(output_path, text, color="gray", opacity=0.3, rotation=45, font_size=48):
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import letter

    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter
    c.translate(width / 2.0, height / 2.0)
    c.rotate(rotation)
    c.setFillAlpha(opacity)

    colors_map = {
        "red": "#FF0000",
        "green": "#00FF00",
        "blue": "#0000FF",
        "gray": "#808080",
        "black": "#000000",
    }
    hex_color = colors_map.get(color.lower(), "#808080")
    c.setFillColor(HexColor(hex_color))
    c.setFont("Helvetica", font_size)
    c.drawCentredString(0, 0, text)
    c.save()


def create_page_number_pdf(output_path, width, height, current_page, total_pages, position):
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(output_path, pagesize=(width, height))
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(0.5, 0.5, 0.5)

    text = f"Page {current_page} of {total_pages}"
    margin = 36
    x = width / 2.0
    y = margin

    if "top" in position:
        y = height - margin

    if "left" in position:
        x = margin
        align = "left"
    elif "right" in position:
        x = width - margin
        align = "right"
    else:
        x = width / 2.0
        align = "center"

    if align == "left":
        c.drawString(x, y, text)
    elif align == "right":
        c.drawRightString(x, y, text)
    else:
        c.drawCentredString(x, y, text)

    c.save()


def rotate_pdf_task(file_path: str, rotation: float, original_filename: str = None) -> tuple[bytes, str]:
    """Rotate all PDF pages and return the bytes.

    Multiples of 90 use the fast ``/Rotate`` path. Any other angle rotates
    page content via a transform onto a resized blank page.
    """
    logger.info(f"Starting PDF rotation task for {file_path}. Rotation angle: {rotation}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"rotated_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        reader = PdfReader(file_path)
        writer = PdfWriter()

        rot = float(rotation)
        for page in reader.pages:
            existing = float(page.rotation or 0)
            theta = rot + existing
            if theta % 90 == 0:
                page.rotate(int(rot) if rot.is_integer() else rot)
                writer.add_page(page)
                continue

            box = page.cropbox if "/CropBox" in page else page.mediabox
            x0, y0, x1, y1 = float(box.left), float(box.bottom), float(box.right), float(box.top)
            w = x1 - x0
            h = y1 - y0

            rad = math.radians(theta)
            cos_a = math.cos(rad)
            sin_a = math.sin(rad)
            corners = ((0, 0), (w, 0), (w, h), (0, h))
            xs = [x * cos_a + y * sin_a for x, y in corners]
            ys = [-x * sin_a + y * cos_a for x, y in corners]
            W = round(max(xs) - min(xs), 3)
            H = round(max(ys) - min(ys), 3)
            tx = round(-min(xs), 3)
            ty = round(-min(ys), 3)

            new_page = writer.add_blank_page(width=W, height=H)
            transform = Transformation().translate(-x0, -y0).rotate(-theta).translate(tx, ty)
            new_page.merge_transformed_page(page, transform)
            new_page.mediabox = RectangleObject((0, 0, W, H))
            new_page.cropbox = RectangleObject((0, 0, W, H))

        with open(output_path, "wb") as f:
            writer.write(f)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_rotated{ext}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Rotation task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def organize_pdf_task(file_path: str, page_order: str, original_filename: str = None) -> tuple[bytes, str]:
    """Reorder/delete PDF pages and return the bytes."""
    logger.info(f"Starting PDF organization task for {file_path}. Order: {page_order}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"organized_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        reader = PdfReader(file_path)
        writer = PdfWriter()

        indices = [int(p.strip()) - 1 for p in page_order.split(",") if p.strip()]
        total_pages = len(reader.pages)

        for idx in indices:
            if 0 <= idx < total_pages:
                writer.add_page(reader.pages[idx])

        with open(output_path, "wb") as f:
            writer.write(f)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_organized{ext}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Organization task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def watermark_pdf_task(
    file_path: str,
    text: str,
    color: str = "gray",
    opacity: float = 0.3,
    rotation: int = 45,
    font_size: int = 48,
    pages: str = "all",
    original_filename: str = None,
) -> tuple[bytes, str]:
    """Apply a text watermark to selected PDF pages and return the bytes."""
    logger.info(f"Starting PDF watermarking task for {file_path}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"watermarked_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        temp_watermark_pdf = os.path.join(output_dir, f"temp_wm_{uuid.uuid4()}.pdf")
        create_watermark_pdf(temp_watermark_pdf, text, color, opacity, rotation, font_size)

        reader = PdfReader(file_path)
        wm_reader = PdfReader(temp_watermark_pdf)
        wm_page = wm_reader.pages[0]

        total_pages = len(reader.pages)
        target_indices = set(_parse_watermark_pages(pages, total_pages))

        writer = PdfWriter()
        for idx, page in enumerate(reader.pages):
            if idx in target_indices:
                page.merge_page(wm_page)
            writer.add_page(page)

        with open(output_path, "wb") as f:
            writer.write(f)

        if os.path.exists(temp_watermark_pdf):
            os.remove(temp_watermark_pdf)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_watermarked{ext}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Watermark task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def add_page_numbers_task(
    file_path: str, position: str = "bottom-center", original_filename: str = None
) -> tuple[bytes, str]:
    """Stamp page numbers onto all PDF pages and return the bytes."""
    logger.info(f"Starting page numbering task for {file_path}. Position: {position}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"numbered_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        reader = PdfReader(file_path)
        writer = PdfWriter()
        total_pages = len(reader.pages)

        for idx, page in enumerate(reader.pages):
            box = page.mediabox
            width = float(box.width)
            height = float(box.height)

            temp_pagenum_pdf = os.path.join(output_dir, f"temp_num_{uuid.uuid4()}.pdf")
            create_page_number_pdf(temp_pagenum_pdf, width, height, idx + 1, total_pages, position)

            num_reader = PdfReader(temp_pagenum_pdf)
            page.merge_page(num_reader.pages[0])
            writer.add_page(page)

            if os.path.exists(temp_pagenum_pdf):
                os.remove(temp_pagenum_pdf)

        with open(output_path, "wb") as f:
            writer.write(f)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_numbered{ext}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Page numbering task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def ocr_pdf_task(file_path: str, language: str = "eng", original_filename: str = None) -> tuple[bytes, str]:
    """Run OCR via ocrmypdf and return the processed PDF bytes."""
    logger.info(f"Starting OCR task for {file_path}. Language: {language}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"ocr_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        cmd = ["ocrmypdf", "--skip-text", "-l", language, file_path, output_path]
        logger.info(f"Running OCR command: {' '.join(cmd)}")
        subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=SUBPROCESS_TIMEOUT)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_ocr{ext}"
        )
        return data, download_name
    except FileNotFoundError:
        logger.error("ocrmypdf command not found in PATH.")
        raise Exception("OCR tool is not installed or configured on the server. Requires ocrmypdf and Tesseract OCR.")
    except subprocess.TimeoutExpired:
        logger.error("OCR timed out after %s seconds", SUBPROCESS_TIMEOUT)
        raise Exception(SUBPROCESS_TIMEOUT_MESSAGE)
    except subprocess.CalledProcessError as e:
        logger.error(f"OCR command failed (code {e.returncode}): {e.stderr}")
        raise Exception(f"OCR processing failed: {e.stderr or e.stdout}")
    except Exception as e:
        logger.error(f"OCR task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)
