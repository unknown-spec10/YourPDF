"""PDF route handlers (synchronous in-request processing)."""
import os

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response

from app.pdf_security import protect_pdf_bytes, unlock_pdf_bytes
from app.tasks import (
    compress_pdf_task,
    merge_pdfs_task,
    split_pdf_task,
    pdf_to_images_task,
    images_to_pdf_task,
    extract_text_task,
    pdf_to_docx_task,
    docx_to_pdf_task,
    rotate_pdf_task,
    organize_pdf_task,
    watermark_pdf_task,
    add_page_numbers_task,
    ocr_pdf_task,
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
        ".txt": "text/plain",
        ".zip": "application/zip",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(ext, "application/octet-stream")


def _file_response(data: bytes, download_name: str) -> Response:
    return Response(
        content=data,
        media_type=_media_type_for(download_name),
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@router.post("/compress")
def compress_pdf(
    file: UploadFile = File(...),
    quality: str = Form("medium")
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = compress_pdf_task(relative_path, quality, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/merge")
def merge_pdfs(
    files: list[UploadFile] = File(...),
    plan: str | None = Form(None),
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 PDF files are required to merge.")

    for file in files:
        validate_file_size(file, 30)

    for file in files:
        validate_extension(file.filename, (".pdf",), f"File {file.filename} is not a valid PDF document.")

    saved_paths = save_multi_upload(files, ".pdf")
    try:
        data, download_name = merge_pdfs_task(
            saved_paths, original_filename=files[0].filename, plan=plan
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/split")
def split_pdf(
    file: UploadFile = File(...),
    mode: str = Form("custom"),
    pages_spec: str = Form("")
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if mode.lower() == "custom" and not pages_spec:
        raise HTTPException(status_code=400, detail="Custom pages range specification is required (e.g. 1-3, 5).")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = split_pdf_task(relative_path, mode, pages_spec, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/pdf-to-images")
def pdf_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = pdf_to_images_task(relative_path, format, dpi, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/images-to-pdf")
def images_to_pdf(
    files: list[UploadFile] = File(...)
):
    for file in files:
        validate_file_size(file, 30)

    valid_exts = [".png", ".jpg", ".jpeg"]
    for file in files:
        validate_extension(file.filename, valid_exts, f"File {file.filename} is not a supported image format (PNG/JPG).")

    saved_paths = save_multi_upload(files, preserve_extension=True, error_prefix="Failed to save image uploads")
    try:
        data, download_name = images_to_pdf_task(saved_paths, original_filename=files[0].filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/extract-text")
def extract_text(
    file: UploadFile = File(...),
    export_txt: bool = Form(False)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        payload, download_name = extract_text_task(relative_path, export_txt, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if export_txt:
        assert isinstance(payload, bytes) and download_name is not None
        return _file_response(payload, download_name)
    assert isinstance(payload, str)
    return {"text": payload}


@router.post("/pdf-to-docx")
def pdf_to_docx(
    file: UploadFile = File(...)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = pdf_to_docx_task(relative_path, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/docx-to-pdf")
def docx_to_pdf(
    file: UploadFile = File(...)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".docx",), "Only DOCX files are supported.")

    relative_path = save_upload_file(file, ".docx")
    try:
        data, download_name = docx_to_pdf_task(relative_path, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/protect")
async def protect_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if not password:
        raise HTTPException(status_code=400, detail="Password is required.")

    data = await file.read()

    try:
        result = protect_pdf_bytes(data, password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to protect PDF: {str(e)}")

    base, ext = os.path.splitext(file.filename)
    download_name = f"{base}_protected{ext}"
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@router.post("/unlock")
async def unlock_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if not password:
        raise HTTPException(status_code=400, detail="Password is required.")

    data = await file.read()

    try:
        result = unlock_pdf_bytes(data, password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to unlock PDF: {str(e)}")

    base, ext = os.path.splitext(file.filename)
    download_name = f"{base}_unlocked{ext}"
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@router.post("/rotate")
def rotate_pdf(
    file: UploadFile = File(...),
    rotation: int = Form(...)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if rotation not in [90, 180, 270]:
        raise HTTPException(status_code=400, detail="Invalid rotation angle. Must be 90, 180, or 270.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = rotate_pdf_task(relative_path, rotation, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/organize")
def organize_pdf(
    file: UploadFile = File(...),
    page_order: str = Form(...)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if not page_order:
        raise HTTPException(status_code=400, detail="Page order specification is required.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = organize_pdf_task(relative_path, page_order, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/watermark")
def watermark_pdf(
    file: UploadFile = File(...),
    text: str = Form(...),
    color: str = Form("gray"),
    opacity: float = Form(0.3),
    rotation: int = Form(45)
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = watermark_pdf_task(relative_path, text, color, opacity, rotation, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/add-page-numbers")
def add_page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-center")
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = add_page_numbers_task(relative_path, position, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/ocr")
def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("eng")
):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    try:
        data, download_name = ocr_pdf_task(relative_path, language, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/pdf-info")
def get_pdf_info(file: UploadFile = File(...)):
    validate_file_size(file, 30)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")
    try:
        from pypdf import PdfReader
        reader = PdfReader(file.file)
        num_pages = len(reader.pages)
        return {"num_pages": num_pages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")
