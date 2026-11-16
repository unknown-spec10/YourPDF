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

from app.errors import DomainError, InvalidRequest
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
        # pypdf raises deep inside page access for encrypted input, which surfaced as an opaque
        # 500 instead of telling the user to unlock the file first.
        if reader.is_encrypted:
            raise InvalidRequest("This PDF is password-protected. Unlock it first, then watermark it.")
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

def _format_sign_date(dt) -> str:
    """Format like "Oct 5, 2026" (no leading zero on day)."""
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"

def sign_pdf_task(
    file_path: str,
    signature_path: str,
    pages: str = "all",
    cx: float = 50.0,
    cy: float = 50.0,
    width: float = 25.0,
    rotation: float = 0.0,
    add_date: bool = False,
    date_text: str | None = None,
    date_size: float = 12.0,
    date_position: str = "below",
    original_filename: str = None,
) -> tuple[bytes, str]:
    """Overlay a signature image onto selected PDF pages and return the bytes.

    ``cx``/``cy`` are the CENTER of the signature box as percentages of the
    page's DISPLAYED dimensions measured from the TOP-LEFT; ``width`` is the
    box width as a percentage of the displayed page width (height follows the
    image aspect); ``rotation`` is degrees clockwise around the box center.
    Pages with a non-zero ``/Rotate`` get a corner-math un-rotation transform
    (same approach as ``rotate_pdf_task``); ``/Rotate`` 0 uses direct merge.
    """
    import io
    from datetime import datetime

    logger.info(f"Starting PDF signing task for {file_path}")

    file_path = resolve_path(file_path)
    signature_path = resolve_path(signature_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")
    if not os.path.exists(signature_path):
        raise InvalidRequest(status_code=400, detail="Signature image is invalid or unreadable.")

    # Defensive range checks (router enforces the same).
    if not (0 <= float(cx) <= 100):
        raise InvalidRequest(status_code=400, detail="Invalid cx. Must be between 0 and 100.")
    if not (0 <= float(cy) <= 100):
        raise InvalidRequest(status_code=400, detail="Invalid cy. Must be between 0 and 100.")
    if not (0 < float(width) <= 100):
        raise InvalidRequest(status_code=400, detail="Invalid width. Must be between 0 and 100, excluding 0.")
    if not (-360 <= float(rotation) <= 360):
        raise InvalidRequest(status_code=400, detail="Invalid rotation angle. Must be between -360 and 360 degrees.")
    if date_position not in ("below", "above"):
        raise InvalidRequest(status_code=400, detail="Invalid date_position. Must be 'below' or 'above'.")
    if not (6 <= float(date_size) <= 40):
        raise InvalidRequest(status_code=400, detail="Invalid date_size. Must be between 6 and 40.")
    _date_text = (date_text or "").strip()
    if len(_date_text) > 100:
        raise InvalidRequest(status_code=400, detail="Date text is too long (max 100 characters).")
    if not _date_text:
        _date_text = _format_sign_date(datetime.now())

    # Load signature with Pillow: must decode, keep alpha as RGBA PNG bytes.
    try:
        from PIL import Image as PILImage

        with PILImage.open(signature_path) as im:
            im.load()
            src_w, src_h = im.size
            if src_w <= 0 or src_h <= 0:
                raise ValueError("empty image")
            rgba = im.convert("RGBA")
            png_buf = io.BytesIO()
            rgba.save(png_buf, format="PNG")
            png_bytes = png_buf.getvalue()
    except DomainError:
        raise
    except Exception:
        raise InvalidRequest(status_code=400, detail="Signature image is invalid or unreadable.")

    output_dir = os.path.dirname(file_path)
    output_filename = f"signed_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        from reportlab.lib.colors import HexColor
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas

        reader = PdfReader(file_path)
        total_pages = len(reader.pages)
        target_indices = set(_parse_watermark_pages(pages, total_pages))

        writer = PdfWriter()
        for idx, page in enumerate(reader.pages):
            if idx not in target_indices:
                writer.add_page(page)
                continue

            existing_rot = float(page.rotation or 0)
            rot_norm = existing_rot % 360

            box = page.cropbox if "/CropBox" in page else page.mediabox
            x0, y0 = float(box.left), float(box.bottom)
            x1, y1 = float(box.right), float(box.top)
            w = x1 - x0
            h = y1 - y0

            # DISPLAY space (swap for /Rotate 90/270).
            if rot_norm % 180 == 90:
                disp_w, disp_h = h, w
            else:
                disp_w, disp_h = w, h

            sig_box_w = disp_w * float(width) / 100.0
            # Guard against degenerate widths (router blocks 0, but be safe).
            if sig_box_w <= 0:
                sig_box_w = 1.0
            sig_box_h = sig_box_w * (float(src_h) / float(src_w))

            x_center = float(cx) / 100.0 * disp_w
            y_center = disp_h - float(cy) / 100.0 * disp_h

            overlay_buf = io.BytesIO()
            c = canvas.Canvas(overlay_buf, pagesize=(disp_w, disp_h))
            c.saveState()
            c.translate(x_center, y_center)
            # reportlab rotate() is CCW; clockwise `rotation` => rotate(-rotation).
            c.rotate(-float(rotation))
            img_reader = ImageReader(io.BytesIO(png_bytes))
            c.drawImage(
                img_reader,
                -sig_box_w / 2.0,
                -sig_box_h / 2.0,
                width=sig_box_w,
                height=sig_box_h,
                mask="auto",
            )
            if add_date:
                font_size = max(6.0, sig_box_w * float(date_size) / 100.0)
                c.setFont("Helvetica", font_size)
                c.setFillColor(HexColor("#444444"))
                gap = 4.0
                if date_position == "above":
                    y_date = sig_box_h / 2.0 + gap
                else:
                    y_date = -sig_box_h / 2.0 - gap - font_size
                c.drawCentredString(0, y_date, _date_text)
            c.restoreState()
            c.showPage()
            c.save()
            overlay_buf.seek(0)
            overlay_page = PdfReader(overlay_buf).pages[0]

            if rot_norm == 0:
                page.merge_page(overlay_page)
            else:
                # Un-rotate overlay (DISPLAY -> unrotated) with corner math,
                # same pattern as rotate_pdf_task's arbitrary-angle path.
                rad = math.radians(rot_norm)
                cos_a = math.cos(rad)
                sin_a = math.sin(rad)
                corners = ((0, 0), (disp_w, 0), (disp_w, disp_h), (0, disp_h))
                # Transformation.rotate(+R) is CCW: x'=cos*x - sin*y, y'=sin*x + cos*y.
                xs = [x * cos_a - y * sin_a for x, y in corners]
                ys = [x * sin_a + y * cos_a for x, y in corners]
                tx = x0 - min(xs)
                ty = y0 - min(ys)
                transform = Transformation().rotate(rot_norm).translate(tx, ty)
                page.merge_transformed_page(overlay_page, transform)
            writer.add_page(page)

        with open(output_path, "wb") as f:
            writer.write(f)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_signed{ext}"
        )
        return data, download_name
    except DomainError:
        raise
    except Exception as e:
        logger.error(f"Sign task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, signature_path, output_path)

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
