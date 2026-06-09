import os
from unittest.mock import patch

def test_health_check(client):
    """
    Test that the health endpoint returns service status details.
    """
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "yourpdf-backend"}

def test_compress_invalid_extension(client):
    """
    Test that uploading a non-PDF file results in a 400 bad request error.
    """
    files = {"file": ("test.txt", b"plain text data", "text/plain")}
    response = client.post("/api/compress", files=files, data={"quality": "low"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Only PDF files are supported."

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.compress_pdf_task.delay")
def test_compress_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that uploading a PDF successfully queues a Celery job and writes file to workspace tmp directory.
    """
    # Mock the Celery Task object returned by delay()
    class MockTask:
        id = "mocked-job-1234"
    mock_delay.return_value = MockTask()

    files = {"file": ("document.pdf", b"%PDF-1.4 mock content", "application/pdf")}
    response = client.post("/api/compress", files=files, data={"quality": "medium"})
    
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-job-1234"
    assert response.json()["status"] == "queued"
    
    # Assert delay was triggered with the correct relative path structure
    mock_delay.assert_called_once()
    args, _ = mock_delay.call_args
    task_file_path = args[0]
    assert task_file_path.startswith(os.path.join("tmp", "upload_"))
    assert task_file_path.endswith(".pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.merge_pdfs_task.delay")
def test_merge_pdfs_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that merging multiple PDFs successfully queues a merge job.
    """
    class MockTask:
        id = "mocked-merge-123"
    mock_delay.return_value = MockTask()

    files = [
        ("files", ("doc1.pdf", b"%PDF-1.4 dummy1", "application/pdf")),
        ("files", ("doc2.pdf", b"%PDF-1.4 dummy2", "application/pdf")),
    ]
    response = client.post("/api/merge", files=files)
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-merge-123"
    mock_delay.assert_called_once()

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.split_pdf_task.delay")
def test_split_pdf_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that splitting a PDF successfully queues a split job.
    """
    class MockTask:
        id = "mocked-split-123"
    mock_delay.return_value = MockTask()

    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/split", files=file, data={"mode": "custom", "pages_spec": "1-2"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-split-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "custom", "1-2", original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.pdf_to_images_task.delay")
def test_pdf_to_images_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that converting a PDF to images successfully queues a conversion job.
    """
    class MockTask:
        id = "mocked-pdf2img-123"
    mock_delay.return_value = MockTask()

    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/pdf-to-images", files=file, data={"format": "png", "dpi": "150"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-pdf2img-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "png", 150, original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.images_to_pdf_task.delay")
def test_images_to_pdf_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that converting images to a PDF successfully queues a compilation job.
    """
    class MockTask:
        id = "mocked-img2pdf-123"
    mock_delay.return_value = MockTask()

    files = [
        ("files", ("img1.png", b"pngdata", "image/png")),
        ("files", ("img2.jpg", b"jpgdata", "image/jpeg")),
    ]
    response = client.post("/api/images-to-pdf", files=files)
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-img2pdf-123"
    mock_delay.assert_called_once()

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.extract_text_task.delay")
def test_extract_text_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that extracting text from a PDF successfully queues an extraction job.
    """
    class MockTask:
        id = "mocked-extract-123"
    mock_delay.return_value = MockTask()

    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/extract-text", files=file, data={"export_txt": "true"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-extract-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], True, original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.pdf_to_docx_task.delay")
def test_pdf_to_docx_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that converting a PDF to DOCX successfully queues a conversion job.
    """
    class MockTask:
        id = "mocked-pdf2docx-123"
    mock_delay.return_value = MockTask()

    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/pdf-to-docx", files=file)
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-pdf2docx-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.docx_to_pdf_task.delay")
def test_docx_to_pdf_success(mock_delay, mock_open, mock_copy, client):
    """
    Test that converting a DOCX to PDF successfully queues a conversion job.
    """
    class MockTask:
        id = "mocked-docx2pdf-123"
    mock_delay.return_value = MockTask()

    file = {"file": ("doc.docx", b"docx dummy content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    response = client.post("/api/docx-to-pdf", files=file)
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-docx2pdf-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], original_filename="doc.docx")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.protect_pdf_task.delay")
def test_protect_pdf_success(mock_delay, mock_open, mock_copy, client):
    class MockTask:
        id = "mocked-protect-123"
    mock_delay.return_value = MockTask()
    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/protect", files=file, data={"password": "secure"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-protect-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "secure", original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.unlock_pdf_task.delay")
def test_unlock_pdf_success(mock_delay, mock_open, mock_copy, client):
    class MockTask:
        id = "mocked-unlock-123"
    mock_delay.return_value = MockTask()
    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/unlock", files=file, data={"password": "secure"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-unlock-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "secure", original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.rotate_pdf_task.delay")
def test_rotate_pdf_success(mock_delay, mock_open, mock_copy, client):
    class MockTask:
        id = "mocked-rotate-123"
    mock_delay.return_value = MockTask()
    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/rotate", files=file, data={"rotation": "90"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-rotate-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], 90, original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.organize_pdf_task.delay")
def test_organize_pdf_success(mock_delay, mock_open, mock_copy, client):
    class MockTask:
        id = "mocked-organize-123"
    mock_delay.return_value = MockTask()
    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/organize", files=file, data={"page_order": "1,3,2"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-organize-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "1,3,2", original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.watermark_pdf_task.delay")
def test_watermark_pdf_success(mock_delay, mock_open, mock_copy, client):
    class MockTask:
        id = "mocked-watermark-123"
    mock_delay.return_value = MockTask()
    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/watermark", files=file, data={
        "text": "COPY",
        "color": "red",
        "opacity": "0.5",
        "rotation": "45"
    })
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-watermark-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "COPY", "red", 0.5, 45, original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.add_page_numbers_task.delay")
def test_add_page_numbers_success(mock_delay, mock_open, mock_copy, client):
    class MockTask:
        id = "mocked-pagenum-123"
    mock_delay.return_value = MockTask()
    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/add-page-numbers", files=file, data={"position": "bottom-right"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-pagenum-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "bottom-right", original_filename="doc.pdf")

@patch("app.main.shutil.copyfileobj")
@patch("app.main.open")
@patch("app.main.ocr_pdf_task.delay")
def test_ocr_pdf_success(mock_delay, mock_open, mock_copy, client):
    class MockTask:
        id = "mocked-ocr-123"
    mock_delay.return_value = MockTask()
    file = {"file": ("doc.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    response = client.post("/api/ocr", files=file, data={"language": "eng"})
    assert response.status_code == 202
    assert response.json()["job_id"] == "mocked-ocr-123"
    mock_delay.assert_called_once_with(mock_delay.call_args[0][0], "eng", original_filename="doc.pdf")


