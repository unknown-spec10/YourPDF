# YourPDF — Full Architecture (As Built)

> All processing runs server-side. The browser only uploads files and downloads results. Privacy comes from self-hosting plus automatic 15-minute expiry of every output file.

**Status:** Built and shipping. This document describes the code as it exists, not a plan.

## 1. Stack Summary

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS, Framer Motion, react-dropzone, Zustand, Axios + React Query |
| Backend | Python 3.12, FastAPI (Uvicorn), pypdf + pikepdf + Ghostscript + Pillow + img2pdf + pdf2image + pdf2docx + reportlab + python-docx + python-pptx + ocrmypdf/Tesseract |
| Task queue | Celery 5 + Redis 7 (broker and result backend) |
| Web server | Nginx reverse proxy (`/` → frontend:3000, `/api/` → backend:8000, 10r/s limit) |
| Storage | Local ephemeral processing (`backend/static/outputs/`), 15-min auto-expiry |
| Monitoring | Flower (prod compose, port 5555, basic auth), Docker healthchecks |
| Containers | Docker + Compose; backend image runs as non-root (`appuser`, uid 10000); deps from pinned `requirements.lock` |

## 2. Processing Model — Server-Side Only

No operation runs in the browser. The two patterns are:

- **Async (24 tools):** page → `submitJob` → `POST /api/v1/<endpoint>` → `202 { job_id }` → poll `GET /api/v1/status/{job_id}` every 2s → `GET /api/v1/download/{filename}`.
- **Synchronous (protect, unlock):** page `fetch()`es `POST /api/protect` / `POST /api/unlock` (multipart `file` + `password`), reads `res.blob()`, downloads via `URL.createObjectURL`. No job, no polling. Backend runs `pdf_security` helpers inline (pypdf, in-memory).

## 3. Frontend (`frontend/src/`)

- `lib/api.ts`: `API_URL` (`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`), `API_PREFIX` (`NEXT_PUBLIC_API_PREFIX`, default `/api/v1`), `resolveApiPath()` (rewrites legacy `/api/*` → `/api/v1/*`), `submitJob(endpoint, formData)` → `job_id`, `buildDownloadUrl()`, `buildSingleFileFormData()` / `buildMultiFileFormData()`, optional `X-API-Key` from `NEXT_PUBLIC_API_KEY` (axios default + `apiKeyHeaders()` for raw `fetch()`).
- `hooks/useJobPolling.ts`: React Query poll of `/api/status/{job_id}` every 2s until `done`/`error`.
- `hooks/useFileJob.ts`: wraps `useJobPolling` with submit lifecycle (`submit`/`reset`, `isSubmitting`/`isQueued`/`isProcessing`/`isDone`/`isError`, `getDownloadUrl(originalName)`). Every async tool page uses it.
- 26 tool dirs under `src/app/`: add-page-numbers, compress, compress-image, convert-image, crop-image, docx-to-images, docx-to-pdf, extract-text, images-to-pdf, merge, merge-docx, merge-pptx, ocr, organize, pdf-to-docx, pdf-to-images, pptx-to-images, pptx-to-pdf, protect, resize-image, rotate, rotate-image, split, unlock, watermark, watermark-image — plus `how-it-works`, `tools`, and the homepage. No Markdown tool exists.

## 4. Backend

See `docs/pdf-toolkit-architecture.md` for the full backend reference. Essentials:

- `main.py` wires 4 routers (`pdf`, `image`, `office`, `system`) at `/api` (legacy) and `/api/v1` (canonical), plus open `GET /health`.
- Optional shared-key auth: backend `API_KEY` ↔ frontend `NEXT_PUBLIC_API_KEY` via `X-API-Key`; unset on both sides = auth off.
- CORS origins from `CORS_ORIGINS` (default `http://localhost:3000`).
- Celery: `result_expires=86400`, `acks_late=True`, prefetch 1, 30/25-min time limits.
- PDF→Word uses `pdf2docx`; no Markdown conversion exists.

## 5. Security & Privacy

| Layer | Measure |
|---|---|
| Transport | Nginx reverse proxy; HTTPS terminated outside the compose stack in prod |
| Auth | Optional shared `X-API-Key` on all `/api/*` routes |
| Rate limiting | Nginx `api_limit` 10r/s, burst 20, on `location /api/` |
| Validation | Server-side MIME/extension checks, 50 MB default cap, traversal guard on download |
| Lifetimes | Local outputs deleted 15 min after creation |
| Temp files | Uploads land in `backend/tmp/`; task outputs cleaned by Celery tasks |

Privacy statement for users: files are processed on the server you (or your host) run, and every output is auto-deleted after 15 minutes. Nothing runs in the browser.

## 6. Deploy Topology

```
Browser → Nginx:80 ─┬─ / ─────→ frontend:3000
                     └─ /api/* ─→ backend:8000 (uvicorn --workers 2)
backend ⇄ redis:6379 (REDIS_PASSWORD) ─ celery_worker ─→ backend/static/outputs
flower:5555 (prod only, FLOWER_USER/FLOWER_PASSWORD basic auth)
```

- Dev (`docker-compose.yml`): `redis`, `celery_worker`. Backend runs on host (`uvicorn app.main:app --reload`).
- Prod (`docker-compose.prod.yml`): `redis`, `backend`, `celery_worker`, `flower`, `frontend`, `nginx`; `tmp_data`/`static_data` volumes; health-gated `depends_on`; default Docker logging.

The architecture is stateless and serverless-friendly, so anyone can deploy it anywhere. Serverless platforms like Cloud Run are a good fit.

Full commands and env reference: `docs/deploy.md`.
