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
import uuid
import zipfile

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
)

from app.tasks.pdf.pages_spec import _parse_merge_pages_spec
from app.tasks.pdf.pages_spec import _parse_merge_plan
from app.tasks.common import download_name as _download_name
logger = logging.getLogger(__name__)

from app.limits import validate_render_budget  # noqa: E402  (kept beside the tasks it guards)



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
