# AGENTS.md — YourPDF

Hosted web app: one container serves the Next.js static export and a FastAPI backend. Every
tool is one synchronous `POST` multipart → validate → process inline → stream bytes back.
No database, no queue, no result store, no bucket. Uploads live in `tmp/` for the duration of
the request and are deleted in a `finally` block.

The Windows desktop build (Tauri + frozen sidecar) has been **retired** — do not reintroduce
it, and do not add desktop-only branches, tokens or packaging.

## Entrypoints

| Path | What it is |
|---|---|
| `backend/app/main.py` | FastAPI app; routers mounted at **both** `/api` and `/api/v1` — keep both working |
| `backend/app/routers/` | `pdf.py`, `image.py`, `office.py`, `system.py` (health only) |
| `backend/app/tasks/` | All processing (`pdf_tasks.py`, `image_tasks.py`, `office_tasks.py`). **No FastAPI imports** — they raise `DomainError` |
| `backend/app/limits.py` | Per-file, aggregate and render caps; raises `UploadTooLarge` / `RenderBudgetExceeded` |
| `backend/app/errors.py` | `DomainError` / `InvalidRequest`; `main.py` maps them to responses once |
| `backend/app/http_io.py` | `file_response()` + `MEDIA_TYPES` — the only way a router returns a file |
| `backend/app/storage.py` | `tmp_root()` / `ensure_tmp_dir()` — the single answer to where files live |
| `backend/app/validation.py` | Extension allowlists + image-file shape checks |
| `backend/app/config.py` | Settings incl. `MAX_FILE_SIZE_MB`, `MAX_TOTAL_UPLOAD_MB`, `MAX_RENDER_PAGES` |
| `web/serve.py` | Deployment entrypoint: static export at `/`, API at `/api*`, `$PORT` |
| `frontend/src/app/<tool>/page.tsx` | 27 client-component tool pages using `useFileJob` + `submitJob` |

## Commands

**Backend** (from `backend/`, venv at repo-root `myenv`):
```powershell
..\myenv\Scripts\python.exe -m pytest -q tests                          # 155 tests
..\myenv\Scripts\python.exe -m pytest tests/test_service_limits.py -q   # limits only
```
OCR tests need Tesseract + ocrmypdf, `pdf2image` tests need Poppler, Office tests need
LibreOffice; they **skip** when missing, so a green run can hide them. Run uvicorn **without**
`--reload` and restart it after backend edits.

**Frontend** (from `frontend/`):
```powershell
npm run dev -- --webpack --port 3000 --hostname 127.0.0.1
npx tsc --noEmit ; npm run lint ; npm test
```
`--webpack` is required: Turbopack dev 404s every sub-route. Open `http://localhost:3000`
(the CORS allow-list only contains `localhost:3000`), not `127.0.0.1:3000`.

**Whole app, one origin** (closest to production):
```powershell
..\myenv\Scripts\python.exe -m web.serve          # http://127.0.0.1:8080
..\myenv\Scripts\python.exe -m web.tests.smoke_endpoints --base http://127.0.0.1:8080
```

**Corpus check** (real documents, every tool, needs the app running):
```powershell
.\myenv\Scripts\python.exe -m web.tests.corpus_check --dir test-corpus --base http://127.0.0.1:8080
```
Drop PDFs (plus optional docx/pptx/images) into `test-corpus/`; it writes `report.md` there with
one row per file x tool and exits non-zero on a failure. Unlike `smoke_endpoints.py` it checks
*structure* — page counts preserved, protect/unlock round trip, merge doubling pages, split
returning the pages asked for — so silent corruption fails. An encrypted PDF pairs with a sibling
`<name>.pdf.password` file.

**Container** (from the repo root — the context is the whole repo, filtered by `.dockerignore`):
```powershell
docker build -f web/Dockerfile -t yourpdf-web:local .
docker run -d --name yourpdf -p 8090:8080 yourpdf-web:local
docker exec yourpdf python -m web.tests.smoke_endpoints --base http://127.0.0.1:8080 --fail-on-skip
```
`--fail-on-skip` is the deploy gate: a missing native tool must fail the build, not quietly
reduce coverage. `backend/requirements-image.lock` is the Linux-resolved set (the Windows
`requirements.lock` pins `pikepdf 10.7.3`, which `ocrmypdf` 17 refuses); regenerate it on the
same base image if a dependency changes.

## Limits (do not regress these)

- **30 MB total per request.** `validate_total_size` in `app/limits.py`, called by the five
  endpoints that accept more than one file (merge, images-to-pdf, merge-docx, merge-pptx and
  **sign** — sign was the one that used to slip through), plus a per-file check on every
  endpoint. The host rejects an HTTP/1.1 request above 32 MiB *before* the app runs, so this
  must stay a little under that.
- **100 pages/slides per rasterising job.** `validate_render_budget` is called in
  `pdf_to_images_task` (on the *selection*, not the document), and in `docx_to_images_task` /
  `pptx_to_images_task` after LibreOffice conversion — a DOCX has no page count before layout.
- Both are `0`-disablable via env for local experiments; production sets 30/100.
- Size failures answer **413**; invalid input answers **400**. `tests/test_architecture.py`
  enforces the call sites so a new multi-file endpoint cannot forget the aggregate check.

## Traps (each of these bit us)

- **All file responses go through `app/http_io.file_response`.** It streams, deliberately: a
  length-delimited response is capped at 32 MiB by the host, and a rasterised ZIP is routinely
  larger than its upload. The image router once had its own copy of this helper and lost the
  streaming — that is exactly why the helper is shared and why
  `test_architecture.py::test_no_router_builds_a_length_delimited_response` exists.
- **Empty required form fields arrive as `422`, not the endpoint's own `400`.** The multipart
  parser drops empty values, so a `if not value: raise 400` branch is unreachable over HTTP.
- **LibreOffice needs a writable `HOME`/`APPDATA`.** Without one it exits `0xC0000409` and every
  Office conversion 500s while the pure-Python merges still pass.
- **ocrmypdf needs a writable `TMPDIR`.** It copies its input into a `mkdtemp` folder; a
  read-only temp dir turns every OCR into "The file couldn't be written".
- **`/tmp` is in-memory on Cloud Run and counts against the memory limit.** Uploads, outputs and
  the streamed body all live in RAM, so memory sizing is not just about LibreOffice.
- **Cloud Run must run this with concurrency 1.** The work is CPU-bound and shells out; the
  default of 80 would thrash a single vCPU and OOM `soffice`.
- **`pypdf` is pinned `<7`**: 7 removed `PageObject.replace_contents()`, which sign, watermark
  and add-page-numbers still use.
- PDF→Word classifies the text layer and **auto-OCRs scans**; an unreadable scan returns 422.
  `X-OCR-Applied` / `X-Job-Notice` drive the UI notice.
- **Cancelling a job only aborts the browser's fetch.** The server keeps working; there is no
  cross-instance cancellation channel. Do not advertise server-side cancel without building it.

## More context

- `docs/architecture.md` — the service as built.
- `docs/deploy.md` — the runbook: live facts, manual + CI deploy, WIF setup, verification, rollback, traps.
- `docs/web-cloud-run.md` — historical design assessment; superseded by `docs/deploy.md` for how to deploy.
- `frontend/AGENTS.md` — this Next.js 16 differs from training data; consult
  `frontend/node_modules/next/dist/docs/` before writing Next code.
