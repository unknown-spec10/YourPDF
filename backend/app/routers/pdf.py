"""PDF route handlers (synchronous in-request processing)."""
import logging
import os

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.http_io import file_response
from app.errors import InvalidRequest
from app.limits import validate_total_size
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
    sign_pdf_task,
)
from app.uploads import save_multi_upload, save_upload_file, save_uploaded_image
from app.validation import validate_dpi, validate_extension, validate_file_size
from app.pdf_signatures import signature_headers, signature_headers_bytes

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/compress")
def compress_pdf(
    file: UploadFile = File(...),
    quality: str = Form("medium")
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(relative_path)
    data, download_name = compress_pdf_task(relative_path, quality, original_filename=file.filename)
    return file_response(data, download_name, headers=sig_headers)


@router.post("/merge")
def merge_pdfs(
    files: list[UploadFile] = File(...),
    plan: str | None = Form(None),
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 PDF files are required to merge.")

    for file in files:
        validate_file_size(file)

    validate_total_size(files)

    for file in files:
        validate_extension(file.filename, (".pdf",), f"File {file.filename} is not a valid PDF document.")

    saved_paths = save_multi_upload(files, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(saved_paths)
    data, download_name = merge_pdfs_task(
        saved_paths, original_filename=files[0].filename, plan=plan
    )
    return file_response(data, download_name, headers=sig_headers)


@router.post("/split")
def split_pdf(
    file: UploadFile = File(...),
    mode: str = Form("custom"),
    pages_spec: str = Form("")
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    # An unrecognised mode used to fall through to the custom branch with an empty spec and
    # answer 200 with a zero-page PDF. Be explicit instead.
    if mode.lower() not in {"custom", "all"}:
        raise HTTPException(status_code=400, detail="Split mode must be 'custom' or 'all'.")

    if mode.lower() == "custom" and not pages_spec:
        raise HTTPException(status_code=400, detail="Custom pages range specification is required (e.g. 1-3, 5).")

    relative_path = save_upload_file(file, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(relative_path)
    data, download_name = split_pdf_task(relative_path, mode, pages_spec, original_filename=file.filename)
    return file_response(data, download_name, headers=sig_headers)


@router.post("/pdf-to-images")
def pdf_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150),
    pages: str = Form("all"),
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")

    validate_dpi(dpi)
    relative_path = save_upload_file(file, ".pdf")
    data, download_name = pdf_to_images_task(
        relative_path, format, dpi, original_filename=file.filename, pages=pages
    )
    return file_response(data, download_name)


@router.post("/images-to-pdf")
def images_to_pdf(
    files: list[UploadFile] = File(...)
):
    for file in files:
        validate_file_size(file)

    validate_total_size(files)

    valid_exts = [".png", ".jpg", ".jpeg"]
    for file in files:
        validate_extension(file.filename, valid_exts, f"File {file.filename} is not a supported image format (PNG/JPG).")

    saved_paths = save_multi_upload(files, preserve_extension=True, error_prefix="Failed to save image uploads")
    data, download_name = images_to_pdf_task(saved_paths, original_filename=files[0].filename)
    return file_response(data, download_name)


@router.post("/extract-text")
def extract_text(
    file: UploadFile = File(...),
    export_txt: bool = Form(False)
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    payload, download_name = extract_text_task(relative_path, export_txt, original_filename=file.filename)
    if export_txt:
        assert isinstance(payload, bytes) and download_name is not None
        return file_response(payload, download_name)
    assert isinstance(payload, str)
    return {"text": payload}


@router.post("/pdf-to-docx")
def pdf_to_docx(
    file: UploadFile = File(...)
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    result = pdf_to_docx_task(relative_path, original_filename=file.filename)
    headers = {
        "X-OCR-Applied": "1" if result.ocr_applied else "0",
        "Access-Control-Expose-Headers": "X-OCR-Applied, X-Job-Notice",
    }
    if result.notice:
        headers["X-Job-Notice"] = result.notice
    return file_response(result.data, result.download_name, headers=headers)


@router.post("/docx-to-pdf")
def docx_to_pdf(
    file: UploadFile = File(...)
):
    validate_file_size(file)
    validate_extension(file.filename, (".docx",), "Only DOCX files are supported.")

    relative_path = save_upload_file(file, ".docx")
    data, download_name = docx_to_pdf_task(relative_path, original_filename=file.filename)
    return file_response(data, download_name)


@router.post("/protect")
async def protect_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if not password:
        raise HTTPException(status_code=400, detail="Password is required.")

    data = await file.read()

    try:
        result = protect_pdf_bytes(data, password)
    except Exception:
        # The library message is a stack detail, not a user-facing reason; log it and answer
        # with something actionable. `main.py` reports the request id.
        logger.exception("protect failed")
        raise InvalidRequest("Failed to protect PDF: the file could not be encrypted.")

    base, ext = os.path.splitext(file.filename)
    download_name = f"{base}_protected{ext}"
    return file_response(result, download_name, headers=signature_headers_bytes(data))


@router.post("/unlock")
async def unlock_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if not password:
        raise HTTPException(status_code=400, detail="Password is required.")

    data = await file.read()

    try:
        result = unlock_pdf_bytes(data, password)
    except ValueError as e:
        # A wrong password or an unencrypted file: the message is written for the user.
        raise InvalidRequest(str(e))
    except Exception:
        logger.exception("unlock failed")
        raise InvalidRequest("Failed to unlock PDF: the file could not be decrypted.")

    base, ext = os.path.splitext(file.filename)
    download_name = f"{base}_unlocked{ext}"
    return file_response(result, download_name)


@router.post("/rotate")
def rotate_pdf(
    file: UploadFile = File(...),
    rotation: float = Form(...)
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if rotation == 0:
        raise HTTPException(status_code=400, detail="Rotation angle must be non-zero.")
    if abs(rotation) > 360:
        raise HTTPException(status_code=400, detail="Invalid rotation angle. Must be between -360 and 360 degrees, excluding 0.")

    relative_path = save_upload_file(file, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(relative_path)
    data, download_name = rotate_pdf_task(relative_path, rotation, original_filename=file.filename)
    return file_response(data, download_name, headers=sig_headers)


@router.post("/organize")
def organize_pdf(
    file: UploadFile = File(...),
    page_order: str = Form(...)
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if not page_order:
        raise HTTPException(status_code=400, detail="Page order specification is required.")

    relative_path = save_upload_file(file, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(relative_path)
    data, download_name = organize_pdf_task(relative_path, page_order, original_filename=file.filename)
    return file_response(data, download_name, headers=sig_headers)


@router.post("/watermark")
def watermark_pdf(
    file: UploadFile = File(...),
    text: str = Form(...),
    color: str = Form("gray"),
    opacity: float = Form(0.3),
    rotation: int = Form(45),
    font_size: int = Form(48),
    pages: str = Form("all")
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    if rotation < 0 or rotation > 359:
        raise HTTPException(status_code=400, detail="Invalid rotation angle. Must be between 0 and 359 degrees.")
    if font_size < 12 or font_size > 200:
        raise HTTPException(status_code=400, detail="Invalid font size. Must be between 12 and 200.")

    relative_path = save_upload_file(file, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(relative_path)
    data, download_name = watermark_pdf_task(relative_path, text, color, opacity, rotation, font_size, pages, original_filename=file.filename)
    return file_response(data, download_name, headers=sig_headers)


@router.post("/add-page-numbers")
def add_page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-center")
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(relative_path)
    data, download_name = add_page_numbers_task(relative_path, position, original_filename=file.filename)
    return file_response(data, download_name, headers=sig_headers)


@router.post("/sign")
def sign_pdf(
    file: UploadFile = File(...),
    signature: UploadFile = File(...),
    pages: str = Form("all"),
    cx: float = Form(50.0),
    cy: float = Form(50.0),
    width: float = Form(25.0),
    rotation: float = Form(0.0),
    add_date: bool = Form(False),
    date_text: str = Form(""),
    date_size: float = Form(12.0),
    date_position: str = Form("below"),
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    validate_file_size(signature, 5)
    validate_extension(
        signature.filename,
        (".png", ".jpg", ".jpeg"),
        "Only PNG, JPG, and JPEG signature images are supported.",
    )

    # Both files travel in one multipart body, so the aggregate matters here too: a 30 MB PDF
    # plus a 5 MB signature would pass the per-file checks and then be rejected by the host.
    validate_total_size([file, signature])

    if not (0 <= cx <= 100):
        raise HTTPException(status_code=400, detail="Invalid cx. Must be between 0 and 100.")
    if not (0 <= cy <= 100):
        raise HTTPException(status_code=400, detail="Invalid cy. Must be between 0 and 100.")
    if not (0 < width <= 100):
        raise HTTPException(status_code=400, detail="Invalid width. Must be between 0 and 100, excluding 0.")
    if not (-360 <= rotation <= 360):
        raise HTTPException(status_code=400, detail="Invalid rotation angle. Must be between -360 and 360 degrees.")
    if not (6 <= date_size <= 40):
        raise HTTPException(status_code=400, detail="Invalid date_size. Must be between 6 and 40.")
    if date_position not in ("below", "above"):
        raise HTTPException(status_code=400, detail="Invalid date_position. Must be 'below' or 'above'.")
    if len((date_text or "").strip()) > 100:
        raise HTTPException(status_code=400, detail="Date text is too long (max 100 characters).")

    relative_path = save_upload_file(file, ".pdf")

    # Computed before the task runs: the task deletes its input in a finally block.

    sig_headers = signature_headers(relative_path)
    _, sig_relative_path = save_uploaded_image(signature, "sign")
    data, download_name = sign_pdf_task(
        relative_path,
        sig_relative_path,
        pages=pages,
        cx=cx,
        cy=cy,
        width=width,
        rotation=rotation,
        add_date=add_date,
        date_text=date_text,
        date_size=date_size,
        date_position=date_position,
        original_filename=file.filename,
    )
    return file_response(data, download_name, headers=sig_headers)


@router.post("/ocr")
def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("eng")
):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")

    relative_path = save_upload_file(file, ".pdf")
    data, download_name = ocr_pdf_task(relative_path, language, original_filename=file.filename)
    return file_response(data, download_name)


@router.post("/pdf-info")
def get_pdf_info(file: UploadFile = File(...)):
    validate_file_size(file)
    validate_extension(file.filename, (".pdf",), "Only PDF files are supported.")
    try:
        from pypdf import PdfReader
        reader = PdfReader(file.file)
        num_pages = len(reader.pages)
        return {"num_pages": num_pages}
    except Exception:
        # A corrupt or encrypted PDF is bad input, not a server fault — and the library's message
        # is a stack detail, so it is logged rather than echoed back to the user.
        logger.exception("pdf-info failed to parse the upload")
        raise InvalidRequest("Failed to parse PDF: the file may be corrupt or password-protected.")
