# YourPDF Desktop — Architecture (As Built)

> The app is a Windows desktop build: an Electron shell spawns a local FastAPI
> sidecar that serves both the UI and the API from the same loopback origin.
> All processing runs locally and synchronously. The browser-window equivalent —
> the Electron renderer — only uploads files and downloads results. Privacy comes
> from locality plus best-effort immediate cleanup of every upload and temp output.
> There is no hosted deployment; the Cloud Run services are retired.

**Status:** Built and shipping. This document describes the code as it exists, not a plan.

## 1. Stack summary

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS, Framer Motion, react-dropzone, Zustand, Axios; static export (`output: "export"`, `trailingSlash: true`, `images.unoptimized`) |
| Desktop shell | Electron (`desktop/shell/main.js`, `desktop/shell/preload.js`); NSIS per-user installer via `electron-builder` |
| Sidecar | Frozen FastAPI via PyInstaller `--onedir` (`desktop/sidecar/serve.py` → `yourpdf-backend.exe`); serves static export at `/` and API at `/api` + `/api/v1` |
| Backend | Python 3.12, FastAPI (Uvicorn), pypdf + pikepdf + Ghostscript + Pillow + img2pdf + pdf2image + pdf2docx + reportlab + python-docx + python-pptx + ocrmypdf/Tesseract |
| Job queue | None — fully synchronous, no Celery, no Redis, no Flower, no polling |
| Storage | Local ephemeral processing (app tmp dir); no database; outputs returned as direct byte responses |
| Native binaries | Bundled under `desktop/bin/` (Ghostscript, Tesseract, Poppler); `PATH` + `TESSDATA_PREFIX` set by the shell |
| Distribution | Desktop installer only — no containers, no proxy, no hosted deployment |

## 2. Desktop runtime: Electron → local FastAPI → bundled binaries

```
Electron main (desktop/shell/main.js)
  1. generates random per-launch token (crypto.randomBytes, base64url)
  2. spawns sidecar: packaged → resources/sidecar/yourpdf-backend.exe
                      dev       → $YOURPDF_PYTHON (or myenv) + desktop/sidecar/serve.py
     env: YOURPDF_TOKEN, YOURPDF_TMP (= userData/tmp),
          YOURPDF_OUT (= resources/frontend, or frontend/out in dev),
          PATH += bin/{gs,tesseract,poppler}, TESSDATA_PREFIX
  3. waits for `YOURPDF_PORT <port>` on sidecar stdout (60 s timeout)
  4. creates BrowserWindow → loads http://127.0.0.1:<port>/
     injects X-YourPDF-Token on every request at the session level
     (webRequest.onBeforeSendHeaders — the page never carries the token)
  5. on quit: tree-kills the sidecar (taskkill /PID /T /F — child.kill()
     would orphan gs/tesseract/soffice grandchildren holding tmp locks)
```

The sidecar (`desktop/sidecar/serve.py`, additive — nothing in `backend/` is modified):

- Mounts the static export (`StaticFiles(OUT_DIR, html=True)`) at `/`, after the
  API routes, so frontend and API are same-origin: no CORS, relative API base
  (`NEXT_PUBLIC_API_URL=""` at export build time), no API key.
- Adds `LoopbackTokenMiddleware` (pure ASGI): every non-GET/HEAD API request must
  present the per-launch `X-YourPDF-Token` (with a `?t=` query fallback); static
  assets, `/_next/`, fonts, favicon/icons, `/health`, and
  `/api/v1/capabilities` are exempt. Rationale, stated in code: loopback is not a
  trust boundary — any local process or any web page can otherwise POST to it.
- Adds desktop-only routes: `GET /api/v1/capabilities` (which native tools
  resolve, with paths proving the bundled copies are in use) and
  `POST /api/v1/cancel` (kills shelled-out children so a stuck merge/OCR actually stops).
- Picks an ephemeral loopback port, then prints `YOURPDF_PORT <port>` only after
  `/health` answers — the shell loads the URL immediately, so a premature print
  would be a guaranteed `ERR_CONNECTION_REFUSED`.
- Dispatches `[sys.executable, "-m", "ocrmypdf"]` argv into the bundled
  `ocrmypdf.__main__.run` (frozen builds have no `ocrmypdf` console script).
- Tracks in-flight `/api` calls with a watchdog (`YOURPDF_TIMEOUT` 120 s default,
  300 s for OCR/LibreOffice/docx routes) that kills stale child processes.
- Prunes `upload_*`/`output_*` tmp debris at startup; the shell also wipes the
  tmp dir on launch (crash debris holds file locks).

Downloads: tool result cards link to `blob:` URLs with no `download` attribute.
Electron's own `downloadURL` path reports success and writes nothing for those,
so `desktop/shell/preload.js` intercepts `blob:` anchor clicks, fetches the
bytes, and hands them over IPC (`save-blob`); the main process writes the file
to the user's Downloads folder. `will-navigate` on `blob:` is blocked so a blob
can never replace the app; external `http(s)` links open in the system browser.

Single-instance lock: a second launch focuses the existing window.

## 3. Sync processing model

Every endpoint follows one pattern: `POST` multipart → validate → process inline → return bytes in the same response.

```
1. Tool page builds FormData (buildSingleFileFormData / buildMultiFileFormData in lib/api.ts)
2. useFileJob submitter calls submitJob('/api/<endpoint>', formData)
   → resolveApiPath() rewrites to canonical /api/v1/<endpoint>
   → POST multipart to the loopback sidecar (token injected by the shell)
3. Router validates (validation.py), saves upload to the app tmp dir (uploads.py),
   calls the sync task function and blocks until it returns
4. Router returns Response(bytes, Content-Disposition: attachment; filename="...")
   (extract-text without export_txt returns JSON { text } instead)
5. Frontend branches on content-type and exposes a blob object URL for download
   → preload fetch → IPC save to Downloads
6. Task finally-block calls cleanup_paths() — upload + temp output deleted best-effort
```

There is no `202 { job_id }`, no `GET /status/{job_id}` polling, no `GET /download/{filename}`, no result backend, and no scheduled cleaner.

## 4. Backend layout (`backend/app/`)

```
app/
├── main.py            # app wiring (see §5)
├── config.py          # pydantic-settings: CORS origins, API key names
├── uploads.py         # get_tmp_dir(), save_upload_file() / save_multi_upload() → tmp dir
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
│   └── system.py      # health_router only: GET /health (no queue routes)
└── tasks/
    ├── pdf_tasks.py   # sync functions incl. merge planner, layout extract, pdf2docx, ocrmypdf
    ├── image_tasks.py # sync Pillow functions
    ├── office_tasks.py# sync LibreOffice conversions
    └── common.py      # resolve_path, ensure_tmp_dir, cleanup_paths, read/write helpers,
                       # SUBPROCESS_TIMEOUT=600 for Ghostscript/LibreOffice/ocrmypdf
```

`requirements.txt` is the human-edited floor; `requirements.lock` is the pinned install set (`pip install -r requirements.lock`). No Markdown-conversion dependency exists.

### Notable task behaviors

- **Merge planner:** `merge_pdfs_task(paths, plan)` — empty `plan` appends whole files; otherwise `plan` is JSON `[{"file": idx, "pages": "1-3, 5" | "all" | "3-"}]` applied in order.
- **Rotate:** `rotate_pdf_task(path, rotation: float)` — `-360…360` excl. `0`; multiples of 90 use `/Rotate`, other angles re-render via transform.
- **Extract text:** `page.extract_text(extraction_mode="layout")` — layout-preserving; `export_txt=True` returns file bytes, else JSON.
- **Watermark:** `watermark_pdf_task(..., pages="all")` — stamps only target pages parsed from `pages`.
- **PDF to images:** `pdf_to_images_task(..., pages="all")` — renders only target pages parsed from `pages`; a single rendered image returns as a direct image, multiple return as a ZIP.
- **Sign:** `sign_pdf_task(path, signature_path, pages="all", cx, cy, width, rotation, add_date)` — builds a transparent reportlab overlay of the signature image (plus an optional date line) sized/positioned/rotated from the `cx`/`cy`/`width` percentages and `rotation` float, then merges it onto only target pages parsed from `pages`; pages with a non-zero `/Rotate` get an un-rotation transform merge instead of a direct merge.
- **OCR:** shells to `ocrmypdf --skip-text -l <lang>` with a 600 s timeout; missing binary → 500 "not installed or configured". Frozen desktop builds run `[sys.executable, "-m", "ocrmypdf"]` (see `pdf_tasks._ocrmypdf_argv`), dispatched by the sidecar into the bundled CLI.
- **Protect/unlock:** never touch disk — `await file.read()` → `protect/unlock_pdf_bytes` → bytes.

## 5. App wiring (`main.py` + sidecar additions)

- 4 routers (`pdf`, `image`, `office`, `system`), each mounted twice: legacy prefix `/api` and canonical prefix `/api/v1`. New clients use `/api/v1`.
- `health_router` mounted with no prefix → `GET /health` (open; the shell's readiness probe).
- `CORSMiddleware` with explicit origins from `CORS_ORIGINS` (default `http://localhost:3000`), never `*`. Inert in the packaged app: frontend and API share one loopback origin, so no cross-origin requests occur.
- `/static` serves `backend/static/` (local fallback).
- `api_key_auth` HTTP middleware: when `API_KEY` is non-empty, every path starting with `/api/` requires a matching `X-API-Key` header (constant-time compare, 401, key never logged). `/health`, `/static/*`, `/docs` stay open. CORS preflights (`OPTIONS`) pass through. The desktop build leaves `API_KEY` unset (auth off) — loopback auth is the per-launch `X-YourPDF-Token` instead.
- Sidecar-only additions (not in `backend/`): `LoopbackTokenMiddleware`,
  `GET /api/v1/capabilities`, `POST /api/v1/cancel`, and the `/` static mount.

## 6. Tmp / cleanup model

- Uploads: `uploads.py` writes to `upload_<uuid>.<ext>` under the tmp dir (packaged: `%APPDATA%\YourPDF Desktop\tmp`; source dev: `backend/tmp/`) and returns the relative path.
- Outputs: tasks write beside the upload (same tmp dir) or re-read into memory.
- Cleanup: every task ends with `cleanup_paths(upload, output)` in a `finally` block — best-effort `os.remove`, missing/failed deletes ignored. Nothing survives the request on success or failure; there is no expiry job. The shell wipes tmp at startup and the sidecar prunes `upload_*`/`output_*` debris.
- `SUBPROCESS_TIMEOUT = 600` bounds Ghostscript/LibreOffice/ocrmypdf so a crafted file can't hang a request slot forever; the sidecar watchdog additionally kills stale children (120 s default, 300 s for OCR/LibreOffice routes). Both the watchdog and `/api/v1/cancel` enumerate children via `child_pids()`, which skips `conhost.exe` — killing it breaks later console children with `0xC0000142`.

## 7. Auth, same-origin, no-DB statelessness

| Concern | Behavior |
|---|---|
| Auth | Per-launch `X-YourPDF-Token` on all API routes (shell-injected at session level; `?t=` query fallback exists in the sidecar). The legacy shared `X-API-Key` middleware exists in `backend/` but is unset/unused in the desktop build |
| CORS | Allow-list from `CORS_ORIGINS` env name (default `http://localhost:3000`); irrelevant in the packaged app — single loopback origin |
| State | Stateless — no DB, no broker, no result store; tmp lives only for the request |
| Validation | `validation.py`: 30 MB cap, per-endpoint extension allowlists, 400 on violation; protect/unlock require non-empty password |
| Transport | Loopback HTTP on an ephemeral port; the token — not the port — is the trust mechanism |

## 8. Frontend structure (`frontend/src/`)

- `next.config.ts`: `output: "export"` (static), `trailingSlash: true`, `images.unoptimized` — the sidecar serves `frontend/out` at `/`.
- `lib/api.ts`: `API_URL` (`NEXT_PUBLIC_API_URL`, empty `""` in the desktop export → relative same-origin requests), `API_PREFIX` (`NEXT_PUBLIC_API_PREFIX`, default `/api/v1`), `resolveApiPath()` (rewrites legacy `/api/*` → `/api/v1/*`), `submitJob(endpoint, formData): Promise<Response>` — direct POST returning the raw response; `cancelActiveJob()` aborts the in-flight fetch and POSTs `/api/v1/cancel` so the sidecar kills its child tree; `buildSingleFileFormData()` / `buildMultiFileFormData()`; `parseFilenameFromDisposition()` for the download name. Legacy `X-API-Key` code paths exist but are inert (no key baked into the desktop export).
- `hooks/useFileJob.ts`: the only job hook (no polling hook exists). `submit(args)` POSTs via the submitter, branches on `content-type` (JSON → `data`, bytes → `blob()` + `URL.createObjectURL` → `downloadUrl`), exposes `isSubmitting`/`isDone`/`isError`/`submitError`/`reset`. An `AbortError` is a cancel, not a failure: it clears the result state and returns to the workspace without setting an error. Revokes object URLs on reset/unmount.
- 27 tool dirs under `src/app/`: add-page-numbers, compress, compress-image, convert-image, crop-image, docx-to-images, docx-to-pdf, extract-text, images-to-pdf, merge, merge-docx, merge-pptx, ocr, organize, pdf-to-docx, pdf-to-images, pptx-to-images, pptx-to-pdf, protect, resize-image, rotate, rotate-image, sign, split, unlock, watermark, watermark-image — plus `how-it-works`, `tools`, and the homepage. Every tool page is a `'use client'` component calling `submitJob` directly. PDF→Word preview uses `mammoth` (`convertToHtml`) in the browser. No Markdown tool exists.

## 9. Distribution topologies

- Packaged app (only distribution): Electron + frozen sidecar + `frontend/out` + `desktop/bin/` + `desktop/licenses/`, installed per-user via NSIS. Logs: `%APPDATA%\YourPDF Desktop\logs`; tmp: `%APPDATA%\YourPDF Desktop\tmp`.
- Local dev: backend `uvicorn` on 8000 + frontend `npm run dev -- --webpack` on 3000, all on the host; or full shell via `npm start` in `desktop/` against `frontend/out`. No compose services, no containers.

Build and smoke-test steps: `docs/desktop-build.md`.
