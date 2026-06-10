import os
import uuid
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from celery.result import AsyncResult
from app.tasks import (
    compress_pdf_task,
    merge_pdfs_task,
    split_pdf_task,
    pdf_to_images_task,
    images_to_pdf_task,
    extract_text_task,
    pdf_to_docx_task,
    docx_to_pdf_task,
    protect_pdf_task,
    unlock_pdf_task,
    rotate_pdf_task,
    organize_pdf_task,
    watermark_pdf_task,
    add_page_numbers_task,
    ocr_pdf_task,
    compress_image_task,
    resize_image_task,
    crop_image_task,
    convert_image_task,
    rotate_image_task,
    watermark_image_task,
    merge_docx_task,
    docx_to_images_task,
    pptx_to_pdf_task,
    pptx_to_images_task,
    merge_pptx_task
)
from app.celery_app import celery

app = FastAPI(
    title="YourPDF API",
    description="Backend processing engine for YourPDF tools.",
    version="1.0.0"
)

# Enable CORS for local Next.js frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local static outputs directory for file download fallback
app_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.dirname(app_dir)
static_dir = os.path.join(backend_root, "static")
os.makedirs(os.path.join(static_dir, "outputs"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "yourpdf-backend"}

@app.post("/api/compress", status_code=202)
def compress_pdf(
    file: UploadFile = File(...),
    quality: str = Form("medium")
):
    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    # Establish a local workspace tmp directory
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    # Generate a unique temp file name inside the workspace
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    
    # Pass relative path to Celery (e.g. "tmp/upload_xxx.pdf")
    relative_path = os.path.join("tmp", filename)
    task = compress_pdf_task.delay(relative_path, quality, original_filename=file.filename)
    
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/merge", status_code=202)
def merge_pdfs(
    files: list[UploadFile] = File(...)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 PDF files are required to merge.")
        
    # Validate PDF extensions
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"File {file.filename} is not a valid PDF document.")
            
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    saved_paths = []
    try:
        for file in files:
            filename = f"upload_{uuid.uuid4()}.pdf"
            host_file_path = os.path.join(tmp_dir, filename)
            with open(host_file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_paths.append(os.path.join("tmp", filename))
    except Exception as e:
        for p in saved_paths:
            abs_p = os.path.join(backend_root, p)
            if os.path.exists(abs_p):
                os.remove(abs_p)
        raise HTTPException(status_code=500, detail=f"Failed to save upload files: {str(e)}")
    task = merge_pdfs_task.delay(saved_paths, original_filename=files[0].filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/split", status_code=202)
def split_pdf(
    file: UploadFile = File(...),
    mode: str = Form("custom"),
    pages_spec: str = Form("")
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    if mode.lower() == "custom" and not pages_spec:
        raise HTTPException(status_code=400, detail="Custom pages range specification is required (e.g. 1-3, 5).")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    relative_path = os.path.join("tmp", filename)
    task = split_pdf_task.delay(relative_path, mode, pages_spec, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/pdf-to-images", status_code=202)
def pdf_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    relative_path = os.path.join("tmp", filename)
    task = pdf_to_images_task.delay(relative_path, format, dpi, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/images-to-pdf", status_code=202)
def images_to_pdf(
    files: list[UploadFile] = File(...)
):
    valid_exts = [".png", ".jpg", ".jpeg"]
    for file in files:
        ext = os.path.splitext(file.filename.lower())[1]
        if ext not in valid_exts:
            raise HTTPException(status_code=400, detail=f"File {file.filename} is not a supported image format (PNG/JPG).")
            
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    saved_paths = []
    try:
        for file in files:
            ext = os.path.splitext(file.filename.lower())[1]
            filename = f"upload_{uuid.uuid4()}{ext}"
            host_file_path = os.path.join(tmp_dir, filename)
            with open(host_file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_paths.append(os.path.join("tmp", filename))
    except Exception as e:
        for p in saved_paths:
            abs_p = os.path.join(backend_root, p)
            if os.path.exists(abs_p):
                os.remove(abs_p)
        raise HTTPException(status_code=500, detail=f"Failed to save image uploads: {str(e)}")
    task = images_to_pdf_task.delay(saved_paths, original_filename=files[0].filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/extract-text", status_code=202)
def extract_text(
    file: UploadFile = File(...),
    export_txt: bool = Form(False)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
    relative_path = os.path.join("tmp", filename)
    task = extract_text_task.delay(relative_path, export_txt, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/pdf-to-docx", status_code=202)
def pdf_to_docx(
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = pdf_to_docx_task.delay(relative_path, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/docx-to-pdf", status_code=202)
def docx_to_pdf(
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only DOCX files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.docx"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = docx_to_pdf_task.delay(relative_path, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}


@app.post("/api/protect", status_code=202)
def protect_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = protect_pdf_task.delay(relative_path, password, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/unlock", status_code=202)
def unlock_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = unlock_pdf_task.delay(relative_path, password, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/rotate", status_code=202)
def rotate_pdf(
    file: UploadFile = File(...),
    rotation: int = Form(...)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    if rotation not in [90, 180, 270]:
        raise HTTPException(status_code=400, detail="Invalid rotation angle. Must be 90, 180, or 270.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = rotate_pdf_task.delay(relative_path, rotation, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/organize", status_code=202)
def organize_pdf(
    file: UploadFile = File(...),
    page_order: str = Form(...)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    if not page_order:
        raise HTTPException(status_code=400, detail="Page order specification is required.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = organize_pdf_task.delay(relative_path, page_order, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/watermark", status_code=202)
def watermark_pdf(
    file: UploadFile = File(...),
    text: str = Form(...),
    color: str = Form("gray"),
    opacity: float = Form(0.3),
    rotation: int = Form(45)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = watermark_pdf_task.delay(relative_path, text, color, opacity, rotation, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/add-page-numbers", status_code=202)
def add_page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-center")
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = add_page_numbers_task.delay(relative_path, position, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/ocr", status_code=202)
def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("eng")
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pdf"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = ocr_pdf_task.delay(relative_path, language, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/pdf-info")
def get_pdf_info(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        from pypdf import PdfReader
        reader = PdfReader(file.file)
        num_pages = len(reader.pages)
        return {"num_pages": num_pages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")




def validate_image_file(file: UploadFile):
    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, and WEBP image files are supported.")

def save_uploaded_image(file: UploadFile, prefix: str = "image_upload") -> tuple[str, str]:
    ext = os.path.splitext(file.filename.lower())[1]
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"{prefix}_{uuid.uuid4()}{ext}"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    return filename, os.path.join("tmp", filename)

@app.post("/api/image/compress", status_code=202)
def compress_image(
    file: UploadFile = File(...),
    quality: int = Form(75)
):
    validate_image_file(file)
    if not (1 <= quality <= 100):
        raise HTTPException(status_code=400, detail="Quality must be between 1 and 100.")
    _, relative_path = save_uploaded_image(file, "compress")
    task = compress_image_task.delay(relative_path, quality, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/image/resize", status_code=202)
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
    task = resize_image_task.delay(relative_path, width, height, percentage, maintain_aspect, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/image/crop", status_code=202)
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
    task = crop_image_task.delay(relative_path, x, y, width, height, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/image/convert", status_code=202)
def convert_image(
    file: UploadFile = File(...),
    target_format: str = Form(...)
):
    validate_image_file(file)
    target_format = target_format.lower()
    if target_format not in ["jpg", "jpeg", "png", "webp", "bmp", "tiff"]:
        raise HTTPException(status_code=400, detail="Invalid target format. Supported: JPG, JPEG, PNG, WEBP, BMP, TIFF.")
    _, relative_path = save_uploaded_image(file, "convert")
    task = convert_image_task.delay(relative_path, target_format, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/image/rotate", status_code=202)
def rotate_image(
    file: UploadFile = File(...),
    angle: int = Form(...)
):
    validate_image_file(file)
    if angle not in [90, 180, 270]:
        raise HTTPException(status_code=400, detail="Invalid rotation angle. Must be 90, 180, or 270.")
    _, relative_path = save_uploaded_image(file, "rotate")
    task = rotate_image_task.delay(relative_path, angle, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/image/watermark", status_code=202)
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
    task = watermark_image_task.delay(relative_path, text, color, opacity, position, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}


@app.post("/api/office/merge-docx", status_code=202)
def merge_docx(
    files: list[UploadFile] = File(...)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 Word files are required to merge.")
    for file in files:
        if not file.filename.lower().endswith(".docx"):
            raise HTTPException(status_code=400, detail=f"File {file.filename} is not a valid DOCX document.")
            
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    saved_paths = []
    try:
        for file in files:
            filename = f"upload_{uuid.uuid4()}.docx"
            host_file_path = os.path.join(tmp_dir, filename)
            with open(host_file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_paths.append(os.path.join("tmp", filename))
    except Exception as e:
        for p in saved_paths:
            abs_p = os.path.join(backend_root, p)
            if os.path.exists(abs_p):
                os.remove(abs_p)
        raise HTTPException(status_code=500, detail=f"Failed to save upload files: {str(e)}")
        
    task = merge_docx_task.delay(saved_paths, original_filename=files[0].filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/office/docx-to-images", status_code=202)
def docx_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150)
):
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only DOCX files are supported.")
    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.docx"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = docx_to_images_task.delay(relative_path, format, dpi, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/office/pptx-to-pdf", status_code=202)
def pptx_to_pdf(
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only PPTX files are supported.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pptx"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = pptx_to_pdf_task.delay(relative_path, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/office/pptx-to-images", status_code=202)
def pptx_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    dpi: int = Form(150)
):
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only PPTX files are supported.")
    if format.lower() not in ["png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Invalid format preference. Choose PNG, JPG, or JPEG.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    filename = f"upload_{uuid.uuid4()}.pptx"
    host_file_path = os.path.join(tmp_dir, filename)
    
    try:
        with open(host_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")
        
    relative_path = os.path.join("tmp", filename)
    task = pptx_to_images_task.delay(relative_path, format, dpi, original_filename=file.filename)
    return {"job_id": task.id, "status": "queued"}

@app.post("/api/office/merge-pptx", status_code=202)
def merge_pptx(
    files: list[UploadFile] = File(...)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 PowerPoint files are required to merge.")
    for file in files:
        if not file.filename.lower().endswith(".pptx"):
            raise HTTPException(status_code=400, detail=f"File {file.filename} is not a valid PPTX document.")
            
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    tmp_dir = os.path.join(backend_root, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    saved_paths = []
    try:
        for file in files:
            filename = f"upload_{uuid.uuid4()}.pptx"
            host_file_path = os.path.join(tmp_dir, filename)
            with open(host_file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_paths.append(os.path.join("tmp", filename))
    except Exception as e:
        for p in saved_paths:
            abs_p = os.path.join(backend_root, p)
            if os.path.exists(abs_p):
                os.remove(abs_p)
        raise HTTPException(status_code=500, detail=f"Failed to save upload files: {str(e)}")
        
    task = merge_pptx_task.delay(saved_paths, original_filename=files[0].filename)
    return {"job_id": task.id, "status": "queued"}


@app.get("/api/status/{job_id}")
def get_job_status(job_id: str):
    res = AsyncResult(job_id, app=celery)
    
    if res.state == "PENDING":
        # Celery returns PENDING for unknown job IDs as well
        return {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "message": "Job is waiting in queue..."
        }
    elif res.state == "PROGRESS":
        # Custom progress state set during task execution
        meta = res.info or {}
        return {
            "job_id": job_id,
            "status": "processing",
            "progress": meta.get("progress", 0),
            "message": meta.get("message", "Processing file...")
        }
    elif res.state == "SUCCESS":
        result = res.result
        return {
            "job_id": job_id,
            "status": "done",
            "progress": 100,
            "message": "Completed successfully.",
            "result": result
        }
    elif res.state == "FAILURE":
        return {
            "job_id": job_id,
            "status": "error",
            "progress": 100,
            "message": f"Task failed: {str(res.result)}"
        }
    
    return {
        "job_id": job_id,
        "status": res.state.lower(),
        "progress": 0,
        "message": f"Job state: {res.state}"
    }

@app.get("/api/download/{filename}")
def download_file(filename: str, original_name: str = None, preview: bool = False):
    # Prevent directory traversal attacks
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
        
    app_dir = os.path.dirname(os.path.abspath(__file__))
    backend_root = os.path.dirname(app_dir)
    file_path = os.path.join(backend_root, "static", "outputs", filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found or has expired.")
        
    if preview:
        ext = os.path.splitext(filename.lower())[1]
        media_types = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".txt": "text/plain",
        }
        mimetype = media_types.get(ext, "application/octet-stream")
        return FileResponse(
            path=file_path,
            media_type=mimetype,
            content_disposition_type="inline"
        )
        
    download_filename = original_name if original_name else filename
    return FileResponse(
        path=file_path,
        filename=download_filename,
        media_type="application/octet-stream"
    )
