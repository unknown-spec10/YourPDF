"""PDF tasks, split by the concern each one owns.

``pdf_tasks.py`` used to be one 1570-line module; it is now eight small ones. The public names
are re-exported here, so ``from app.tasks.pdf import compress_pdf_task`` is the stable import
surface and callers never need to know which module a task lives in.

Layout:

- ``pages_spec`` — page/selection parsing (merge plans, ``"1-3, 5"``, ``"3-"``)
- ``compress``   — Ghostscript compression and binary resolution
- ``merge_split`` — merge and split
- ``rasterise``  — PDF→images, images→PDF (the render budget lives here)
- ``text``       — text extraction, PDF→Word (with auto-OCR), Word→PDF
- ``annotate``   — watermark, page numbers, signatures
- ``transform``  — rotate, organise
- ``ocr``        — ocrmypdf wrapper and error translation
"""

from app.tasks.pdf.annotate import (
    add_page_numbers_task,
    create_page_number_pdf,
    create_watermark_pdf,
    sign_pdf_task,
    watermark_pdf_task,
)
from app.tasks.pdf.compress import compress_pdf_task
from app.tasks.pdf.merge_split import merge_pdfs_task, split_pdf_task
from app.tasks.pdf.ocr import _run_ocrmypdf, ocr_pdf_task
from app.tasks.pdf.pages_spec import (
    _parse_merge_pages_spec,
    _parse_merge_plan,
    _parse_watermark_pages,
)
from app.tasks.pdf.rasterise import images_to_pdf_task, pdf_to_images_task
from app.tasks.pdf.text import (
    PdfToDocxResult,
    _docx_has_text,
    _pdf_text_layout,
    docx_to_pdf_task,
    extract_text_task,
    pdf_to_docx_task,
)
from app.tasks.pdf.transform import organize_pdf_task, rotate_pdf_task

__all__ = [
    "PdfToDocxResult",
    "_docx_has_text",
    "_parse_merge_pages_spec",
    "_parse_merge_plan",
    "_parse_watermark_pages",
    "_pdf_text_layout",
    "_run_ocrmypdf",
    "add_page_numbers_task",
    "compress_pdf_task",
    "create_page_number_pdf",
    "create_watermark_pdf",
    "docx_to_pdf_task",
    "extract_text_task",
    "images_to_pdf_task",
    "merge_pdfs_task",
    "ocr_pdf_task",
    "organize_pdf_task",
    "pdf_to_docx_task",
    "pdf_to_images_task",
    "rotate_pdf_task",
    "sign_pdf_task",
    "split_pdf_task",
    "watermark_pdf_task",
]
