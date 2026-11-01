# YourPDF Desktop — Build Guide

This is the only build. There is no hosted deployment, no Docker image, and no
web server to configure: the output is a per-user Windows installer that runs the
whole stack (Electron shell + frozen FastAPI sidecar + static frontend + native
binaries) on loopback.

## 1. Prerequisites

- Windows 10/11 x64, Node.js 20+, Python 3.12+
- Backend venv at repo-root `../myenv` (or set `YOURPDF_PYTHON` to any venv
  python with the backend deps installed):
  `pip install -r backend/requirements.lock` (plus `PyInstaller` for the freeze)
- Native installs for vendoring (override with env vars, see §4):
  Ghostscript (`YOURPDF_GS`, default `D:/gs10.05.1`), Tesseract
  (`YOURPDF_TESSERACT`, default `C:/Program Files/Tesseract-OCR`), Poppler
  (`YOURPDF_POPPLER`, default `D:/poppler-26.02.0`)

## 2. Step-by-step local build

Run in this order from the repo root:

```powershell
# 1. Static frontend export (from frontend/).
#    NEXT_PUBLIC_API_URL MUST be empty: the export is served by the sidecar from
#    the same loopback origin, so API calls are relative. A baked absolute URL
#    would point the installed app at a dead host.
cd frontend
$env:NEXT_PUBLIC_API_URL = ""
npm run build        # → frontend/out
cd ..

# 2. Freeze the backend (from desktop/). PyInstaller --onedir only; asar cannot
#    hold Python (see gotchas). --copy-metadata ocrmypdf is enough for its plugins.
cd desktop
npm run build:sidecar  # → desktop/build/sidecar/yourpdf-backend/yourpdf-backend.exe

# 3. Vendor native binaries (from desktop/).
npm run vendor         # → desktop/bin/{gs,tesseract,poppler}

# 4. Pack the installer (from desktop/).
npm run pack           # → desktop/release/YourPDF-Desktop-<version>-setup.exe
```

`npm run build:frontend` (in `desktop/`) is shorthand for step 1. CI's
`desktop-export` job (`.github/workflows/deploy.yml`, named `CI`) performs step 1
on windows-latest with `NEXT_PUBLIC_API_URL: ""` and uploads `frontend/out`.

## 3. What each `extraResources` entry is for

Configured in `desktop/package.json` (`build.extraResources`; packed next to the
app under `resources/`):

| From | To | Purpose |
|---|---|---|
| `../frontend/out` | `frontend` | Static Next.js export; the sidecar mounts it at `/` (`YOURPDF_OUT`) |
| `build/sidecar/yourpdf-backend` | `sidecar` | Frozen FastAPI exe + `_internal/`; spawned by the shell |
| `bin` | `bin` | Ghostscript / Tesseract / Poppler; prepended to `PATH`, plus `TESSDATA_PREFIX` |
| `licenses` | `licenses` | License texts + written source offers (Ghostscript AGPL-3.0, Poppler GPL-2.0); viewable via the app's licenses channel |

Only `shell/**/*` + `package.json` go inside the asar (`build.files`); everything
above stays as real files (see gotchas).

## 4. Smoke-testing a build

1. Install `desktop/release/YourPDF-Desktop-<version>-setup.exe` (per-user, no
   admin). The installer is unsigned, so SmartScreen warns on first run.
2. Launch; open the log folder (Help → Open Log Folder,
   `%APPDATA%\YourPDF Desktop\logs\desktop.log`) and confirm the sequence:
   `sidecar: …` → `[sidecar] …` → `YOURPDF_PORT <port>` → `sidecar ready on <port>`.
3. Compress a PDF and confirm a file lands in Downloads (blob → IPC save path).
4. OCR a scanned page (exercises bundled Tesseract + Ghostscript + the
   `[sys.executable, "-m", "ocrmypdf"]` dispatch). Also check that
   `/api/v1/capabilities` reports `resources/bin/...` paths, not system installs.
5. Cancel a long OCR (use a multi-page scan). While tesseract is running, click
   the shared Cancel button: the workspace must return with the input still
   loaded and no "OCR Failed", and `desktop.log` must show
   `YOURPDF_CANCEL killed N child process(es)`. Then run OCR again and let it
   finish — this is the regression test for the `conhost.exe` bug in §5.
6. Convert a .docx (exercises system LibreOffice via `/api/v1/capabilities` —
   `libreoffice: true` only when LibreOffice is installed).
7. Reload on a deep route (e.g. `/merge/`) — `trailingSlash` export serves
   `merge/index.html`; the sidecar's `html=True` static mount resolves it.
8. Quit and confirm no `yourpdf-backend.exe` / `soffice` / `tesseract` processes
   remain (tree-kill on quit).
9. Uninstall and confirm app data is removed (`deleteAppDataOnUninstall`).

Quick pre-pack check without installing: `npm run pack:dir`, then run the
unpacked exe from `desktop/release/win-unpacked/`.

Dev shortcut (no freeze, no installer): build the export (step 1), then
`npm start` in `desktop/`. The shell uses an existing
`build/sidecar/yourpdf-backend.exe` if present; otherwise it falls back to
`$YOURPDF_PYTHON`/`../myenv/Scripts/python.exe` + `desktop/sidecar/serve.py`
(move `build/sidecar` aside to force the source path).
Or run the sidecar alone: `YOURPDF_TOKEN=dev ..\\..\\myenv\\Scripts\\python.exe
desktop/sidecar/serve.py`, then open the printed `http://127.0.0.1:<port>/`
with header `X-YourPDF-Token: dev`.

## 5. Gotchas

- **trailingSlash deep-reload:** the export emits `route/index.html` per page.
  A hard reload or direct load of a deep route only works because the sidecar
  mounts the export with `html=True`. Test §4 step 7 on every route-structural change.
- **Blob downloads need IPC:** result cards link to `blob:` URLs with no
  `download` attribute, and Electron's own `downloadURL` reports success while
  writing nothing for them. `desktop/shell/preload.js` intercepts `blob:` clicks,
  fetches the bytes, and invokes `save-blob`; the main process writes to
  Downloads. If downloads silently stop appearing, this interception is the first
  suspect — not the backend (which still returns bytes normally).
- **asar cannot hold Python:** the frozen backend must stay a real on-disk
  `--onedir` tree (`extraResources → resources/sidecar`), never inside the asar.
  Same for `frontend/out` and `bin/` — `StaticFiles`, `shutil.which`, and
  subprocess execution all need real paths.
- **Tree-kill on quit:** `child.kill()` leaves gs/tesseract/soffice grandchildren
  alive holding tmp locks, so the shell uses `taskkill /PID <pid> /T /F`.
  Aborting a single request is the same problem one level down: dropping the HTTP
  response does not stop the work, which is why `POST /api/v1/cancel` and the
  watchdog kill the shelled-out child tree.
- **Never kill `conhost.exe` on cancel:** the sidecar's console host is a direct
  child. Killing it makes every later console program exit at DLL init with
  `0xC0000142`, so one Cancel poisons OCR until the app restarts.
  `child_pids()` skips it by name; keep that exclusion when touching either the
  cancel path or the child enumeration. This only reproduced in the frozen build.
- **Bundled binaries need their subdirectories on `PATH`:** the vendor trees do
  not put the exes at the top — use `bin/gs/bin`, `bin/tesseract`, and
  `bin/poppler/Library/bin` (plus `TESSDATA_PREFIX`). Adding only `bin/` makes
  `shutil.which` fall through to system installs, which then fail on user
  machines. `capabilities.paths` is the quickest way to confirm which copy ran.
- **Dev shell prefers a frozen sidecar:** `npm start` uses
  `desktop/build/sidecar/...` when it exists, and only falls back to
  `$YOURPDF_PYTHON`/`../myenv` + `sidecar/serve.py` otherwise. To test source
  changes without a rebuild, move `build/sidecar` aside first.
- **Port handshake only after `/health` answers:** the sidecar picks an ephemeral
  port and prints `YOURPDF_PORT <port>` only once `GET /health` succeeds locally.
  The shell loads the URL immediately on that line — any earlier/later print
  (or printing before the server accepts) is a guaranteed `ERR_CONNECTION_REFUSED`.
  The shell gives up after 60 s (`sidecar did not report a port in 60s`).
- **Empty API URL at export time:** `NEXT_PUBLIC_API_URL=""` bakes relative API
  calls into the export. Building with a localhost URL hard-codes a port that will
  collide with (or simply miss) the sidecar's ephemeral port in the installed app.
- **Tessdata is trimmed:** `vendor` keeps only `eng` + `osd` (+ configs) in
  tessdata (~15 MB). OCR with any other `-l` language will fail in the packaged
  app while working in source dev — check this before adding language options.
- **OCR dispatch differs frozen vs source:** source dev shells out to the
  `ocrmypdf` console script; the frozen backend runs
  `[sys.executable, "-m", "ocrmypdf"]` and `serve.py` dispatches that argv into
  `ocrmypdf.__main__.run`. OCR bugs that reproduce only in the installed app
  usually live in this seam.
