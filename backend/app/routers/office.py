"""Office + generic conversion route handlers (synchronous)."""

import os

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response

from app.tasks import (
    merge_docx_task,
    docx_to_images_task,
    pptx_to_pdf_task,
    pptx_to_images_task,
    merge_pptx_task,
)
from app.uploads import save_multi_upload, save_upload_file
from app.validation import validate_extension, validate_file_size

router = APIRouter()


def _media_type_for(filename: str) -> str:
    ext = os.path.splitext(filename.lower())[1]
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".zip": "application/zip",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }.get(ext, "application/octet-stream")


def _file_response(data: bytes, download_name: str) -> Response:
    return Response(
        content=data,
        media_type=_media_type_for(download_name),
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@router.post("/office/merge-docx")
def merge_docx(
    files: list[UploadFile] = File(...)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 Word files are required to merge.")
    for file in files:
        validate_file_size(file, 30)
    for file in files:
        validate_extension(file.filename, (".docx",), f"File {file.filename} is not a valid DOCX document.")

    saved_paths = save_multi_upload(files, ".docx")

    try:
        data, download_name = merge_docx_task(saved_paths, original_filename=files[0].filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/office/docx-to-images")
def docx_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".docx",), "Only DOCX files are supported.")
    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")

    relative_path = save_upload_file(file, ".docx")

    try:
        data, download_name = docx_to_images_task(relative_path, format, dpi, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/office/pptx-to-pdf")
def pptx_to_pdf(
    file: UploadFile = File(...)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pptx",), "Only PPTX files are supported.")

    relative_path = save_upload_file(file, ".pptx")

    try:
        data, download_name = pptx_to_pdf_task(relative_path, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/office/pptx-to-images")
def pptx_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pptx",), "Only PPTX files are supported.")
    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")

    relative_path = save_upload_file(file, ".pptx")

    try:
        data, download_name = pptx_to_images_task(relative_path, format, dpi, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/office/merge-pptx")
def merge_pptx(
    files: list[UploadFile] = File(...)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 PowerPoint files are required to merge.")
    for file in files:
        validate_file_size(file, 30)
    for file in files:
        validate_extension(file.filename, (".pptx",), f"File {file.filename} is not a valid PPTX document.")

    saved_paths = save_multi_upload(files, ".pptx")

    try:
        data, download_name = merge_pptx_task(saved_paths, original_filename=files[0].filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)
