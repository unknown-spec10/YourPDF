"""SVG input support for POST /image/convert."""
import io

from PIL import Image


def _svg_bytes(width: int = 120, height: int = 60) -> bytes:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
        f'<rect width="{width}" height="{height}" fill="red"/>'
        '<circle cx="30" cy="30" r="20" fill="blue"/>'
        "</svg>"
    ).encode("utf-8")


def _svg_file(name: str = "vector.svg", width: int = 120, height: int = 60):
    return {"file": (name, _svg_bytes(width, height), "image/svg+xml")}


def _pillow_file(name: str, fmt: str):
    img = Image.new("RGB", (10, 10), color="green")
    buf = io.BytesIO()
    img.save(buf, fmt)
    mime = {"BMP": "image/bmp", "GIF": "image/gif"}[fmt]
    return {"file": (name, buf.getvalue(), mime)}


def test_svg_to_png_natural_size(client):
    r = client.post("/api/image/convert", files=_svg_file(), data={"target_format": "png"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(r.content)).size == (120, 60)


def test_svg_render_width(client):
    r = client.post(
        "/api/image/convert",
        files=_svg_file(),
        data={"target_format": "png", "render_width": "240"},
    )
    assert r.status_code == 200
    assert Image.open(io.BytesIO(r.content)).size == (240, 120)


def test_svg_to_jpg_rgb(client):
    r = client.post("/api/image/convert", files=_svg_file(), data={"target_format": "jpg"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(r.content)).mode == "RGB"


def test_invalid_svg_400(client):
    files = {"file": ("bad.svg", b"this is not an svg at all", "image/svg+xml")}
    r = client.post("/api/image/convert", files=files, data={"target_format": "png"})
    assert r.status_code == 400


def test_bmp_and_gif_inputs_accepted(client):
    for name, fmt in (("photo.bmp", "BMP"), ("anim.gif", "GIF")):
        r = client.post(
            "/api/image/convert", files=_pillow_file(name, fmt), data={"target_format": "png"}
        )
        assert r.status_code == 200, name
        Image.open(io.BytesIO(r.content)).verify()


def _png_file(name: str = "photo.png", width: int = 50, height: int = 40):
    img = Image.new("RGB", (width, height), color="red")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return {"file": (name, buf.getvalue(), "image/png")}


def _jpg_file(name: str = "photo.jpg", width: int = 33, height: int = 21):
    img = Image.new("RGB", (width, height), color="blue")
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return {"file": (name, buf.getvalue(), "image/jpeg")}, width, height


def _parse_svg(body: bytes):
    import xml.etree.ElementTree as ET

    root = ET.fromstring(body)
    local = root.tag.rsplit("}", 1)[-1]
    assert local == "svg"
    images = [el for el in root.iter() if el.tag.rsplit("}", 1)[-1] == "image"]
    assert len(images) >= 1
    href = images[0].get("href") or images[0].get("{http://www.w3.org/1999/xlink}href")
    assert href is not None and href.startswith("data:image/png;base64,")
    return root


def test_png_to_svg_wrapper(client):
    r = client.post(
        "/api/image/convert", files=_png_file(), data={"target_format": "svg"}
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/svg+xml"
    root = _parse_svg(r.content)
    assert root.get("width") == "50"
    assert root.get("height") == "40"


def test_jpg_to_svg_wrapper(client):
    files, w, h = _jpg_file()
    r = client.post("/api/image/convert", files=files, data={"target_format": "svg"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/svg+xml"
    root = _parse_svg(r.content)
    assert root.get("width") == str(w)
    assert root.get("height") == str(h)


def test_svg_to_svg_passthrough(client):
    original = _svg_bytes(120, 60)
    files = {"file": ("vector.svg", original, "image/svg+xml")}
    r = client.post("/api/image/convert", files=files, data={"target_format": "svg"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/svg+xml"
    assert r.content == original


def test_svg_target_format_accepted(client):
    r = client.post(
        "/api/image/convert",
        files=_pillow_file("photo.bmp", "BMP"),
        data={"target_format": "svg"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/svg+xml"


def test_render_width_out_of_range_400(client):
    r = client.post(
        "/api/image/convert",
        files=_svg_file(),
        data={"target_format": "png", "render_width": "10"},
    )
    assert r.status_code == 400
