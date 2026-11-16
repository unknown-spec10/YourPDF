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

import img2pdf
from app.errors import DomainError, InvalidRequest
from pdf2image import convert_from_path
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

from app.tasks.pdf.pages_spec import _parse_watermark_pages
from app.tasks.common import download_name as _download_name
logger = logging.getLogger(__name__)

from app.limits import validate_render_budget  # noqa: E402  (kept beside the tasks it guards)



def pdf_to_images_task(
    file_path: str, img_format: str, dpi: int, original_filename: str = None, pages: str = "all"
) -> tuple[bytes, str]:
    """Rasterize PDF pages; single page returns an image, otherwise a ZIP.

    ``pages`` uses the shared ``'all'`` / ``'1-3, 5'`` spec (same parser as
    watermark/sign). Only the selected pages are rendered. A single rendered
    image returns as a direct image (like the historic single-page case);
    multiple rendered images return as a ZIP.
    """
    logger.info(f"Starting PDF to Image task. Format: {img_format}, DPI: {dpi}, Pages: {pages}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    if pages is None:
        pages = "all"

    tmp_dir = ensure_tmp_dir()

    output_filename = ""
    output_path = ""

    try:
        reader = PdfReader(file_path)
        total_pages = len(reader.pages)
        target_indices = _parse_watermark_pages(pages, total_pages)

        is_all = isinstance(pages, str) and pages.strip().lower() == "all"

        # Budget the *selection*, not the document: rendering pages 1-2 of a 500-page file is
        # fine, rendering all 500 is what exhausts an instance and the browser's download.
        validate_render_budget(total_pages if is_all else len(target_indices), "pages")

        images = []
        # Original page numbers for sensible ZIP entry names on subsets.
        rendered_page_numbers: list[int] = []
        if is_all:
            images = convert_from_path(file_path, dpi=dpi)
            rendered_page_numbers = list(range(1, len(images) + 1))
        else:
            for idx in target_indices:
                # Render ONLY the selected page (1-based for poppler).
                single = convert_from_path(file_path, dpi=dpi, first_page=idx + 1, last_page=idx + 1)
                images.extend(single)
                rendered_page_numbers.extend([idx + 1] * len(single))

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
                for pos, img in enumerate(images):
                    page_no = rendered_page_numbers[pos] if pos < len(rendered_page_numbers) else pos + 1
                    img_name = f"page_{page_no}.{img_format.lower()}"
                    temp_img_path = os.path.join(tmp_dir, f"tmpimg_{uuid.uuid4()}_{pos}.{img_format.lower()}")

                    img.save(temp_img_path, format=img_format.upper())
                    zipf.write(temp_img_path, img_name)
                    os.remove(temp_img_path)

            download_name = _download_name(
                original_filename, output_filename, lambda base, ext: f"{base}_images.zip"
            )

        data = read_bytes(output_path)
        return data, download_name
    except DomainError:
        raise
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
