"""Synchronous image processing functions (in-request, no queue)."""

import io
import base64
import logging
import os
import sys
import uuid

from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageFont

from app.tasks.common import cleanup_paths, read_bytes, resolve_path

logger = logging.getLogger(__name__)


def _download_name(original_filename: str | None, fallback: str, build) -> str:
    if original_filename:
        base, ext_orig = os.path.splitext(original_filename)
        return build(base, ext_orig)
    return fallback


def compress_image_task(file_path: str, quality: int, original_filename: str = None) -> tuple[bytes, str]:
    """Compress an image (JPEG, PNG, WEBP) and return the bytes."""
    logger.info(f"Starting image compression task for {file_path} with quality={quality}")

    file_path = resolve_path(file_path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise ValueError(f"Unsupported image format: {ext}")

    output_filename = f"compressed_{uuid.uuid4()}{ext}"
    output_dir = os.path.dirname(file_path)
    output_path = os.path.join(output_dir, output_filename)

    try:
        with Image.open(file_path) as img:
            if ext in [".jpg", ".jpeg"] and img.mode in ("RGBA", "LA"):
                img = img.convert("RGB")

            if ext in [".jpg", ".jpeg"]:
                img.save(output_path, "JPEG", quality=quality, optimize=True)
            elif ext == ".webp":
                img.save(output_path, "WEBP", quality=quality, optimize=True)
            elif ext == ".png":
                if quality < 50:
                    img = img.quantize(colors=128).convert("RGBA")
                elif quality < 80:
                    img = img.quantize(colors=256).convert("RGBA")
                img.save(output_path, "PNG", optimize=True)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, e: f"{base}_compressed{e}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Image compression failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def resize_image_task(
    file_path: str,
    width: int = None,
    height: int = None,
    percentage: int = None,
    maintain_aspect: bool = True,
    original_filename: str = None,
) -> tuple[bytes, str]:
    """Resize an image by width/height pixels or percentage; return the bytes."""
    logger.info(f"Starting image resize task for {file_path}")

    file_path = resolve_path(file_path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    output_filename = f"resized_{uuid.uuid4()}{ext}"
    output_dir = os.path.dirname(file_path)
    output_path = os.path.join(output_dir, output_filename)

    try:
        with Image.open(file_path) as img:
            orig_w, orig_h = img.size

            if percentage is not None:
                new_w = int(orig_w * (percentage / 100.0))
                new_h = int(orig_h * (percentage / 100.0))
            else:
                if width and height:
                    if maintain_aspect:
                        ratio = min(width / orig_w, height / orig_h)
                        new_w = int(orig_w * ratio)
                        new_h = int(orig_h * ratio)
                    else:
                        new_w = width
                        new_h = height
                elif width:
                    new_w = width
                    new_h = int(orig_h * (width / orig_w))
                elif height:
                    new_h = height
                    new_w = int(orig_w * (height / orig_h))
                else:
                    new_w, new_h = orig_w, orig_h

            new_w = max(1, new_w)
            new_h = max(1, new_h)

            resized_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            resized_img.save(output_path, save_all=True if ext == ".gif" else False)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, e: f"{base}_resized{e}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Image resize failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def crop_image_task(
    file_path: str, x: int, y: int, width: int, height: int, original_filename: str = None
) -> tuple[bytes, str]:
    """Crop an image to a bounding box and return the bytes."""
    logger.info(f"Starting image crop task for {file_path} at x={x}, y={y}, w={width}, h={height}")

    file_path = resolve_path(file_path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    output_filename = f"cropped_{uuid.uuid4()}{ext}"
    output_dir = os.path.dirname(file_path)
    output_path = os.path.join(output_dir, output_filename)

    try:
        with Image.open(file_path) as img:
            orig_w, orig_h = img.size

            x = max(0, min(x, orig_w))
            y = max(0, min(y, orig_h))
            width = max(1, min(width, orig_w - x))
            height = max(1, min(height, orig_h - y))

            box = (x, y, x + width, y + height)
            cropped_img = img.crop(box)
            cropped_img.save(output_path)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, e: f"{base}_cropped{e}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Image crop failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def convert_image_task(
    file_path: str, target_format: str, original_filename: str = None, render_width: int | None = None
) -> tuple[bytes, str]:
    """Convert an image to the target format and return the bytes."""
    logger.info(f"Starting image conversion task for {file_path} to format {target_format}")

    file_path = resolve_path(file_path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    target_format = target_format.lower()
    valid_formats = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp", "bmp": "bmp", "tiff": "tiff", "svg": "svg"}

    if target_format not in valid_formats:
        raise ValueError(f"Unsupported target format: {target_format}")

    out_ext = f".{target_format}"
    if out_ext == ".jpeg":
        out_ext = ".jpg"

    input_ext = os.path.splitext(file_path)[1].lower()

    # SVG target: pass-through for SVG inputs, PNG-in-SVG wrapper otherwise.
    if target_format == "svg":
        try:
            if input_ext == ".svg":
                data = read_bytes(file_path)
            else:
                with Image.open(file_path) as img:
                    if img.mode in ("RGBA", "LA", "PA"):
                        img = img.convert("RGBA")
                    elif img.mode == "P":
                        img = img.convert("RGBA" if "transparency" in img.info else "RGB")
                    elif img.mode != "RGB":
                        img = img.convert("RGB")
                    w, h = img.size
                    buf = io.BytesIO()
                    img.save(buf, "PNG")
                    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                    svg_text = (
                        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
                        f'viewBox="0 0 {w} {h}">'
                        f'<image width="{w}" height="{h}" href="data:image/png;base64,{b64}"/>'
                        f"</svg>"
                    )
                    data = svg_text.encode("utf-8")
            download_name = _download_name(
                original_filename, f"converted_{uuid.uuid4()}{out_ext}", lambda base, e: f"{base}{out_ext}"
            )
            return data, download_name
        except Exception as e:
            logger.error(f"Image conversion failed: {e}")
            raise e
        finally:
            cleanup_paths(file_path)

    pillow_format = valid_formats[target_format]

    output_filename = f"converted_{uuid.uuid4()}{out_ext}"
    output_dir = os.path.dirname(file_path)
    output_path = os.path.join(output_dir, output_filename)

    try:
        if input_ext == ".svg":
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                svg_text = f.read()
            try:
                import resvg_py

                png_bytes = resvg_py.svg_to_bytes(svg_string=svg_text, width=render_width or None)
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=400, detail="SVG could not be rendered. Check that the file is a valid SVG.")
            with Image.open(io.BytesIO(png_bytes)) as img:
                if pillow_format == "jpeg" and img.mode in ("RGBA", "LA"):
                    img = img.convert("RGB")
                elif img.mode == "P" and pillow_format not in ("png", "gif"):
                    img = img.convert("RGBA" if "transparency" in img.info else "RGB")

                img.save(output_path, pillow_format.upper())
        else:
            with Image.open(file_path) as img:
                if pillow_format == "jpeg" and img.mode in ("RGBA", "LA"):
                    img = img.convert("RGB")
                elif img.mode == "P" and pillow_format not in ("png", "gif"):
                    img = img.convert("RGBA" if "transparency" in img.info else "RGB")

                img.save(output_path, pillow_format.upper())

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, e: f"{base}{out_ext}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Image conversion failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def rotate_image_task(file_path: str, angle: int, original_filename: str = None) -> tuple[bytes, str]:
    """Rotate an image by 90/180/270 degrees and return the bytes."""
    logger.info(f"Starting image rotation task for {file_path} with angle={angle}")

    file_path = resolve_path(file_path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    output_filename = f"rotated_{uuid.uuid4()}{ext}"
    output_dir = os.path.dirname(file_path)
    output_path = os.path.join(output_dir, output_filename)

    try:
        with Image.open(file_path) as img:
            if angle == 90:
                rotated_img = img.transpose(Image.Transpose.ROTATE_270)
            elif angle == 180:
                rotated_img = img.transpose(Image.Transpose.ROTATE_180)
            elif angle == 270:
                rotated_img = img.transpose(Image.Transpose.ROTATE_90)
            else:
                rotated_img = img.rotate(-angle, expand=True)

            rotated_img.save(output_path)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, e: f"{base}_rotated{e}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Image rotation failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)


def watermark_image_task(
    file_path: str,
    text: str,
    color: str = "gray",
    opacity: float = 0.3,
    position: str = "center",
    original_filename: str = None,
) -> tuple[bytes, str]:
    """Overlay a text watermark on an image and return the bytes."""
    logger.info(f"Starting image watermark task for {file_path} with text='{text}'")

    file_path = resolve_path(file_path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    output_filename = f"watermarked_{uuid.uuid4()}{ext}"
    output_dir = os.path.dirname(file_path)
    output_path = os.path.join(output_dir, output_filename)

    try:
        with Image.open(file_path) as img:
            watermark_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(watermark_layer)

            colors_map = {
                "red": (255, 0, 0),
                "green": (0, 255, 0),
                "blue": (0, 0, 255),
                "gray": (128, 128, 128),
                "black": (0, 0, 0),
                "white": (255, 255, 255),
            }
            base_color = colors_map.get(color.lower(), (128, 128, 128))
            rgba_color = base_color + (int(opacity * 255),)

            font_size = max(16, int(img.size[0] / 20))

            try:
                font = ImageFont.load_default()
                if sys.platform == "win32":
                    font = ImageFont.truetype("arial.ttf", font_size)
                else:
                    font = ImageFont.truetype("LiberationSans-Regular.ttf", font_size)
            except IOError:
                font = ImageFont.load_default()

            w, h = img.size

            if hasattr(draw, "textbbox"):
                bbox = draw.textbbox((0, 0), text, font=font)
                text_w = bbox[2] - bbox[0]
                text_h = bbox[3] - bbox[1]
            else:
                text_w, text_h = draw.textsize(text, font=font) if hasattr(draw, "textsize") else (font_size * len(text) * 0.6, font_size)

            if position == "center":
                draw.text(((w - text_w) / 2, (h - text_h) / 2), text, font=font, fill=rgba_color)
            elif position == "top-left":
                draw.text((20, 20), text, font=font, fill=rgba_color)
            elif position == "top-right":
                draw.text((w - text_w - 20, 20), text, font=font, fill=rgba_color)
            elif position == "bottom-left":
                draw.text((20, h - text_h - 20), text, font=font, fill=rgba_color)
            elif position == "bottom-right":
                draw.text((w - text_w - 20, h - text_h - 20), text, font=font, fill=rgba_color)
            elif position == "tile":
                step_x = max(100, int(text_w * 1.5))
                step_y = max(100, int(text_h * 2.0))
                for x_pos in range(0, w, step_x):
                    for y_pos in range(0, h, step_y):
                        draw.text((x_pos, y_pos), text, font=font, fill=rgba_color)

            orig_rgba = img.convert("RGBA")
            watermarked_img = Image.alpha_composite(orig_rgba, watermark_layer)

            if ext in [".jpg", ".jpeg"]:
                watermarked_img.convert("RGB").save(output_path, "JPEG")
            else:
                watermarked_img.save(output_path)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, e: f"{base}_watermark{e}"
        )
        return data, download_name
    except Exception as e:
        logger.error(f"Image watermark failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)
