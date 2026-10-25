"""Optional API key auth: disabled-by-default open access + enforced when set."""
import io

from fastapi.testclient import TestClient

from app import main
from app.config import settings


def _pdf_file():
    from pypdf import PdfWriter

    buf = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    return {"file": ("doc.pdf", buf.getvalue(), "application/pdf")}


def test_open_access_when_no_key_configured(client):
    # Disabled by default: API + health reachable without a key.
    assert not (settings.api_key or "").strip()
    assert client.get("/health").status_code == 200
    res = client.post("/api/pdf-info", files=_pdf_file())
    assert res.status_code == 200
    assert res.json()["num_pages"] == 1


def test_missing_key_rejected_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "test-secret")
    with TestClient(main.app) as authed:
        res = authed.post("/api/pdf-info", files=_pdf_file())
        assert res.status_code == 401
        assert res.json() == {"detail": "Invalid or missing API key."}
        # Health stays open for load balancers even when auth is on.
        assert authed.get("/health").status_code == 200


def test_correct_key_accepted_wrong_key_rejected(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "test-secret")
    with TestClient(main.app) as authed:
        bad = authed.post(
            "/api/pdf-info", files=_pdf_file(), headers={"X-API-Key": "wrong"}
        )
        assert bad.status_code == 401
        good = authed.post(
            "/api/pdf-info", files=_pdf_file(), headers={"X-API-Key": "test-secret"}
        )
        assert good.status_code == 200
        assert good.json()["num_pages"] == 1


def test_options_preflight_exempt_when_configured(monkeypatch):
    # Browsers never send X-API-Key on CORS preflight, so OPTIONS must pass.
    monkeypatch.setattr(settings, "api_key", "test-secret")
    with TestClient(main.app) as authed:
        preflight = authed.options(
            "/api/v1/split",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert preflight.status_code == 200
        # Real request without a key is still rejected.
        res = authed.post("/api/pdf-info", files=_pdf_file())
        assert res.status_code == 401
