"""Synchronous PDF processing functions (in-request, no queue).

Each function takes an absolute (or backend-relative) input path, runs the
same conversion logic the old queued tasks used to run, and returns
``(output_bytes, download_filename)``. Callers stream the bytes straight
back as a ``Response``. ``extract_text`` is the exception: with
``export_txt=False`` it returns ``(text, None)`` and the router replies
with JSON.
"""

import logging
import math
import os
import uuid

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

from app.tasks.common import download_name as _download_name
logger = logging.getLogger(__name__)

from app.limits import validate_render_budget  # noqa: E402  (kept beside the tasks it guards)



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
