import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import hmac

from app.routers import health_router, image_router, office_router, pdf_router, system_router
from app.config import settings

app = FastAPI(
    title="YourPDF API",
    description="Backend processing engine for YourPDF tools.",
    version="1.0.0"
)

# Enable CORS for local Next.js frontend calls
# Use explicit origins from settings instead of "*" because wildcard origins
# combined with credentials expose the API to any site and browsers reject it.
_cors_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=bool(_cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
    # The desktop shell can run the UI on its own origin (Tauri serves it from
    # http://tauri.localhost) while the API answers on a loopback port. Cross-origin
    # JS cannot read these unless they are explicitly exposed, and without them the
    # client cannot name the downloaded file or show the job notice.
    expose_headers=["Content-Disposition", "X-Job-Notice", "X-OCR-Applied"],
)

# Mount local static outputs directory for file download fallback.
# In the desktop build `backend_root` is inside the install tree — never write there.
# Use the runtime tmp dir the shell provides, and keep backend/static for tests and
# plain-browser runs (where YOURPDF_TMP is unset). Writing into the install dir also
# left empty directories behind after uninstall.
app_dir = os.path.dirname(os.path.abspath(__file__))
backend_root = os.path.dirname(app_dir)
_runtime_tmp = os.environ.get("YOURPDF_TMP")
static_dir = (
    os.path.join(_runtime_tmp, "static")
    if _runtime_tmp
    else os.path.join(backend_root, "static")
)
os.makedirs(os.path.join(static_dir, "outputs"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

app.include_router(health_router)
# Legacy paths: /api/* (backward compatible).
# Canonical versioned paths: /api/v1/*.
app.include_router(pdf_router, prefix="/api")
app.include_router(image_router, prefix="/api")
app.include_router(office_router, prefix="/api")
app.include_router(system_router, prefix="/api")
app.include_router(pdf_router, prefix="/api/v1")
app.include_router(image_router, prefix="/api/v1")
app.include_router(office_router, prefix="/api/v1")
app.include_router(system_router, prefix="/api/v1")


# Optional shared API key auth. Rule: when API_KEY is set (non-empty), every
# request whose path starts with /api/ must present it as X-API-Key. All other
# paths (notably GET /health, /static/*, /docs) stay open so load balancers
# and the interactive docs keep working. The frontend holds the same key and
# sends it on every API call, so no per-route exemption under /api/* is
# needed. Wrong or missing key -> 401 with a generic message. The key value is
# never logged.
@app.middleware("http")
async def api_key_auth(request, call_next):
    configured = (settings.api_key or "").strip()
    # CORS preflight requests never carry custom headers like X-API-Key,
    # so let OPTIONS through; the real request is still checked below.
    if configured and request.method != "OPTIONS" and request.url.path.startswith("/api/"):
        provided = request.headers.get("x-api-key", "")
        if not provided or not hmac.compare_digest(provided, configured):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API key."},
            )
    return await call_next(request)
