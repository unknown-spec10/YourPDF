# YourPDF Desktop — Build Guide

This is the only build. There is no hosted deployment (the Cloud Run services and
Docker Hub images were removed in October 2026), no Docker image, and no
web server to configure: the output is a per-user Windows installer that runs the
whole stack (Tauri shell + frozen FastAPI sidecar + static frontend + native
binaries) on loopback.

## 1. Prerequisites

- Windows 10/11 x64, Node.js 20+, Python 3.12+
- Backend venv at repo-root `../myenv` (or set `YOURPDF_PYTHON` to any venv
  python with the build deps installed):
  `pip install -r desktop/requirements-build.txt` — backend runtime set plus
  pinned `ocrmypdf` and `PyInstaller`
- Native installs for vendoring (override with env vars, see §4):
  Ghostscript (`YOURPDF_GS`, default `D:/gs10.05.1`), Tesseract
  (`YOURPDF_TESSERACT`, default `C:/Program Files/Tesseract-OCR`), Poppler
  (`YOURPDF_POPPLER`, default `D:/poppler-26.02.0`)

## 2. Build the installer

One command, from `desktop/`:

```powershell
npm ci
npm run dist
```

`dist` runs the four stages below and then writes the release bundle. On a
machine with the native toolchain installed this is all that is needed.

The individual stages, if you want to run them separately:

```powershell
# 1. Static frontend export. The script sets NEXT_PUBLIC_API_URL="" because the
#    shell injects the real loopback origin at window creation: a baked absolute
#    URL would point the app at a dead host.
cd desktop
npm run build:frontend  # → frontend/out

# 2. Freeze the backend. PyInstaller --onedir only; it must stay a real on-disk
#    tree (see gotchas). --copy-metadata ocrmypdf is enough for its plugins.
npm run build:sidecar   # → build/sidecar/yourpdf-backend/yourpdf-backend.exe

# 3. Vendor native binaries (pruned).
npm run vendor          # → bin/{gs,tesseract,poppler}

# 4. Build the signed installer (needs TAURI_SIGNING_PRIVATE_KEY).
npm run dist            # → src-tauri/target/release/bundle/nsis/*-setup.exe
```

`tauri build` also runs step 1 itself via `beforeBuildCommand`, so `npm run dist` is
the single command that does 2–4.

Release assets come from CI: the signed installer + `.sig` + `latest.json`
(uploaded by `tauri-action`), plus the stable `YourPDF-Desktop-setup.exe`,
`SHA256SUMS.txt` and the `install.*` scripts from a follow-up workflow step.

CI's `desktop-export` job (`.github/workflows/deploy.yml`, named `CI`) builds the
static export on windows-latest with `NEXT_PUBLIC_API_URL: ""`. Releases are
built by `.github/workflows/release-desktop.yml`, triggered by a `v*` tag; see
`docs/install.md` for the publishing checklist.

## 3. What each `bundle.resources` entry is for

Configured in `desktop/src-tauri/tauri.conf.json` (`bundle.resources`; staged next to
the app under `resources/`):

| From | To | Purpose |
|---|---|---|
| `build/sidecar/yourpdf-backend` | `sidecar/yourpdf-backend` | Frozen FastAPI exe + `_internal/`; spawned by the shell |
| `bin` | `bin` | Ghostscript / Tesseract / Poppler; prepended to `PATH`, plus `TESSDATA_PREFIX` |
| `licenses` | `licenses` | License texts + written source offers (Ghostscript AGPL-3.0, Poppler GPL-2.0); viewable via the app's licenses channel |

The frontend export is embedded in the executable (Tauri's `frontendDist`), not
shipped as a separate directory.

## 4. Smoke-testing a build

1. Install `src-tauri/target/release/bundle/nsis/YourPDF Desktop_<version>_x64-setup.exe`
   (per-user, no admin). The installer is not Authenticode-signed, so SmartScreen
   warns on first run.
2. Launch; open the log folder (Help → Open Log Folder,
   `%LOCALAPPDATA%\com.yourpdf.desktop\logs\desktop.log`) and confirm the sequence:
   `sidecar: …` → `[sidecar] …` → `YOURPDF_PORT <port>` → `sidecar ready on <port>`.
3. Compress a PDF and confirm a file lands in Downloads (blob → bridge save path).
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
9. Uninstall and confirm the app is removed (per-user install data under
   `%LOCALAPPDATA%\com.yourpdf.desktop` is left in place).

Quick pre-pack check without installing: `npx tauri build --no-bundle`, then run
`src-tauri/target/release/yourpdf-desktop.exe` — Tauri stages `resources/` next to it.

Dev shortcut (no freeze, no installer): build the export (step 1), then
`npm run tauri:dev` in `desktop/`. The shell uses an existing
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
- **Blob downloads need the bridge:** result cards link to `blob:` URLs with no
  `download` attribute, and the webview's own download path reports success while
  writing nothing for them. `src-tauri/src/bridge.js` intercepts `blob:` clicks,
  fetches the bytes, and invokes `save_blob` with the bytes as the **raw invoke
  body** (metadata in headers) — sending them as a JSON array would balloon a 30 MB
  file into ~100 MB of text. If downloads silently stop appearing, this interception
  is the first suspect — not the backend (which still returns bytes normally).
- **Never hand `\\?\` paths to the sidecar:** Tauri's resource lookup returns verbatim
  paths (`\\?\C:\...`). Win32 skips slash normalization for those, so any tool that
  appends `/` breaks: Tesseract appends `/` to its tessdata dir and OCR dies with
  "Tesseract failed to report available languages" / "recursive directory iterator
  cannot open directory". `plain()` in `src-tauri/src/lib.rs` strips the prefix for
  `PATH`, `TESSDATA_PREFIX`, `YOURPDF_TMP` and the sidecar argv. This **only**
  reproduces in an installed build — dev uses a plain `CARGO_MANIFEST_DIR` path, so a
  dev-only smoke run will not catch it.
- **Resources must stay real files:** the frozen backend must stay an on-disk
  `--onedir` tree (`bundle.resources → resources/sidecar`), never packed into the
  binary. Same for `bin/` — `shutil.which` and subprocess execution need real paths.
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
- **The shell must keep draining the sidecar's stdout:** read it forever after the
  `YOURPDF_PORT` handshake, never `return` from the reader once the port is found.
  Dropping the read end closes the pipe, and the sidecar's next
  `print(flush=True)` raises `OSError: [Errno 22] Invalid argument`. Inside an
  endpoint that exception aborts the HTTP response mid-flight: `POST /api/v1/cancel`
  surfaces in the UI as "Failed to fetch" while `/health` keeps answering, so the
  app looks alive but Cancel is dead. `serve.py` therefore routes request-path
  status lines through `_log()`, which swallows `OSError`, and
  `kill_task_children()` never raises — Cancel is a last-resort action and must not
  be able to take the server down.
- **Child enumeration declares ctypes signatures:** `_child_pids_ctypes()` sets
  `argtypes`/`restype` for `CreateToolhelp32Snapshot`, `Process32First`,
  `Process32Next` and `CloseHandle`. Without `restype`, ctypes assumes a 32-bit int
  and truncates the 64-bit snapshot HANDLE. The PowerShell fallback that hides such
  a failure is also wrapped, because it can raise `OSError` in a console-less child
  (`CREATE_NO_WINDOW`, i.e. the Tauri shell).
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
- **Vendor trees are pruned:** `vendor` copies the upstream installs, then deletes
  payloads nothing reads at runtime — Ghostscript `doc/` + `examples/` (~25 MB) and
  Poppler `Library/lib` (MSVC import stubs) + `Library/include` (C headers) (~18 MB).
  Verified after pruning: `gswin64c -version`, `tesseract --version` and
  `pdftoppm -v` all run from the vendored trees. Poppler's `share/poppler` CMaps
  are deliberately KEPT — CJK rendering/text extraction needs them. The prune
  list is data in `scripts/vendor-binaries.mjs`; a missing path logs
  `prune target absent` rather than failing the build.
- **Tessdata is trimmed to `eng`:** `vendor` keeps only `eng.traineddata` plus
  configs (~4 MB). `osd` is NOT bundled and is not needed, because
  `_run_ocrmypdf` passes `--skip-text -l <lang>` and never `--rotate-pages`, so
  OSD never engages. The OCR page therefore offers English only — adding a
  language means adding its `traineddata` to the `vendor` keep-set first,
  otherwise the installed app advertises OCR it cannot run.
- **Sidecar payloads are pruned after the freeze:** `build:sidecar` deletes
  `cv2/opencv_videoio_ffmpeg*.dll` (~27 MB; pdf2docx only rasterizes pages and
  never decodes video — a table-bearing probe PDF still produced 1 table / 6
  cells without it), `pypdfium2` (imported nowhere), and `PIL/_avif*` (AVIF is
  not an accepted input). Core `cv2.pyd` MUST stay: pdf2docx uses OpenCV for
  layout/table detection, which is what backs the "layout is preserved" promise
  on the PDF-to-Word page. Never trade that for size.
- **OCR dispatch differs frozen vs source:** source dev shells out to the
  `ocrmypdf` console script; the frozen backend runs
  `[sys.executable, "-m", "ocrmypdf"]` and `serve.py` dispatches that argv into
  `ocrmypdf.__main__.run`. OCR bugs that reproduce only in the installed app
  usually live in this seam.
- **Keep the stable asset name:** the one-line installer fetches
  `.../releases/latest/download/install.ps1` and `YourPDF-Desktop-setup.exe`.
  The workflow's "Prepare stable-name assets" step copies the versioned Tauri
  installer to that stable name and writes the checksum for both. Renaming or
  removing it breaks every install link; the version stays visible in the versioned
  filename and the release tag.

## 6. Publishing

Releases are tag-driven: bump the version in **both** `desktop/package.json` and
`desktop/src-tauri/tauri.conf.json` (the workflow fails if they differ), push a
`v<version>` tag, and `.github/workflows/release-desktop.yml` runs on windows-latest:
backend tests → frozen sidecar → pruned vendor binaries → `tauri build` (signed) →
publish. The full checklist, plus the manual `gh release create` command for a local
build, is in `docs/install.md`.

`tauri-action` uploads the signed NSIS installer, its `.sig`, and `latest.json` — the
manifest `plugins.updater.endpoints` points at. A follow-up step also publishes the
**stable** `YourPDF-Desktop-setup.exe` name plus `SHA256SUMS.txt` and the `install.*`
scripts, because `docs/install.md`'s one-liner fetches those version-independent names.

The installer is a per-user NSIS build (`bundle.targets: ["nsis"]`,
`windows.webviewInstallMode: downloadBootstrapper`): double-clicking installs without
admin and launches the app — no wizard, no UAC, no choices. Keep it that way: the
download page and `INSTALL.txt` promise "double-click, done". The WebView2 bootstrapper
downloads the runtime only when it is absent (Windows 11 always has it), so a machine
that has never seen Edge needs internet for the first install.

`tauri build` with `createUpdaterArtifacts` **requires** the signing key. Locally:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\yourpdf.key"
```

CI takes it from `secrets.TAURI_SIGNING_PRIVATE_KEY`.

CI gotcha: `pdf2image` shells out to `pdfinfo`/`pdftoppm`, so Poppler has to be
on `PATH` **before** the "Run backend tests" step. Vendoring it after the tests
leaves three `test_sign.py` cases failing as `assert 500 == 200`, and because
the tests gate the build, no release is ever published.

## 7. Code signing

Two different things are called "signing" here, and only one of them is set up:

1. **Updater signature — required, already wired.** `tauri build` signs the update
   payload with the minisign/Ed25519 key from `TAURI_SIGNING_PRIVATE_KEY`; the app
   verifies it against the public key baked into `tauri.conf.json` before writing a
   single byte to disk. Lose the private key and no future update can be signed —
   every user would have to reinstall manually. Back it up.
2. **Authenticode — opt-in, not set up.** This is what controls the SmartScreen
   warning, and it is independent of (1). Tauri signs the installer when a certificate
   is supplied via the Windows cert store / a `signCommand`; add it and the next
   tagged build is Authenticode-signed too.

| Secret / env | Value | Needed |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | contents of the updater private key | **yes** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password, if any | only if set |
| Authenticode certificate | `.pfx` / cert store | opt-in |

v1 ships **unsigned for Authenticode**: SmartScreen warns on first launch, and
reputation accrues only with downloads. Reality check before buying anything: EV
certificates no longer grant instant SmartScreen reputation, and Azure Trusted
Signing requires a US/Canada organisation with 3+ years of verifiable history. Signing
buys authenticity and tamper-evidence, not a warning-free install — re-verify
Microsoft's current rules at purchase time.

## 8. Auto-update

`tauri-plugin-updater` reads `latest.json` from
`https://github.com/unknown-spec10/YourPDF/releases/latest/download/latest.json`
(configured under `plugins.updater` in `tauri.conf.json`). The shell checks eight
seconds after launch — silently, off the main thread — and on **Help → Check for
Updates…**. The startup check is opt-out via **Help → Check for updates on startup**
(`checkUpdatesOnStartup` in `config.json`); it fetches only `latest.json`, so there is
no telemetry and no file data involved.

Flow: check → confirm dialog → download → verify the Ed25519 signature against the
public key compiled into the binary → install → `app.restart()`. The exit hook
tree-kills the sidecar first, so nothing holds a file lock during the swap.

**The updater bypasses `RunEvent::Exit`.** `download_and_install` finishes by calling
`std::process::exit()`, so the normal shutdown hook never fires and the sidecar keeps
its exe/DLLs locked. NSIS then aborts halfway: `yourpdf-desktop.exe` is replaced, but
`uninstall.exe` and the uninstall registry entry keep the **old version** and the app
never relaunches. `install_update` therefore kills the sidecar tree itself (and waits
~800 ms) before handing off — keep that call when touching the update path.

Local builds report *"Could not fetch a valid release JSON from the remote"* until the
first release exists, which is expected. There is **no** update path from the pre-Tauri
builds: those poll `latest.yml`, which is no longer published, so they need one manual
reinstall.
