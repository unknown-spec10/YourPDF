# PDF Toolkit — Backend Architecture (As Built)

> All processing runs server-side. The browser only uploads files and downloads results. Privacy comes from self-hosting plus automatic 15-minute expiry of every output file.

## 1. Product Summary

Self-hostable PDF/image/office processing platform. Next.js frontend uploads files to a FastAPI backend, which runs jobs on Celery workers over Redis and returns a download link. 26 tool pages; no user accounts; no database.

## 2. Processing Model — Server-Side Only

Every byte of processing happens in `backend/`:

- Async tools (everything except protect/unlock): router → Celery task → Redis result → download endpoint.
- Synchronous tools: `POST /api/protect` and `POST /api/unlock` call `pdf_security.protect_pdf_bytes` / `unlock_pdf_bytes` inline (pypdf, in-memory) and return the PDF bytes directly. No `job_id`, no polling; the frontend downloads via `Blob` + `URL.createObjectURL`.

Every byte of processing happens in `backend/`. Any older description of in-browser processing is obsolete and does not apply to this code.

## 3. Backend Layout (`backend/app/`)

```
app/
├── main.py            # app wiring (see §4)
├── config.py          # pydantic-settings: REDIS_URL, CORS_ORIGINS, API_KEY
├── celery_app.py      # Celery broker+backend=REDIS_URL; result_expires=86400;
│                      # task_acks_late=True; prefetch_multiplier=1;
│                      # time limits 1800 hard / 1500 soft
├── uploads.py         # get_tmp_dir(), save_upload_file() → backend/tmp/
├── validation.py      # MAX_FILE_SIZE_MB=50, extension allowlists
├── pdf_security.py    # protect_pdf_bytes / unlock_pdf_bytes (synchronous, no disk, no queue)
├── routers/
│   ├── pdf.py         # /compress /merge /split /pdf-to-images /images-to-pdf
│   │                  # /extract-text /pdf-to-docx (pdf2docx) /docx-to-pdf
│   │                  # /protect /unlock (sync) /rotate /organize /watermark
│   │                  # /add-page-numbers /ocr /pdf-info
│   ├── image.py       # /image/compress /resize /crop /convert /rotate /watermark
│   ├── office.py      # /office/merge-docx /docx-to-images /pptx-to-pdf
│   │                  # /pptx-to-images /merge-pptx
│   └── system.py      # GET /health (no /api prefix), GET /status/{job_id},
│                      # GET /download/{filename}?original_name=&preview=
└── tasks/
    ├── pdf_tasks.py   # includes pdf_to_docx_task via pdf2docx
    ├── image_tasks.py
    ├── office_tasks.py# LibreOffice conversions
    ├── misc_tasks.py  # delete_local_file_task
    └── common.py      # shared task helpers
```

`requirements.txt` is the human-edited floor; `requirements.lock` is the pinned install set (`pip install -r requirements.lock`). No Markdown-conversion dependency exists.

## 4. App Wiring (`main.py`)

- 4 routers, each mounted twice: legacy prefix `/api` and canonical prefix `/api/v1`. New clients use `/api/v1`.
- `health_router` mounted with no prefix → `GET /health` (open, for load balancers/healthchecks).
- `CORSMiddleware` with explicit origins from `CORS_ORIGINS` (default `http://localhost:3000`), never `*`.
- `/static` serves `backend/static/` (local output fallback).
- `api_key_auth` HTTP middleware: when `API_KEY` is non-empty, every path starting with `/api/` requires a matching `X-API-Key` header (constant-time compare, 401, key never logged). `/health`, `/static/*`, `/docs` stay open.

## 5. API Contract

Async endpoints return `202 { job_id, status }`. Status polling:

```
GET /status/{job_id} → queued (Celery PENDING, incl. unknown IDs)
                     → processing (Celery PROGRESS meta: progress, message)
                     → done { result: { download_url, ... } } (SUCCESS)
                     → error (FAILURE, generic message, details logged server-side)
```

Download: `GET /download/{filename}?original_name=...&preview=...`

- Local ephemeral processing → `FileResponse` from `backend/static/outputs/`.
- Traversal guard: `..`, `/`, `\` → 400. Missing file → 404 (already expired).

Sync endpoints (`POST /protect`, `POST /unlock`, no `202`): multipart `file` + `password` form fields, return `application/pdf` bytes with `Content-Disposition: attachment; filename=<base>_protected.pdf` (or `_unlocked.pdf`). Missing password → 400.

## 6. Storage & Cleanup

Processed files are written to `backend/static/outputs/{filename}` and served directly as file responses from `/api/v1/download/{filename}[?original_name=...]`. Each output schedules `delete_local_file_task(path)` with a 15-minute countdown.

The architecture is stateless and serverless-friendly, so anyone can deploy it anywhere. Serverless platforms like Cloud Run are a good fit.

## 7. Task Queue (`celery_app.py` + `tasks/`)

- Broker and result backend: `REDIS_URL` (password-authenticated in both compose files).
- `result_expires=86400` bounds Redis growth; output files themselves expire in 15 minutes regardless.
- `task_acks_late=True` requeues work if a worker dies mid-task; `worker_prefetch_multiplier=1` keeps long jobs from starving others; hard/soft time limits kill runaways (30/25 min).

## 8. Container (`backend/Dockerfile`)

`python:3.12-slim` + Ghostscript, poppler-utils, LibreOffice Writer, ocrmypdf/Tesseract, image build deps. Installs from `requirements.lock`, then `useradd -m -u 10000 appuser` and runs as non-root. Dev compose bind-mounts `./backend:/app`; prod uses named volumes `tmp_data`/`static_data`.

## 9. Request Lifecycle (End to End)

```
1. User drops file on a tool page → useFileJob submitter →
   submitJob('/api/<endpoint>', formData) → POST /api/v1/<endpoint>
2. FastAPI: validate (validation.py) → save to backend/tmp/ (uploads.py)
   → task.delay(...) → 202 { job_id }
3. Frontend: useJobPolling GET /api/v1/status/{job_id} every 2s
4. Celery worker: process (Ghostscript/LibreOffice/Pillow/…) →
   store_processed_file() → SUCCESS result { download_url }
5. Next poll: { status: done, result.download_url } →
   frontend GET /api/v1/download/{filename} → file (direct file response)
6. Celery cleaner deletes the output 15 min later
```

Protect/unlock skip steps 2–4: single request/response, blob download.
