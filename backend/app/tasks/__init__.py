"""Synchronous processing functions (no queue).

Re-exports every public function so ``from app.tasks import X`` keeps working
for routers and tests.
"""

from app.tasks.image_tasks import (
    compress_image_task,
    convert_image_task,
    crop_image_task,
    resize_image_task,
    rotate_image_task,
    watermark_image_task,
)
from app.tasks.office_tasks import (
    docx_to_images_task,
    merge_docx_task,
    merge_pptx_task,
    pptx_to_images_task,
    pptx_to_pdf_task,
)
from app.tasks.pdf_tasks import (
    add_page_numbers_task,
    compress_pdf_task,
    create_page_number_pdf,
    create_watermark_pdf,
    docx_to_pdf_task,
    extract_text_task,
    images_to_pdf_task,
    merge_pdfs_task,
    ocr_pdf_task,
    organize_pdf_task,
    pdf_to_docx_task,
    pdf_to_images_task,
    rotate_pdf_task,
    sign_pdf_task,
    split_pdf_task,
    watermark_pdf_task,
)

__all__ = [
    "add_page_numbers_task",
    "compress_image_task",
    "compress_pdf_task",
    "convert_image_task",
    "create_page_number_pdf",
    "create_watermark_pdf",
    "crop_image_task",
    "docx_to_images_task",
    "docx_to_pdf_task",
    "extract_text_task",
    "images_to_pdf_task",
    "merge_docx_task",
    "merge_pdfs_task",
    "merge_pptx_task",
    "ocr_pdf_task",
    "organize_pdf_task",
    "pdf_to_docx_task",
    "pdf_to_images_task",
    "pptx_to_images_task",
    "pptx_to_pdf_task",
    "resize_image_task",
    "rotate_image_task",
    "rotate_pdf_task",
    "sign_pdf_task",
    "split_pdf_task",
    "watermark_image_task",
    "watermark_pdf_task",
]
