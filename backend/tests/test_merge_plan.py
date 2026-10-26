"""Merge with custom page plan: endpoint validation and ordering."""
import io
import json

from pypdf import PdfReader, PdfWriter


def _make_pdf_bytes(pages: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _merge_files(pages_list=(3, 2)):
    return [
        ("files", (f"doc{i}.pdf", _make_pdf_bytes(n), "application/pdf"))
        for i, n in enumerate(pages_list)
    ]


def test_merge_plan_valid_mixed_order(client):
    plan = json.dumps(
        [
            {"file": 0, "pages": "1-2"},
            {"file": 1, "pages": "all"},
            {"file": 0, "pages": "3-"},
        ]
    )
    response = client.post("/api/merge", files=_merge_files((3, 2)), data={"plan": plan})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(PdfReader(io.BytesIO(response.content)).pages) == 5


def test_merge_plan_invalid_file_index_400(client):
    plan = json.dumps([{"file": 5, "pages": "1"}])
    response = client.post("/api/merge", files=_merge_files(), data={"plan": plan})
    assert response.status_code == 400
    assert "file index" in response.json()["detail"].lower()


def test_merge_plan_invalid_pages_string_400(client):
    plan = json.dumps([{"file": 0, "pages": "abc"}])
    response = client.post("/api/merge", files=_merge_files(), data={"plan": plan})
    assert response.status_code == 400
    assert "pages" in response.json()["detail"].lower()


def test_merge_plan_out_of_range_page_400(client):
    plan = json.dumps([{"file": 0, "pages": "5"}])
    response = client.post("/api/merge", files=_merge_files((2, 1)), data={"plan": plan})
    assert response.status_code == 400
    detail = response.json()["detail"].lower()
    assert "out of range" in detail
    assert "0" in response.json()["detail"]  # file index info
    assert "5" in response.json()["detail"]  # page info


def test_merge_plan_missing_plan_legacy_behavior(client):
    response = client.post("/api/merge", files=_merge_files((1, 2)))
    assert response.status_code == 200
    assert len(PdfReader(io.BytesIO(response.content)).pages) == 3


def test_merge_plan_empty_string_legacy_behavior(client):
    response = client.post("/api/merge", files=_merge_files((1, 2)), data={"plan": ""})
    assert response.status_code == 200
    assert len(PdfReader(io.BytesIO(response.content)).pages) == 3
