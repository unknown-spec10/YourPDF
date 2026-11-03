# YourPDF Desktop

YourPDF is a privacy-first, open-source PDF, image, and office-file toolkit that runs
entirely on your own machine as a Windows desktop app. There is no server, no account,
and no upload: the Electron shell spawns a local FastAPI backend on loopback, and
**files never leave the machine**. Every tool processes synchronously — each `POST`
returns processed bytes (or JSON for text extraction) in the same response. There is
**no Celery, no Redis, no Flower, no job queue, no polling, and no database**.
Uploads land in the app's tmp dir and are deleted best-effort right after each task
via `cleanup_paths` in `backend/app/tasks/common.py` — outputs are returned as
`Content-Disposition: attachment` downloads, never stored for later retrieval.

## Install (Windows)

**[Download the installer ⬇](https://github.com/unknown-spec10/YourPDF/releases/latest/download/YourPDF-Desktop-setup.exe)** — then double-click it. It installs and launches in one step: no wizard, no admin prompt.

That is the whole install: per-user, no admin rights, no Python or Node needed, everything
bundled (~300 MB). Or open the
[latest release page](https://github.com/unknown-spec10/YourPDF/releases/latest) and pick
`YourPDF-Desktop-setup.exe` from the assets.

Prefer a scripted install (it verifies the installer's SHA-256 first)? One command in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/unknown-spec10/YourPDF/releases/latest/download/install.ps1 | iex"
```

It downloads the latest GitHub Release, verifies the installer's SHA-256,
installs YourPDF Desktop per-user (no admin/UAC), and launches it. Re-run the
same command to update. The build is unsigned, so SmartScreen may ask you to
confirm; see `docs/install.md` for the offline/manual path, uninstall, and the
release process.

The installed app updates itself: it checks for a new release shortly after
launch, downloads it in the background, and asks to restart. **Help → Check for
Updates…** forces a check.

## What it does

27 tool pages under `frontend/src/app/`. Every tool page is a client component
(`'use client'`) that POSTs files to the local backend (`submitJob` in
`frontend/src/lib/api.ts`, relative same-origin API base, no API key) and downloads
the result. In the packaged app the result card links to a `blob:` URL, which
Electron cannot save directly, so `desktop/shell/preload.js` fetches the bytes and
hands them over IPC to the main process, which writes the file to your Downloads folder.

### PDF tools (`backend/app/routers/pdf.py`)

- **Merge** (`/merge`, `/api/merge`) — combine 2+ PDFs. Simple mode appends whole files; custom planner mixes page ranges across files (`"1-3, 5"`, `"all"`, open-ended `"3-"`) via a JSON `plan` of `{file, pages}` blocks.
- **Split** (`/split`) — extract page ranges (`mode` + `pages_spec`, e.g. `1-3, 5`).
- **Compress** (`/compress`) — Ghostscript/pikepdf size reduction (`quality`).
- **PDF to Images** (`/pdf-to-images`) — PNG/JPG per page (`format`, `dpi`, `pages`: `"all"` or `"1-3, 5"`; a single selected page returns a direct image, subsets otherwise return ZIP).
- **Images to PDF** (`/images-to-pdf`) — PNG/JPG to PDF via img2pdf.
- **Extract Text** (`/extract-text`) — layout-preserving text extraction (`extraction_mode="layout"`); returns JSON text in-browser, or a `.txt` download when `export_txt=true`.
- **PDF to Word** (`/pdf-to-docx`) — via `pdf2docx`; result page renders an in-browser Word preview with `mammoth` (`convertToHtml`) plus a `.docx` download.
- **Word to PDF** (`/docx-to-pdf`) — via LibreOffice.
- **Protect** (`/protect`) — password-encrypt, synchronous, direct blob download.
- **Unlock** (`/unlock`) — password-decrypt, synchronous, direct blob download.
- **Rotate** (`/rotate`) — ANY angle, not presets: slider + numeric input with decimals (e.g. `37.5°`), `-360…360` excluding `0`; negatives rotate counterclockwise. Multiples of 90 use the fast `/Rotate` path; other angles re-render content via transform.
- **Organize** (`/organize`) — reorder/delete pages (`page_order` spec).
- **Watermark** (`/watermark`) — text overlay with `text`, `color`, `opacity`, `rotation` (0–359), `font_size` (12–200), and per-page targeting (`pages`: `"all"` or `"1-3, 5"`).
- **Add Page Numbers** (`/add-page-numbers`) — stamp page numbers (`position`, e.g. `bottom-center`).
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

## How it is built

```
YourPDF Desktop (Electron)
  └─ spawns yourpdf-backend.exe (PyInstaller --onedir freeze of FastAPI)
       ├─ serves the static Next.js export at  /            (same origin)
       ├─ serves the API at                    /api + /api/v1
       └─ shells out to bundled Ghostscript / Tesseract / Poppler / LibreOffice
```

- Distribution is the desktop app only. The frontend is a static export
  (`frontend/next.config.ts`: `output: "export"`, `trailingSlash: true`,
  `images: { unoptimized: true }`) served by the same FastAPI process as the API,
  so frontend and API are same-origin: no CORS, relative API base, no API key.
- Every API request must carry `X-YourPDF-Token`: the shell generates a random
  token per launch and injects it at the Electron session level
  (`webRequest.onBeforeSendHeaders`). Static assets and `/health` are exempt.
  Loopback is NOT a trust boundary — any local process or web page could otherwise
  POST to the server.
- The installer is `electron-builder` NSIS, per-user (no admin),
  `deleteAppDataOnUninstall`; `extraResources` = frontend export + frozen sidecar
  + native binaries + licenses.

## Repository layout

```
pdf-toolkit/
├── backend/
│   └── app/
│       ├── main.py            # FastAPI app: 4 routers at /api + /api/v1, /health, /static mount
│       ├── config.py          # pydantic-settings (CORS origins, API key names)
│       ├── uploads.py         # tmp-dir persistence helpers
│       ├── validation.py      # 30 MB size cap, per-endpoint extension allowlists
│       ├── pdf_security.py    # protect/unlock helpers (pypdf, in-memory)
│       ├── routers/           # pdf.py, image.py, office.py, system.py (health only)
│       └── tasks/             # pdf_tasks.py, image_tasks.py, office_tasks.py, common.py (cleanup_paths)
├── frontend/                  # Next.js 16 App Router, static export
│   └── src/
│       ├── app/               # 27 tool dirs + how-it-works + tools index (all tools are client components)
│       └── lib/api.ts         # relative API base, submitJob (direct POST → Response), blob-download helpers
├── desktop/
│   ├── shell/main.js          # Electron main: token, sidecar lifecycle, save channel, menu, logs
│   ├── shell/preload.js       # blob-URL downloads → IPC save to Downloads folder
│   ├── sidecar/serve.py       # desktop entry: token middleware, static mount, port handshake, OCR dispatch
│   ├── scripts/build-sidecar.mjs   # PyInstaller --onedir freeze → desktop/build/sidecar
│   ├── scripts/vendor-binaries.mjs # copies native installs → desktop/bin/
│   ├── scripts/make-release.mjs    # stable setup alias + SHA256SUMS + install scripts
│   ├── installer/             # install.ps1 / install.cmd / INSTALL.txt shipped in releases
│   ├── bin/                   # bundled Ghostscript / Tesseract / Poppler (install-local, git-ignored)
│   └── licenses/LICENSES.md   # third-party license texts + written source offers
└── docs/                      # architecture.md + desktop-build.md + install.md
```

## Request flow (synchronous, every tool)

```
1. Tool page builds FormData (buildSingleFileFormData / buildMultiFileFormData in lib/api.ts)
2. useFileJob submitter calls submitJob('/api/<endpoint>', formData)
   → api.ts resolveApiPath() rewrites to canonical /api/v1/<endpoint>
   → POST multipart to 127.0.0.1:<port> (X-YourPDF-Token injected by the shell)
3. Router validates file (validation.py: 30 MB cap, extension allowlist),
   saves to the app tmp dir (uploads.py), calls the sync task function inline
4. Task processes and returns bytes; router returns them with
   Content-Disposition: attachment (extract-text without export returns JSON { text })
5. Frontend branches on content-type: JSON → render text; bytes → res.blob() →
   blob object URL → preload fetch → IPC save to Downloads
6. finally: cleanup_paths() deletes the upload and any temp output best-effort
```

No `job_id`, no `/status/{id}` polling, no `/download/{filename}` round-trip.

## Running in dev

Prerequisites: Python 3.12+, Node.js 20+. No Docker needed.

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

Open `http://localhost:3000`. To run the full desktop shell in dev, build the
static export first (`NEXT_PUBLIC_API_URL="" npm run build` in `frontend/` — the
empty API URL keeps the API base relative so the export works from any loopback
port), then from `desktop/`: `npm start` (uses `YOURPDF_PYTHON` or
`../myenv/Scripts/python.exe` with `desktop/sidecar/serve.py` when the frozen
exe is absent). Logs go to the app log dir (see below).

## Where data lives

The app keeps no documents. Per-launch state lives under Electron's user-data
directory:

- Logs: `%APPDATA%\YourPDF Desktop\logs` (`desktop.log`)
- Temp uploads/outputs: `%APPDATA%\YourPDF Desktop\tmp` (pruned at startup, deleted
  best-effort after each request)

Uninstalling removes app data (`deleteAppDataOnUninstall`). Saved results go to
your Downloads folder via the Electron save channel.

## What is bundled

The installer ships native binaries under `desktop/bin/` so the app works with
no system dependencies. The shell prepends them to `PATH` (and sets
`TESSDATA_PREFIX`), so `capabilities` reports the bundled copies:

- Ghostscript (~66 MB) — PDF compression, OCR rasterization
- Tesseract (~90 MB) + tessdata trimmed to eng+osd (~15 MB) — OCR
- Poppler (~57 MB) — PDF-to-image rendering

LibreOffice (Word/PPT conversion) is resolved from the system when present and
reported via `/api/v1/capabilities`. In the frozen build there is no `ocrmypdf`
console script, so the backend runs `[sys.executable, "-m", "ocrmypdf"]` and the
sidecar dispatches that argv into the bundled CLI.

## Tests

Backend suite: 105 tests, all passing (`cd backend && pytest`). CI (`.github/workflows/deploy.yml`,
named `CI`) runs backend tests, frontend lint, and a `desktop-export` job that
builds `frontend/out` on windows-latest with `NEXT_PUBLIC_API_URL=""`. There is
no deploy job — distribution is the desktop installer (see `docs/desktop-build.md`).

## License

YourPDF itself is MIT (see `LICENSE`). The desktop build redistributes
third-party binaries that keep their own licenses: bundled Ghostscript is
AGPL-3.0 and Poppler is GPL-2.0 — both need their license text plus a written
source offer, kept in `desktop/licenses/LICENSES.md`. They run as separate
programs spawned by the local backend; their licenses do not relicense YourPDF.
Tesseract/tessdata are Apache-2.0. See `desktop/licenses/LICENSES.md` for the
full list and source URLs.

## Fonts

Typed signatures on the `/sign` page use three bundled open-source fonts in
`frontend/public/fonts/`: Caveat and Great Vibes under the SIL Open Font License
1.1, and Homemade Apple under the Apache License 2.0.
