"""Upload validation: allowed types, plus the per-tool shape checks.

Size caps and the render budget live in :mod:`app.limits`, because they are also enforced from
inside tasks where importing FastAPI would be wrong. Extension allowlists stay here: they are
per-endpoint validation, called only from routers.
"""

import os

from fastapi import HTTPException, UploadFile

from app.errors import InvalidRequest
from app.limits import UploadTooLarge, validate_file_size

__all__ = [
    "validate_extension",
    "validate_image_file",
    "validate_file_size",
    "validate_dpi",
    "UploadTooLarge",
]

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

# Rasterising cost grows with the square of DPI: one A4 page at 2400 DPI is ~1 GB of pixels,
# which is a one-request OOM. The UI offers 100-300, so anything outside that is not a user.
MIN_DPI = 72
MAX_DPI = 300


def validate_dpi(dpi: int) -> int:
    """Clamp-validate the render resolution. Rejects rather than silently clamping, so a caller
    that asks for 1200 learns the limit instead of getting a different file than it requested."""
    if not (MIN_DPI <= dpi <= MAX_DPI):
        raise InvalidRequest(f"Resolution must be between {MIN_DPI} and {MAX_DPI} DPI.")
    return dpi


def validate_extension(filename: str, allowed_extensions, detail: str) -> str:
    """Case-insensitive extension check. Returns the lowered extension.

    Raises HTTPException(400) with the caller-provided ``detail`` so that
    each endpoint keeps its byte-identical error message.
    """
    ext = os.path.splitext(filename.lower())[1]
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=detail)
    return ext


def validate_image_file(file: UploadFile) -> None:
    # Size is enforced by the shared limit; the type check is what makes it an image upload.
    validate_file_size(file)

    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, and WEBP image files are supported.")
