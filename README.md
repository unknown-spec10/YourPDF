# YourPDF & YourImage

YourPDF is a production-grade, privacy-first, open-source PDF, image, and office-file processing platform.

**All processing runs server-side.** The Next.js frontend uploads files to the FastAPI backend, which dispatches Celery jobs over Redis. The browser only uploads files and downloads results; it performs no processing. Privacy comes from self-hosting plus automatic 15-minute expiry of every output file (deleted by a Celery cleaner task).

## Features

### PDF Utilities (`frontend/src/app/*`, `backend/app/routers/pdf.py`)

- **Merge** (`/merge`) — combine multiple PDFs.
- **Split** (`/split`) — extract page ranges.
- **Compress** (`/compress`) — Ghostscript/pikepdf size reduction.
- **PDF to Images** (`/pdf-to-images`) — PNG/JPG per page.
- **Images to PDF** (`/images-to-pdf`) — lossless via img2pdf.
- **Extract Text** (`/extract-text`) — text-layer extraction.
- **PDF to Word** (`/pdf-to-docx`) — via `pdf2docx` (kept; no Markdown converter exists).
- **Word to PDF** (`/docx-to-pdf`) — via LibreOffice.
- **Protect** (`/protect`) — password-encrypt, **synchronous**, direct blob download.
- **Unlock** (`/unlock`) — password-decrypt, **synchronous**, direct blob download.
- **Rotate** (`/rotate`) — 90/180/270.
- **Organize** (`/organize`) — reorder pages.
- **Watermark** (`/watermark`) — text overlay.
- **Add Page Numbers** (`/add-page-numbers`).
- **OCR** (`/ocr`) — scanned PDFs to searchable PDF (ocrmypdf/Tesseract).

### Image Utilities (`backend/app/routers/image.py`)

- **Compress Image** (`/compress-image`) — JPG/PNG/WEBP.
- **Resize Image** (`/resize-image`) — pixel size or percentage.
- **Crop Image** (`/crop-image`).
- **Convert Image** (`/convert-image`) — JPG/PNG/WEBP/BMP/TIFF.
- **Rotate Image** (`/rotate-image`) — 90/180/270.
- **Watermark Image** (`/watermark-image`) — text overlay.

### Office Utilities (`backend/app/routers/office.py`)

- **Merge Word** (`/merge-docx`).
- **Word to Images** (`/docx-to-images`) — PNG/JPG per page.
- **PPT to PDF** (`/pptx-to-pdf`) — via LibreOffice.
- **PPT to Images** (`/pptx-to-images`) — PNG/JPG per slide.
- **Merge PPT** (`/merge-pptx`).

26 tool pages total. There is no Convert-to-Markdown tool.

## Repository Layout

```
pdf-toolkit/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app: 4 routers, API-key middleware, CORS, /static mount
│   │   ├── config.py          # pydantic-settings (REDIS_URL, CORS_ORIGINS, API_KEY)
│   │   ├── celery_app.py      # broker+backend=Redis, result_expires, acks_late
│   │   ├── uploads.py         # tmp-dir persistence helpers
│   │   ├── validation.py      # size/extension validation (50 MB default)
│   │   ├── pdf_security.py    # synchronous protect/unlock (pypdf, in-memory)
│   │   ├── routers/           # pdf.py, image.py, office.py, system.py (health/status/download)
│   │   └── tasks/             # pdf_tasks.py, image_tasks.py, office_tasks.py, misc_tasks.py, common.py
│   ├── Dockerfile             # python:3.12-slim, system deps, requirements.lock, non-root appuser
│   ├── requirements.txt       # human-edited floor file
│   └── requirements.lock      # pinned install set — install from this file
├── frontend/                  # Next.js 16 App Router (TypeScript)
│   └── src/
│       ├── app/               # 26 tool dirs + how-it-works + tools index
│       ├── lib/api.ts         # API_URL, API_PREFIX, submitJob, buildDownloadUrl, X-API-Key
│       └── hooks/             # useFileJob.ts wraps useJobPolling.ts
├── nginx/
│   └── nginx.conf             # / -> frontend:3000, /api/ -> backend:8000, 10r/s API rate limit
├── docker-compose.yml         # dev: redis + celery_worker (backend runs on host)
├── docker-compose.prod.yml    # prod: redis, backend, celery_worker, flower, frontend, nginx
└── docs/                      # architecture + deploy docs (tracked in git)
```

## Request Flow

All tools except Protect/Unlock (synchronous, see below) follow the async job pattern:

```
1. Tool page builds FormData (buildSingleFileFormData / buildMultiFileFormData in lib/api.ts)
2. useFileJob submitter calls submitJob('/api/<endpoint>', formData)
   → api.ts resolveApiPath() rewrites to canonical /api/v1/<endpoint>
   → POST multipart to FastAPI (X-API-Key header when NEXT_PUBLIC_API_KEY is set)
3. Router validates file (validation.py), saves to backend/tmp/ (uploads.py),
   enqueues Celery task, returns 202 { job_id, status }
4. useJobPolling polls GET /api/v1/status/{job_id} every 2s
   → queued → processing (Celery PROGRESS meta) → done | error
5. done returns result.download_url = /api/v1/download/{filename}?original_name=...
6. GET /api/v1/download/{filename}: FileResponse from backend/static/outputs/
7. Cleanup after 15 min: delete_local_file_task via Celery countdown
```

**Protect/Unlock are synchronous:** `POST /api/protect` and `POST /api/unlock` call `protect_pdf_bytes`/`unlock_pdf_bytes` inline (no Celery queue, no job_id). The frontend `fetch()`es the endpoint, reads `res.blob()`, and downloads via `URL.createObjectURL` — no polling.

## Storage (Local Ephemeral Processing)

Processed files are written to `backend/static/outputs/` and served directly as file responses from the same download endpoint (also mounted at `/static` for direct access). Each output is scheduled for deletion 15 minutes after creation via `delete_local_file_task` with a Celery countdown.

The architecture is stateless and serverless-friendly, so anyone can deploy it anywhere. Serverless platforms like Cloud Run are a good fit.

## Auth Model

Optional shared API key, no user accounts, no database:

- Backend: `API_KEY` env. When non-empty, `api_key_auth` middleware in `main.py` rejects every `path.startswith("/api/")` request without a matching `X-API-Key` header (constant-time compare, 401 generic message, key never logged). `/health`, `/static/*`, `/docs` stay open.
- Frontend: `NEXT_PUBLIC_API_KEY` env. When set, `apiClient` sends `X-API-Key` on every axios call and `apiKeyHeaders()` covers raw `fetch()` call sites (protect/unlock pages).
- Both unset = auth disabled (default for local dev).

## Rate Limiting & Validation

- Nginx: `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s`, `burst=20 nodelay` on `location /api/`; `client_max_body_size 50M`; bad-bot and dotfile/PHP blocks.
- Backend: `validation.py` — 50 MB default size cap, per-endpoint extension allowlists, 400 on violation. Download endpoint rejects path traversal (`..`, `/`, `\` → 400).

## Monitoring

- **Flower** (prod compose only): `flower` service, `celery -A app.celery_app.celery flower --port=5555 --basic_auth=${FLOWER_USER}:${FLOWER_PASSWORD}`, port `5555:5555`.
- **Healthchecks**: Redis (`redis-cli ping`), backend (`GET /health`), Celery worker (`celery inspect ping`) in both compose files.
- **Logs**: both compose files use the default Docker log driver.
- Celery config: `result_expires=86400`, `task_acks_late=True`, `worker_prefetch_multiplier=1`, `task_time_limit=1800`, `task_soft_time_limit=1500`.

## Deploy Topology

```
Browser → Nginx:80 ─┬─ / ─────→ frontend:3000 (Next.js standalone)
                     └─ /api/* ─→ backend:8000 (uvicorn, 2 workers)
backend ⇄ redis:6379 (password via REDIS_PASSWORD, REDIS_URL=redis://:<pw>@redis:6379/0)
celery_worker ⇄ redis ─→ backend/static/outputs → backend /api/v1/download/*
flower:5555 (prod only, basic auth)
```

- Dev (`docker-compose.yml`): services `redis`, `celery_worker`. Backend runs on host for hot-reload.
- Prod (`docker-compose.prod.yml`): services `redis`, `backend`, `celery_worker`, `flower`, `frontend`, `nginx` with `tmp_data`/`static_data` volumes and `depends_on` health conditions.

## Local Development Setup

### Prerequisites

- Python 3.12+, Node.js 20+, Docker + Docker Compose.

### 1. Start Infrastructure Services (Redis & Celery)

```bash
docker compose up -d
# services: redis, celery_worker
# verify: docker compose ps ; docker compose logs -f celery_worker
```

### 2. Set Up the Backend

Backend runs on the host during dev:

```bash
cd backend
copy .env.template .env        # Windows (use `cp` on Linux/macOS)
```

Set in `backend/.env` (see `.env.template` for the full list):

```env
REDIS_URL=redis://:dev-redis-password@localhost:6379/0
REDIS_PASSWORD=dev-redis-password
CORS_ORIGINS=http://localhost:3000
# API_KEY=                     # leave empty = auth disabled for dev
```

Then:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.lock
uvicorn app.main:app --reload --port 8000
```

API at `http://localhost:8000`, interactive docs at `http://localhost:8000/docs`, health at `http://localhost:8000/health`.

### 3. Set Up the Frontend

```bash
cd ../frontend
npm install
copy .env.template .env.local
```

`frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_API_KEY=          # must match backend API_KEY when backend auth is on
# NEXT_PUBLIC_API_PREFIX=/api/v1
```

```bash
npm run dev
```

Open `http://localhost:3000`.

## Production Deployment

### 1. Configure Environment (project root `.env`)

```env
REDIS_PASSWORD=change-me-in-production
API_KEY=change-me-in-production
FLOWER_USER=admin
FLOWER_PASSWORD=change-me-in-production
# CORS_ORIGINS=https://your-domain
# DOCKERHUB_USERNAME=          # defaults to unknowndockerishere
```

### 2. Build and Launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Nginx binds port `80`: `/` → frontend, `/api/*` → backend (rate-limited), `/static/*` served by backend.

### 3. Operate

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f celery_worker
docker compose -f docker-compose.prod.yml logs -f flower
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

Flower UI: `http://<host>:5555` (FLOWER_USER/FLOWER_PASSWORD basic auth).

---

## Running Tests

### Backend Tests

```bash
cd backend   # with venv activated
pytest
```

### Frontend Tests

```bash
cd frontend
npm run test
```
