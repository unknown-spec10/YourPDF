"""Office + generic conversion route handlers (synchronous)."""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.http_io import file_response
from app.errors import DomainError
from app.limits import validate_total_size
from app.tasks import (
    merge_docx_task,
    docx_to_images_task,
    pptx_to_pdf_task,
    pptx_to_images_task,
    merge_pptx_task,
)
from app.uploads import save_multi_upload, save_upload_file
from app.validation import validate_dpi, validate_extension, validate_file_size

router = APIRouter()


@router.post("/office/merge-docx")
def merge_docx(
    files: list[UploadFile] = File(...)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 Word files are required to merge.")
    for file in files:
        validate_file_size(file)
    validate_total_size(files)
    for file in files:
        validate_extension(file.filename, (".docx",), f"File {file.filename} is not a valid DOCX document.")

    saved_paths = save_multi_upload(files, ".docx")

    data, download_name = merge_docx_task(saved_paths, original_filename=files[0].filename)
    return file_response(data, download_name)


@router.post("/office/docx-to-images")
def docx_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150),
    pages: str = Form("all")
):
    validate_file_size(file)
    validate_extension(file.filename, (".docx",), "Only DOCX files are supported.")
    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")

    validate_dpi(dpi)
    relative_path = save_upload_file(file, ".docx")

    data, download_name = docx_to_images_task(relative_path, format, dpi, original_filename=file.filename, pages=pages)
    return file_response(data, download_name)


@router.post("/office/pptx-to-pdf")
def pptx_to_pdf(
    file: UploadFile = File(...)
):
    validate_file_size(file)
    validate_extension(file.filename, (".pptx",), "Only PPTX files are supported.")

    relative_path = save_upload_file(file, ".pptx")

    data, download_name = pptx_to_pdf_task(relative_path, original_filename=file.filename)
    return file_response(data, download_name)


@router.post("/office/pptx-to-images")
def pptx_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150),
    pages: str = Form("all")
):
    validate_file_size(file)
    validate_extension(file.filename, (".pptx",), "Only PPTX files are supported.")
    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")

    validate_dpi(dpi)
    relative_path = save_upload_file(file, ".pptx")

    data, download_name = pptx_to_images_task(relative_path, format, dpi, original_filename=file.filename, pages=pages)
    return file_response(data, download_name)


@router.post("/office/merge-pptx")
def merge_pptx(
    files: list[UploadFile] = File(...)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 PowerPoint files are required to merge.")
    for file in files:
        validate_file_size(file)
    validate_total_size(files)
    for file in files:
        validate_extension(file.filename, (".pptx",), f"File {file.filename} is not a valid PPTX document.")

    saved_paths = save_multi_upload(files, ".pptx")

    data, download_name = merge_pptx_task(saved_paths, original_filename=files[0].filename)
    return file_response(data, download_name)
