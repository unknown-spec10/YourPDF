"""Shared upload validation helpers (extracted from app.main)."""
import os

from fastapi import HTTPException, UploadFile

MAX_FILE_SIZE_MB = 30

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def validate_file_size(file: UploadFile, max_size_mb: int = 30) -> None:
    max_size_bytes = max_size_mb * 1024 * 1024
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size > max_size_bytes:
        raise HTTPException(status_code=400, detail=f"File size exceeds the maximum limit of {max_size_mb}MB.")


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
    # Validate file size
    validate_file_size(file, 30)

    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, and WEBP image files are supported.")
