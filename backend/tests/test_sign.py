"""Sign-PDF endpoint tests plus pdf-to-images page-subset tests.

Covers: default signing, multi-page targeting, bad pages specs,
out-of-range numerics, unreadable signature images, pre-rotated
(/Rotate=90) pages, the add_date overlay, and pdf-to-images subsets.
"""
import io
import zipfile

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject


def _make_pdf_bytes(pages: int = 1, w: float = 300, h: float = 400) -> bytes:
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    for i in range(pages):
        c.setFont("Helvetica", 12)
        c.drawString(50, h - 50, f"Page {i + 1} base content line")
        c.showPage()
    c.save()
    return buf.getvalue()


def _make_sig_bytes(size=(300, 100)) -> bytes:
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line(
        [(10, 70), (60, 20), (100, 60), (160, 30), (220, 55), (size[0] - 20, 25)],
        fill=(20, 20, 180, 255),
        width=4,
    )
    d.ellipse([8, 60, 30, 80], fill=(20, 20, 180, 255))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _sign_files(pdf_bytes: bytes, sig_bytes: bytes = None, pdf_name: str = "doc.pdf"):
    if sig_bytes is None:
        sig_bytes = _make_sig_bytes()
    return {
        "file": (pdf_name, pdf_bytes, "application/pdf"),
        "signature": ("sig.png", sig_bytes, "image/png"),
    }


def _content_len(page) -> int:
    contents = page.get("/Contents")
    if contents is None:
        return 0
    if isinstance(contents, ArrayObject):
        return sum(len(obj.get_data()) for obj in contents)
    return len(contents.get_data())


def test_sign_page1_defaults(client):
    pdf = _make_pdf_bytes(1)
    before = _content_len(PdfReader(io.BytesIO(pdf)).pages[0])
    response = client.post("/api/sign", files=_sign_files(pdf), data={"pages": "1"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "_signed" in response.headers.get("content-disposition", "")
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 1
    assert _content_len(reader.pages[0]) > before


def test_sign_pages_1_to_3_signs_all(client):
    pdf = _make_pdf_bytes(3)
    before = [_content_len(p) for p in PdfReader(io.BytesIO(pdf)).pages]
    response = client.post("/api/sign", files=_sign_files(pdf), data={"pages": "1-3"})
    assert response.status_code == 200
    reader = PdfReader(io.BytesIO(response.content))
    assert len(reader.pages) == 3
    for i, page in enumerate(reader.pages):
        assert _content_len(page) > before[i]


def test_sign_pages_out_of_range(client):
    response = client.post(
        "/api/sign", files=_sign_files(_make_pdf_bytes(2)), data={"pages": "5"}
    )
    assert response.status_code == 400


def test_sign_pages_garbage(client):
    response = client.post(
        "/api/sign", files=_sign_files(_make_pdf_bytes(1)), data={"pages": "abc"}
    )
    assert response.status_code == 400


def test_sign_cx_out_of_range(client):
    response = client.post(
        "/api/sign", files=_sign_files(_make_pdf_bytes(1)), data={"cx": "150"}
    )
    assert response.status_code == 400


def test_sign_width_zero(client):
    response = client.post(
        "/api/sign", files=_sign_files(_make_pdf_bytes(1)), data={"width": "0"}
    )
    assert response.status_code == 400


def test_sign_rotation_out_of_range(client):
    response = client.post(
        "/api/sign", files=_sign_files(_make_pdf_bytes(1)), data={"rotation": "400"}
    )
    assert response.status_code == 400


def test_sign_unreadable_signature_image(client):
    files = {
        "file": ("doc.pdf", _make_pdf_bytes(1), "application/pdf"),
        "signature": ("sig.png", b"this is not image data at all", "image/png"),
    }
    response = client.post("/api/sign", files=files)
    assert response.status_code == 400
    assert "Signature image is invalid or unreadable" in response.json()["detail"]


def test_sign_prerotated_90_page(client):
    reader = PdfReader(io.BytesIO(_make_pdf_bytes(1)))
    writer = PdfWriter()
    page = reader.pages[0]
    page.rotate(90)
    writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    rotated = buf.getvalue()
    before_box = reader.pages[0].mediabox

    response = client.post("/api/sign", files=_sign_files(rotated))
    assert response.status_code == 200
    out = PdfReader(io.BytesIO(response.content))
    assert len(out.pages) == 1
    assert float(out.pages[0].mediabox.width) == float(before_box.width)
    assert float(out.pages[0].mediabox.height) == float(before_box.height)
    assert (out.pages[0].extract_text() or "").strip() != ""


def test_sign_add_date_grows_more(client):
    pdf = _make_pdf_bytes(1)
    plain = client.post("/api/sign", files=_sign_files(pdf))
    dated = client.post(
        "/api/sign", files=_sign_files(pdf), data={"add_date": "true"}
    )
    assert plain.status_code == 200
    assert dated.status_code == 200
    assert len(dated.content) > len(plain.content)


def test_pdf_to_images_single_page_subset(client):
    files = {"file": ("doc.pdf", _make_pdf_bytes(3), "application/pdf")}
    response = client.post(
        "/api/pdf-to-images",
        files=files,
        data={"format": "png", "dpi": "50", "pages": "2"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


def test_pdf_to_images_two_page_subset_zip(client):
    files = {"file": ("doc.pdf", _make_pdf_bytes(3), "application/pdf")}
    response = client.post(
        "/api/pdf-to-images",
        files=files,
        data={"format": "png", "dpi": "50", "pages": "1-2"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
    assert names == ["page_1.png", "page_2.png"]


def _extract_page1_text(pdf_bytes: bytes) -> str:
    return PdfReader(io.BytesIO(pdf_bytes)).pages[0].extract_text() or ""


def test_sign_custom_date_text(client):
    pdf = _make_pdf_bytes(1)
    custom = "Signed-By-Test-User-2099"
    response = client.post(
        "/api/sign",
        files=_sign_files(pdf),
        data={"add_date": "true", "date_text": custom},
    )
    assert response.status_code == 200
    assert custom in _extract_page1_text(response.content)


def test_sign_empty_date_text_defaults_to_today(client):
    from datetime import datetime

    pdf = _make_pdf_bytes(1)
    response = client.post(
        "/api/sign",
        files=_sign_files(pdf),
        data={"add_date": "true", "date_text": ""},
    )
    assert response.status_code == 200
    now = datetime.now()
    expected = f"{now.strftime('%b')} {now.day}, {now.year}"
    assert expected in _extract_page1_text(response.content)


def test_sign_date_size_changes_output(client):
    pdf = _make_pdf_bytes(1)
    small = client.post(
        "/api/sign",
        files=_sign_files(pdf),
        data={"add_date": "true", "date_size": "8"},
    )
    large = client.post(
        "/api/sign",
        files=_sign_files(pdf),
        data={"add_date": "true", "date_size": "30"},
    )
    assert small.status_code == 200
    assert large.status_code == 200
    assert small.content != large.content


def test_sign_date_position_above_differs_from_below(client):
    from PIL import ImageChops

    from pdf2image import convert_from_bytes

    pdf = _make_pdf_bytes(1)
    custom = "Position-Check-2099"
    below = client.post(
        "/api/sign",
        files=_sign_files(pdf),
        data={"add_date": "true", "date_text": custom, "date_position": "below"},
    )
    above = client.post(
        "/api/sign",
        files=_sign_files(pdf),
        data={"add_date": "true", "date_text": custom, "date_position": "above"},
    )
    assert below.status_code == 200
    assert above.status_code == 200
    assert custom in _extract_page1_text(below.content)
    assert custom in _extract_page1_text(above.content)

    below_img = convert_from_bytes(below.content, dpi=100)[0].convert("L")
    above_img = convert_from_bytes(above.content, dpi=100)[0].convert("L")
    assert below_img.size == above_img.size
    diff = ImageChops.difference(below_img, above_img)
    assert diff.getbbox() is not None

    def _ink_top_bottom(img):
        w, h = img.size
        top = sum(1 for p in img.crop((0, 0, w, h // 2)).tobytes() if p < 128)
        bottom = sum(1 for p in img.crop((0, h // 2, w, h)).tobytes() if p < 128)
        return top, bottom

    below_top, below_bottom = _ink_top_bottom(below_img)
    above_top, above_bottom = _ink_top_bottom(above_img)
    assert above_top > below_top
    assert below_bottom > above_bottom


def test_sign_date_position_invalid(client):
    response = client.post(
        "/api/sign",
        files=_sign_files(_make_pdf_bytes(1)),
        data={"add_date": "true", "date_position": "sideways"},
    )
    assert response.status_code == 400


def test_sign_date_size_out_of_range(client):
    response = client.post(
        "/api/sign",
        files=_sign_files(_make_pdf_bytes(1)),
        data={"add_date": "true", "date_size": "100"},
    )
    assert response.status_code == 400


def test_sign_date_text_too_long(client):
    response = client.post(
        "/api/sign",
        files=_sign_files(_make_pdf_bytes(1)),
        data={"add_date": "true", "date_text": "A" * 200},
    )
    assert response.status_code == 400
    assert "max 100 characters" in response.json()["detail"]
