"""Image route handlers (synchronous in-request processing)."""
import os

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response

from app.tasks import (
    compress_image_task,
    resize_image_task,
    crop_image_task,
    convert_image_task,
    rotate_image_task,
    watermark_image_task,
)
from app.uploads import save_uploaded_image
from app.validation import validate_image_file

router = APIRouter()


def _media_type_for(filename: str) -> str:
    ext = os.path.splitext(filename.lower())[1]
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
        ".gif": "image/gif",
    }.get(ext, "application/octet-stream")


def _file_response(data: bytes, download_name: str) -> Response:
    return Response(
        content=data,
        media_type=_media_type_for(download_name),
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@router.post("/image/compress")
def compress_image(
    file: UploadFile = File(...),
    quality: int = Form(75)
):
    validate_image_file(file)
    if not (1 <= quality <= 100):
        raise HTTPException(status_code=400, detail="Quality must be between 1 and 100.")
    _, relative_path = save_uploaded_image(file, "compress")
    try:
        data, download_name = compress_image_task(relative_path, quality, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/image/resize")
def resize_image(
    file: UploadFile = File(...),
    width: int = Form(None),
    height: int = Form(None),
    percentage: int = Form(None),
    maintain_aspect: bool = Form(True)
):
    validate_image_file(file)
    if percentage is None and width is None and height is None:
        raise HTTPException(status_code=400, detail="Must specify either width, height, or percentage.")
    _, relative_path = save_uploaded_image(file, "resize")
    try:
        data, download_name = resize_image_task(relative_path, width, height, percentage, maintain_aspect, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/image/crop")
def crop_image(
    file: UploadFile = File(...),
    x: int = Form(...),
    y: int = Form(...),
    width: int = Form(...),
    height: int = Form(...)
):
    validate_image_file(file)
    if width <= 0 or height <= 0:
        raise HTTPException(status_code=400, detail="Width and height must be greater than 0.")
    _, relative_path = save_uploaded_image(file, "crop")
    try:
        data, download_name = crop_image_task(relative_path, x, y, width, height, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/image/convert")
def convert_image(
    file: UploadFile = File(...),
    target_format: str = Form(...)
):
    validate_image_file(file)
    target_format = target_format.lower()
    if target_format not in ["jpg", "jpeg", "png", "webp", "bmp", "tiff"]:
        raise HTTPException(status_code=400, detail="Invalid target format. Supported: JPG, JPEG, PNG, WEBP, BMP, TIFF.")
    _, relative_path = save_uploaded_image(file, "convert")
    try:
        data, download_name = convert_image_task(relative_path, target_format, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/image/rotate")
def rotate_image(
    file: UploadFile = File(...),
    angle: int = Form(...)
):
    validate_image_file(file)
    if angle not in [90, 180, 270]:
        raise HTTPException(status_code=400, detail="Invalid rotation angle. Must be 90, 180, or 270.")
    _, relative_path = save_uploaded_image(file, "rotate")
    try:
        data, download_name = rotate_image_task(relative_path, angle, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)


@router.post("/image/watermark")
def watermark_image(
    file: UploadFile = File(...),
    text: str = Form(...),
    color: str = Form("gray"),
    opacity: float = Form(0.3),
    position: str = Form("center")
):
    validate_image_file(file)
    if not text:
        raise HTTPException(status_code=400, detail="Watermark text cannot be empty.")
    if position not in ["center", "top-left", "top-right", "bottom-left", "bottom-right", "tile"]:
        raise HTTPException(status_code=400, detail="Invalid position specification.")
    _, relative_path = save_uploaded_image(file, "watermark")
    try:
        data, download_name = watermark_image_task(relative_path, text, color, opacity, position, original_filename=file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _file_response(data, download_name)
