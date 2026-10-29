# YourPDF — Architecture (As Built)

> All processing runs server-side and synchronously. The browser only uploads files and downloads results. Privacy comes from self-hosting plus best-effort immediate cleanup of every upload and temp output.

**Status:** Built and shipping. This document describes the code as it exists, not a plan. It replaces the removed `docs/yourpdf-architecture.md` and `docs/pdf-toolkit-architecture.md`, which described a deleted async Celery/Redis model.

## 1. Stack summary

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS, Framer Motion, react-dropzone, Zustand, Axios; `output: "standalone"` |
| Backend | Python 3.12, FastAPI (Uvicorn), pypdf + pikepdf + Ghostscript + Pillow + img2pdf + pdf2image + pdf2docx + reportlab + python-docx + python-pptx + ocrmypdf/Tesseract |
| Job queue | None — fully synchronous, no Celery, no Redis, no Flower, no polling |
| Web server | Nginx reverse proxy (`/` → frontend:3000, `/api/` → backend:8000, `/static/` → backend, 10r/s limit) |
| Storage | Local ephemeral processing (`backend/tmp/`); no database; outputs returned as direct byte responses |
| Containers | Docker + Compose; backend image runs as non-root (`appuser`, uid 10000); deps from pinned `requirements.lock` |

## 2. Sync processing model

Every endpoint follows one pattern: `POST` multipart → validate → process inline → return bytes in the same response.

```
1. Tool page builds FormData (buildSingleFileFormData / buildMultiFileFormData in lib/api.ts)
2. useFileJob submitter calls submitJob('/api/<endpoint>', formData)
   → resolveApiPath() rewrites to canonical /api/v1/<endpoint>
   → POST multipart to FastAPI (X-API-Key header when NEXT_PUBLIC_API_KEY is set)
3. Router validates (validation.py), saves upload to backend/tmp/ (uploads.py),
   calls the sync task function and blocks until it returns
4. Router returns Response(bytes, Content-Disposition: attachment; filename="...")
   (extract-text without export_txt returns JSON { text } instead)
5. Frontend branches on content-type and exposes a blob object URL for download
6. Task finally-block calls cleanup_paths() — upload + temp output deleted best-effort
```

There is no `202 { job_id }`, no `GET /status/{job_id}` polling, no `GET /download/{filename}`, no result backend, and no scheduled cleaner.

## 3. Backend layout (`backend/app/`)

```
app/
├── main.py            # app wiring (see §4)
├── config.py          # pydantic-settings: CORS_ORIGINS, API_KEY (names only)
├── uploads.py         # get_tmp_dir(), save_upload_file() / save_multi_upload() → backend/tmp/
├── validation.py      # MAX_FILE_SIZE_MB=30, per-endpoint extension allowlists
├── pdf_security.py    # protect_pdf_bytes / unlock_pdf_bytes (pypdf, in-memory)
├── routers/
│   ├── pdf.py         # /compress /merge (plan) /split /pdf-to-images (pages) /images-to-pdf
│   │                  # /extract-text (layout) /pdf-to-docx (pdf2docx) /docx-to-pdf
│   │                  # /protect /unlock (in-memory) /rotate (any angle) /organize
│   │                  # /watermark (per-page) /sign (file, signature, pages, cx, cy, width, rotation, add_date)
│   │                  # /add-page-numbers /ocr /pdf-info
│   ├── image.py       # /image/compress /resize /crop /convert /rotate /watermark
│   ├── office.py      # /office/merge-docx /docx-to-images /pptx-to-pdf
│   │                  # /pptx-to-images /merge-pptx
│   └── system.py      # health_router only: GET /health (no /api prefix, no queue routes)
└── tasks/
    ├── pdf_tasks.py   # sync functions incl. merge planner, layout extract, pdf2docx, ocrmypdf
    ├── image_tasks.py # sync Pillow functions
    ├── office_tasks.py# sync LibreOffice conversions
    └── common.py      # resolve_path, ensure_tmp_dir, cleanup_paths, read/write helpers,
                       # SUBPROCESS_TIMEOUT=600 for Ghostscript/LibreOffice/ocrmypdf
```

`requirements.txt` is the human-edited floor; `requirements.lock` is the pinned install set (`pip install -r requirements.lock`). No Markdown-conversion dependency exists. No `celery_app.py` exists.

### Notable task behaviors

- **Merge planner:** `merge_pdfs_task(paths, plan)` — empty `plan` appends whole files; otherwise `plan` is JSON `[{"file": idx, "pages": "1-3, 5" | "all" | "3-"}]` applied in order.
- **Rotate:** `rotate_pdf_task(path, rotation: float)` — `-360…360` excl. `0`; multiples of 90 use `/Rotate`, other angles re-render via transform.
- **Extract text:** `page.extract_text(extraction_mode="layout")` — layout-preserving; `export_txt=True` returns file bytes, else JSON.
- **Watermark:** `watermark_pdf_task(..., pages="all")` — stamps only target pages parsed from `pages`.
- **PDF to images:** `pdf_to_images_task(..., pages="all")` — renders only target pages parsed from `pages`; a single rendered image returns as a direct image, multiple return as a ZIP.
- **Sign:** `sign_pdf_task(path, signature_path, pages="all", cx, cy, width, rotation, add_date)` — builds a transparent reportlab overlay of the signature image (plus an optional date line) sized/positioned/rotated from the `cx`/`cy`/`width` percentages and `rotation` float, then merges it onto only target pages parsed from `pages`; pages with a non-zero `/Rotate` get an un-rotation transform merge instead of a direct merge.
- **OCR:** shells to `ocrmypdf --skip-text -l <lang>` with a 600 s timeout; missing binary → 500 "not installed or configured".
- **Protect/unlock:** never touch disk — `await file.read()` → `protect/unlock_pdf_bytes` → bytes.

## 4. App wiring (`main.py`)

- 4 routers (`pdf`, `image`, `office`, `system`), each mounted twice: legacy prefix `/api` and canonical prefix `/api/v1`. New clients use `/api/v1`.
- `health_router` mounted with no prefix → `GET /health` (open, for load balancers/healthchecks).
- `CORSMiddleware` with explicit origins from `CORS_ORIGINS` (default `http://localhost:3000`), never `*`.
- `/static` serves `backend/static/` (local fallback).
- `api_key_auth` HTTP middleware: when `API_KEY` is non-empty, every path starting with `/api/` requires a matching `X-API-Key` header (constant-time compare, 401, key never logged). `/health`, `/static/*`, `/docs` stay open. CORS preflights (`OPTIONS`) pass through.

## 5. Tmp / cleanup model

- Uploads: `uploads.py` writes to `backend/tmp/upload_<uuid>.<ext>` and returns the `tmp/...` relative path.
- Outputs: tasks write beside the upload (same tmp dir) or re-read into memory.
- Cleanup: every task ends with `cleanup_paths(upload, output)` in a `finally` block — best-effort `os.remove`, missing/failed deletes ignored. Nothing survives the request on success or failure; there is no expiry job.
- `SUBPROCESS_TIMEOUT = 600` bounds Ghostscript/LibreOffice/ocrmypdf so a crafted file can't hang a request slot forever.

## 6. Auth, CORS, no-DB statelessness

| Concern | Behavior |
|---|---|
| Auth | Optional shared `X-API-Key` on all `/api/*` routes; unset on both sides = off |
| CORS | Allow-list from `CORS_ORIGINS` env name (default `http://localhost:3000`); credentials only when origins set |
| State | Stateless — no DB, no broker, no result store; any replica can serve any request |
| Validation | `validation.py`: 30 MB cap, per-endpoint extension allowlists, 400 on violation; protect/unlock require non-empty password |
| Transport | Nginx terminates browser traffic; HTTPS is applied outside the compose stack in prod |

## 7. Docker images

- `backend`: `python:3.12-slim` builder + runtime; system deps Ghostscript, poppler-utils, LibreOffice Writer, ocrmypdf/Tesseract; installs from `requirements.lock`; `useradd -m -u 10000 appuser`, runs as non-root; `CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}` (compose overrides to `--port 8000 --workers 2`).
- `frontend`: multi-stage Node 20 — `deps` → `builder` (`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_API_KEY` baked via `ARG`) → `runner` (non-root `nextjs`, `node server.js` on 3000, standalone output).
- `nginx`: `nginx:alpine` + `nginx.conf` (`/` → frontend, `/api/` + `/static/` → backend, `client_max_body_size 50M`, `api_limit` 10r/s burst 20, bad-bot/dotfile/PHP blocks).
- Registry convention: `${DOCKERHUB_USERNAME:-deepdocker2023}/yourpdf-backend:latest` and `.../yourpdf-frontend:latest` — single `latest` tag, no versioning.

## 8. Frontend structure (`frontend/src/`)

- `lib/api.ts`: `API_URL` (`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`), `API_PREFIX` (`NEXT_PUBLIC_API_PREFIX`, default `/api/v1`), `resolveApiPath()` (rewrites legacy `/api/*` → `/api/v1/*`), `submitJob(endpoint, formData): Promise<Response>` — direct POST returning the raw response; `buildSingleFileFormData()` / `buildMultiFileFormData()`; `apiKeyHeaders()` for raw `fetch()` sites; `parseFilenameFromDisposition()` for the download name.
- `hooks/useFileJob.ts`: the only job hook (no polling hook exists). `submit(args)` POSTs via the submitter, branches on `content-type` (JSON → `data`, bytes → `blob()` + `URL.createObjectURL` → `downloadUrl`/`fileName`), exposes `isSubmitting`/`isDone`/`isError`/`submitError`/`reset`. Revokes object URLs on reset/unmount.
- 27 tool dirs under `src/app/`: add-page-numbers, compress, compress-image, convert-image, crop-image, docx-to-images, docx-to-pdf, extract-text, images-to-pdf, merge, merge-docx, merge-pptx, ocr, organize, pdf-to-docx, pdf-to-images, pptx-to-images, pptx-to-pdf, protect, resize-image, rotate, rotate-image, sign, split, unlock, watermark, watermark-image — plus `how-it-works`, `tools`, and the homepage. Every tool page is a `'use client'` component calling `submitJob` directly. PDF→Word preview uses `mammoth` (`convertToHtml`) in the browser. No Markdown tool exists.

## 9. Deploy topologies

- Local dev: backend `uvicorn` on 8000 + frontend `npm run dev -- --webpack` on 3000, all on the host (no compose services).
- Self-host: `docker-compose.prod.yml` — `backend`, `frontend`, `nginx` (+ `tmp_data`/`static_data` volumes).
- Cloud Run: `yourpdf-frontend` + `yourpdf-backend` services (`us-central1`), same `latest` images.

Full commands and env reference: `docs/deploy.md`.
