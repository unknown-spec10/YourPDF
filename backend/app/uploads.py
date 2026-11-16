"""Persist uploads to the tmp dir and return backend-relative paths."""

import os
import shutil
import uuid

from fastapi import HTTPException, UploadFile

from app.storage import ensure_tmp_dir


def get_tmp_dir() -> str:
    return ensure_tmp_dir()


def save_upload_file(file: UploadFile, extension: str, prefix: str = "upload") -> str:
    """Persist a single upload and return its ``tmp/...`` relative path."""
    tmp_dir = get_tmp_dir()
    filename = f"{prefix}_{uuid.uuid4()}{extension}"
    host_file_path = os.path.join(tmp_dir, filename)

    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    return os.path.join("tmp", filename)


def save_multi_upload(
    files: list[UploadFile],
    extension: str = ".pdf",
    prefix: str = "upload",
    preserve_extension: bool = False,
    error_prefix: str = "Failed to save upload files",
) -> list[str]:
    """Persist multiple uploads; on failure remove the partial files and raise 500."""
    tmp_dir = get_tmp_dir()
    saved_paths: list[str] = []
    try:
        for file in files:
            ext = os.path.splitext(file.filename.lower())[1] if preserve_extension else extension
            filename = f"{prefix}_{uuid.uuid4()}{ext}"
            host_file_path = os.path.join(tmp_dir, filename)
            with open(host_file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_paths.append(os.path.join("tmp", filename))
    except Exception as e:
        # Roll back against the *tmp root*, not the backend root: with YOURPDF_TMP set the two
        # differ, and the old code left the partial uploads behind.
        for saved in saved_paths:
            abs_path = os.path.join(tmp_dir, os.path.basename(saved))
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                except OSError:
                    pass
        raise HTTPException(status_code=500, detail=f"{error_prefix}: {str(e)}")
    return saved_paths


def save_uploaded_image(file: UploadFile, prefix: str = "image_upload") -> tuple[str, str]:
    ext = os.path.splitext(file.filename.lower())[1]
    tmp_dir = get_tmp_dir()

    filename = f"{prefix}_{uuid.uuid4()}{ext}"
    host_file_path = os.path.join(tmp_dir, filename)

    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    return filename, os.path.join("tmp", filename)
