"""Shared upload persistence helpers (extracted from app.main)."""
import os
import shutil
import uuid

from fastapi import HTTPException, UploadFile


def get_backend_root() -> str:
    app_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(app_dir)


def get_tmp_dir() -> str:
    tmp_dir = os.path.join(get_backend_root(), "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    return tmp_dir


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
    """Persist multiple uploads; on failure remove partial files and raise 500."""
    tmp_dir = get_tmp_dir()
    backend_root = get_backend_root()
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
        for p in saved_paths:
            abs_p = os.path.join(backend_root, p)
            if os.path.exists(abs_p):
                os.remove(abs_p)
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
