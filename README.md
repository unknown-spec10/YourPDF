# YourPDF & YourImage

YourPDF is a privacy-first, open-source PDF, image, and office-file processing platform.

**All processing runs server-side and synchronously.** The Next.js frontend uploads files directly to the FastAPI backend; every `POST` returns processed bytes (or JSON for text extraction) in the same response. There is **no Celery, no Redis, no Flower, no job queue, no polling, and no database**. Uploads land in `backend/tmp/` and are deleted best-effort right after each task via `cleanup_paths` in `backend/app/tasks/common.py` — outputs are returned as `Content-Disposition: attachment` downloads, never stored for later retrieval.

## Features

27 tool pages under `frontend/src/app/`. Every tool page is a client component (`'use client'`) that calls the API directly (`submitJob` in `lib/api.ts`) and downloads the result via a blob object URL (`URL.createObjectURL`).

### PDF tools (`backend/app/routers/pdf.py`)

- **Merge** (`/merge`, `/api/merge`) — combine 2+ PDFs. Simple mode appends whole files; custom planner mixes page ranges across files (`"1-3, 5"`, `"all"`, open-ended `"3-"`) via a JSON `plan` of `{file, pages}` blocks.
- **Split** (`/split`) — extract page ranges (`mode` + `pages_spec`, e.g. `1-3, 5`).
- **Compress** (`/compress`) — Ghostscript/pikepdf size reduction (`quality`).
- **PDF to Images** (`/pdf-to-images`) — PNG/JPG per page (`format`, `dpi`, `pages`: `"all"` or `"1-3, 5"`; a single selected page returns a direct image, subsets otherwise ZIP like before).
- **Images to PDF** (`/images-to-pdf`) — PNG/JPG to PDF via img2pdf.
- **Extract Text** (`/extract-text`) — layout-preserving text extraction (`extraction_mode="layout"`); returns JSON text in-browser, or a `.txt` download when `export_txt=true`.
- **PDF to Word** (`/pdf-to-docx`) — via `pdf2docx`; result page renders an in-browser Word preview with `mammoth` (`convertToHtml`) plus a `.docx` download.
- **Word to PDF** (`/docx-to-pdf`) — via LibreOffice.
- **Protect** (`/protect`) — password-encrypt, synchronous, direct blob download.
- **Unlock** (`/unlock`) — password-decrypt, synchronous, direct blob download.
- **Rotate** (`/rotate`) — ANY angle, not presets: slider + numeric input with decimals (e.g. `37.5°`), `-360…360` excluding `0`; negatives rotate counterclockwise. Multiples of 90 use the fast `/Rotate` path; other angles re-render content via transform.
- **Organize** (`/organize`) — reorder/delete pages (`page_order` spec).
- **Watermark** (`/watermark`) — text overlay with `text`, `color`, `opacity`, `rotation` (0–359), `font_size` (12–200), and per-page targeting (`pages`: `"all"` or `"1-3, 5"`).
- **Add Page Numbers** (`/add-page-numbers`) — stamp numbers (`position`, e.g. `bottom-center`).
- **OCR** (`/ocr`) — scanned PDFs to searchable PDF via ocrmypdf/Tesseract (`language`, default `eng`).
- **Sign PDF** (`/sign`) — draw, type, or upload a signature; place it on any page with drag, resize, and any-angle rotation; optional date line.
- **PDF Info** (`/pdf-info`, backend helper, no dedicated page) — returns `{ num_pages }`; used by the merge/watermark pages for page counts.

### Image tools (`backend/app/routers/image.py`)

- **Compress Image** (`/image/compress`) — JPG/PNG/WEBP.
- **Resize Image** (`/image/resize`) — pixel size or percentage.
- **Crop Image** (`/image/crop`).
- **Convert Image** (`/image/convert`) — JPG/PNG/WEBP/BMP/TIFF.
- **Rotate Image** (`/image/rotate`).
- **Watermark Image** (`/image/watermark`) — text overlay.

### Office tools (`backend/app/routers/office.py`)

- **Merge Word** (`/office/merge-docx`).
- **Word to Images** (`/office/docx-to-images`) — PNG/JPG per page.
- **PPT to PDF** (`/office/pptx-to-pdf`) — via LibreOffice.
- **PPT to Images** (`/office/pptx-to-images`) — PNG/JPG per slide.
- **Merge PPT** (`/office/merge-pptx`).

27 tool pages total. There is no Convert-to-Markdown tool.

## Repository layout

```
pdf-toolkit/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app: 4 routers at /api + /api/v1, API-key middleware, CORS, /static mount
│   │   ├── config.py          # pydantic-settings: CORS_ORIGINS, API_KEY (names only; no Redis settings)
│   │   ├── uploads.py         # tmp-dir persistence helpers (backend/tmp/)
│   │   ├── validation.py      # 30 MB size cap, per-endpoint extension allowlists
│   │   ├── pdf_security.py    # protect/unlock helpers (pypdf, in-memory)
│   │   ├── routers/           # pdf.py, image.py, office.py, system.py (health only)
│   │   └── tasks/             # pdf_tasks.py, image_tasks.py, office_tasks.py, common.py (cleanup_paths)
│   ├── Dockerfile             # python:3.12-slim, Ghostscript/poppler/LibreOffice/ocrmypdf, non-root appuser
│   ├── requirements.txt       # human-edited floor file
│   └── requirements.lock      # pinned install set — install from this file
├── frontend/                  # Next.js 16 App Router, output: standalone (TypeScript)
│   └── src/
│       ├── app/               # 27 tool dirs + how-it-works + tools index (all tools are client components)
│       ├── lib/api.ts         # API_URL, API_PREFIX, submitJob (direct POST → Response), blob-download helpers, X-API-Key
│       └── hooks/             # useFileJob.ts (direct-download hook: POST, branch JSON vs bytes, blob URL)
├── nginx/
│   └── nginx.conf             # / -> frontend:3000, /api/ -> backend:8000, /static/ -> backend, 10r/s API rate limit
├── docker-compose.prod.yml   # prod: backend (uvicorn --workers 2), frontend, nginx
└── docs/                      # architecture.md + deploy.md
```

## Request flow (synchronous, every tool)

```
1. Tool page builds FormData (buildSingleFileFormData / buildMultiFileFormData in lib/api.ts)
2. useFileJob submitter calls submitJob('/api/<endpoint>', formData)
   → api.ts resolveApiPath() rewrites to canonical /api/v1/<endpoint>
   → POST multipart to FastAPI (X-API-Key header when NEXT_PUBLIC_API_KEY is set)
3. Router validates file (validation.py: 30 MB cap, extension allowlist),
   saves to backend/tmp/ (uploads.py), calls the sync task function inline
4. Task processes and returns bytes; router returns them with
   Content-Disposition: attachment (extract-text without export returns JSON { text })
5. Frontend branches on content-type: JSON → render text; bytes → res.blob() →
   URL.createObjectURL → download link
6. finally: cleanup_paths() deletes the upload and any temp output best-effort
```

No `job_id`, no `/status/{id}` polling, no `/download/{filename}` round-trip.

## Local development

Prerequisites: Python 3.12+, Node.js 20+. No Docker needed — both services run on the host.

```bash
# Backend (from backend/; venv lives at repo-root ../myenv)
cd backend
../myenv/Scripts/activate        # Windows (use `source ../myenv/bin/activate` on Linux/macOS)
pip install -r requirements.lock
uvicorn app.main:app --port 8000
```

API at `http://localhost:8000`, interactive docs at `http://localhost:8000/docs`, health at `http://localhost:8000/health`.

```bash
# Frontend (new terminal, from repo root)
cd frontend
npm install
npm run dev -- --webpack
```

Open `http://localhost:3000`. CORS on the backend defaults to `http://localhost:3000`, so localhost dev works out of the box.

## Self-host via Docker Compose

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Stack: `backend` (uvicorn `--workers 2`), `frontend` (Next.js standalone), `nginx` (port 80: `/` → frontend, `/api/*` → backend, `/static/*` → backend). Images default to `${DOCKERHUB_USERNAME:-deepdocker2023}/yourpdf-backend:latest` and `.../yourpdf-frontend:latest`. Env names: `DOCKERHUB_USERNAME`, `API_KEY`, `CORS_ORIGINS`. See `docs/deploy.md` for the full reference.

## Production deployment (Cloud Run)

Live deployment is two Cloud Run services (`us-central1`), `yourpdf-frontend` and `yourpdf-backend`, using the single-`latest`-tag images above (no versioning). Full steps: `docs/deploy.md`.

## Auth model

Optional shared API key, no user accounts, no database:

- Backend: `API_KEY` env. When non-empty, `api_key_auth` middleware in `main.py` rejects every `path.startswith("/api/")` request without a matching `X-API-Key` header (constant-time compare, 401 generic message, key never logged). `/health`, `/static/*`, `/docs` stay open.
- Frontend: `NEXT_PUBLIC_API_KEY` env (baked at build). When set, `apiClient` sends `X-API-Key` on axios calls and `apiKeyHeaders()` covers raw `fetch()` call sites.
- Both unset = auth disabled (default for local dev).

## Rate limiting & validation

- Nginx: `limit_req_zone ... zone=api_limit:10m rate=10r/s`, `burst=20 nodelay` on `location /api/`; `client_max_body_size 50M`; bad-bot and dotfile/PHP blocks.
- Backend: `validation.py` — 30 MB size cap, per-endpoint extension allowlists, 400 on violation. No download endpoint to guard (responses are direct).

## Monitoring

- **Healthcheck**: backend `GET /health` (compose healthcheck + load-balancer target).
- **Logs**: default Docker log driver (`docker compose -f docker-compose.prod.yml logs -f backend`).

---

## Running tests

### Backend tests

```bash
cd backend   # with venv activated
pytest
```

### Frontend tests

```bash
cd frontend
npm run test
```

## Fonts

Typed signatures on the `/sign` page use three bundled open-source fonts in `frontend/public/fonts/`: Caveat and Great Vibes under the SIL Open Font License 1.1, and Homemade Apple under the Apache License 2.0.
