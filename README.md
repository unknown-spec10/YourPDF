# YourPDF

YourPDF is an open-source PDF, image and Office toolkit that runs as a hosted web app:
**27 tools, no stored documents.** Every tool is one synchronous `POST` that
returns the processed bytes in the same response — the upload and any temporary output are
deleted in a `finally` block the moment the task returns. There is no database, no job queue,
no result store and no storage bucket.

> Earlier versions shipped as a Windows desktop app (Tauri + a local FastAPI sidecar). That
> build has been retired: this repository is the hosted service.

## Limits

| Limit | Value | Why |
|---|---|---|
| Total upload | **30 MB per request** (all files together) | The host rejects an HTTP/1.1 request above 32 MiB before the app runs, so the app enforces the same ceiling itself and explains it |
| Rendered output | **100 pages/slides per job** | Rasterising turns a small upload into a large download; 100 pages at 150 DPI is roughly 100–150 MB, built in memory before it streams |

Downloads are streamed (chunked), so a result can be much larger than the file that produced
it. Non-navigable HTML/JSON responses still carry a length.

## Privacy

Files are uploaded, processed in `tmp`, and deleted after the response is produced. Nothing is
retained: no account records, no history, no bucket, no analytics on file contents. Treat it as a
processor you hand a file to — don't upload what you cannot share.

## What it does

27 tool pages under `frontend/src/app/`. Each is a client component that POSTs to the API and
downloads the result as a blob.

### PDF tools (`backend/app/routers/pdf.py`)

- **Merge** — append whole files, or mix page ranges across files (`"1-3, 5"`, `"all"`, open-ended `"3-"`) via a JSON `plan` of `{file, pages}` blocks.
- **Split** — extract page ranges.
- **Compress** — Ghostscript/pikepdf size reduction (`quality`).
- **PDF to Images** — PNG/JPG per page (`format`, `dpi`, `pages`); one selected page returns a direct image, otherwise a ZIP.
- **Images to PDF** — PNG/JPG to PDF via img2pdf.
- **Extract Text** — layout-preserving extraction; JSON in the browser, or a `.txt` download when `export_txt=true`.
- **PDF to Word** — via `pdf2docx`; scanned PDFs are OCR'd automatically (an existing OCR layer is reused).
- **Word to PDF**, **PPT to PDF** — via LibreOffice.
- **Protect / Unlock** — password encrypt/decrypt, in memory.
- **Rotate** — any angle, `-360…360` excluding `0`; multiples of 90 use the fast `/Rotate` path.
- **Organize** — reorder/delete pages.
- **Watermark** — text overlay with colour, opacity, rotation, font size and per-page targeting.
- **Add Page Numbers** — stamp page numbers at a position.
- **OCR** — via ocrmypdf/Tesseract (`language`, default `eng`).
- **Sign** — draw, type or upload a signature; drag, resize, any-angle rotation, optional date line.
- **PDF Info** — `{ num_pages }`, used by the merge/watermark pages.

### Image tools (`backend/app/routers/image.py`)

Compress, Resize, Crop, Convert (JPG/PNG/WEBP/BMP/TIFF), Rotate, Watermark.

### Office tools (`backend/app/routers/office.py`)

Merge Word, Word to Images, PPT to PDF, PPT to Images, Merge PPT.

## How it is built

```
Browser ── HTTPS ──► Cloud Run (one container, one origin)
                      ├─ static Next.js export at  /
                      └─ FastAPI at                /api + /api/v1
                           └─ shells out to  Ghostscript · Poppler · Tesseract · ocrmypdf · LibreOffice
```

- The export and the API share an origin, so there is no CORS preflight and no client token.
- Every tool is synchronous: `POST` multipart → validate → process inline → bytes.
- File responses are `StreamingResponse`s, so the host's 32 MiB length-delimited response cap
  never applies, and downloads start as soon as the task returns.
- Limits live in `backend/app/config.py` / `validation.py`; there is no adapter layer.

## Repository layout

```
pdf-toolkit/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app: routers at /api + /api/v1, /health, /static
│   │   ├── config.py          # settings incl. MAX_TOTAL_UPLOAD_MB, MAX_RENDER_PAGES
│   │   ├── validation.py      # size caps, extension allowlists, render budget
│   │   ├── uploads.py         # tmp-dir persistence helpers
│   │   ├── pdf_security.py    # protect/unlock (pypdf, in-memory)
│   │   ├── routers/           # pdf.py, image.py, office.py, system.py
│   │   └── tasks/             # pdf_tasks.py, image_tasks.py, office_tasks.py, common.py
│   └── tests/                 # 124 tests
├── frontend/                  # Next.js 16 App Router, static export
│   └── src/
│       ├── app/               # 27 tool pages + tools index + how-it-works
│       └── lib/api.ts         # submitJob (direct POST → Response), FormData builders
├── web/                       # deployment layer
│   ├── serve.py               # entrypoint: static export + API on one origin, $PORT
│   ├── fixtures/              # shared smoke-test fixtures
│   └── tests/smoke_endpoints.py  # live smoke suite (all 35 cases)
└── docs/                      # architecture.md, web-cloud-run.md
```

## Request flow

```
1. Tool page builds FormData (buildSingleFileFormData / buildMultiFileFormData)
2. useFileJob calls submitJob('/api/<endpoint>', formData)
   → resolveApiPath() rewrites to /api/v1/<endpoint>
3. Router validates (per-file cap, aggregate cap, extension, render budget),
   saves to tmp, runs the sync task inline
4. Task returns bytes; router returns a streamed response with
   Content-Disposition: attachment (extract-text without export returns JSON)
5. Frontend branches on content-type: JSON → render; bytes → blob URL → download
6. finally: cleanup_paths() deletes the upload and temp output
```

## Running it locally

```bash
# API + built frontend, one origin (closest to production)
.\myenv\Scripts\python.exe -m web.serve        # http://127.0.0.1:8080

# Or the usual two-process dev loop
cd backend && ..\myenv\Scripts\python.exe -m uvicorn app.main:app --port 8000
cd frontend && npm run dev -- --webpack        # http://localhost:3000
```

`--webpack` is required for the dev server to serve sub-routes in this Next.js version. The
backend's default CORS allow-list contains `http://localhost:3000`, so use `localhost`, not
`127.0.0.1`, in the browser during development.

Native tools are needed on the host for the features that shell out: Ghostscript, Poppler,
Tesseract, `ocrmypdf` and LibreOffice. LibreOffice needs a writable `HOME`/`APPDATA` and
ocrmypdf a writable `TMPDIR`; both are set in the container.

## Tests

```bash
cd backend && ..\myenv\Scripts\python.exe -m pytest -q      # 124 tests
cd frontend && npx tsc --noEmit && npm run lint && npm test

# Against a running server (every endpoint, twice-built PDF fixture):
.\myenv\Scripts\python.exe -m web.tests.smoke_endpoints --base http://127.0.0.1:8080
```

The smoke suite reports missing native tools as SKIP rather than FAIL, so a green run means
the transport and the app agree — not that this machine has LibreOffice.

## Deployment

One container serves the export and the API; it is built from `web/Dockerfile` (Node stage builds
the export in-image, Python stage carries Ghostscript, Poppler, Tesseract, LibreOffice and
ocrmypdf) and deployed by `.github/workflows/deploy-web.yml`.

```bash
docker build -f web/Dockerfile -t yourpdf-web:local .
docker run -d -p 8080:8080 yourpdf-web:local
docker exec <container> python -m web.tests.smoke_endpoints --base http://127.0.0.1:8080 --fail-on-skip
```

The workflow builds, pushes to Artifact Registry, runs that same suite **inside the image** and
refuses to deploy if any case is skipped — a missing LibreOffice Impress module or tessdata pack
fails there instead of on the first user's `.pptx`. Cloud Run runs it with concurrency **1**,
2 vCPU / 4 GiB, a 900 s timeout (the app's own subprocess limit is 600 s), `MAX_TOTAL_UPLOAD_MB=30`
and `MAX_RENDER_PAGES=100`, behind **Identity-Aware Proxy** with anonymous access disabled.

Sizing rationale, the 32 MiB/h2c analysis and the IAM shape are in
[`docs/web-cloud-run.md`](docs/web-cloud-run.md); the code as built is in
[`docs/architecture.md`](docs/architecture.md).

## License

YourPDF is MIT (see `LICENSE`). The service runs Ghostscript (AGPL-3.0), Poppler (GPL-2.0),
LibreOffice (MPL-2.0) and Tesseract (Apache-2.0) as separate programs inside the container;
they are installed from the distribution's packages rather than vendored into this repository.

## Fonts

Typed signatures use three bundled open-source fonts in `frontend/public/fonts/`: Caveat and
Great Vibes under the SIL Open Font License 1.1, and Homemade Apple under the Apache License 2.0.
