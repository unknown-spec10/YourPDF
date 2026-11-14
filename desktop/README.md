# YourPDF Desktop — Tauri shell

Windows desktop edition of YourPDF. The whole stack runs on loopback: the Tauri shell
spawns a frozen FastAPI sidecar, which is the local API; the UI is the static Next.js
export, served by the shell itself. Nothing leaves the machine, and there is no hosted
deployment path. Build/smoke-test details: `docs/desktop-build.md`.

Status: **Tauri port complete and verified; releases are tag-driven.** The
release path is tag-driven (`.github/workflows/release-desktop.yml`): push `v*` and CI
freezes the sidecar, vendors the native binaries, builds and signs the NSIS installer,
and publishes it with the updater manifest.

## Shape

```
Tauri core (src-tauri) ──spawns──▶ PyInstaller sidecar (FastAPI on 127.0.0.1:<free port>)
        │                                   │
        └── WebView2 window ──loads──▶ tauri:// (static export)
                                        │
                                        └─ API base + token injected as window globals
```

The UI and the API are on different origins (the Tauri origin serves the export; the
sidecar answers on a loopback port), so the sidecar allows that origin via CORS and
exposes the headers the UI reads (`Content-Disposition`, `X-Job-Notice`). A random
per-launch token is required on every API call (`X-YourPDF-Token`) because loopback is
not a trust boundary — any local process or web page can reach the port.

## Build

```powershell
# From desktop/. Requires Rust (cargo) and the backend venv (../myenv, or YOURPDF_PYTHON).
npm ci
npm run dist                      # sidecar → vendor → tauri build (installer)

# Individual stages
npm run build:frontend            # frontend/out (next.config.ts: output "export")
npm run build:sidecar             # build/sidecar/yourpdf-backend/ (PyInstaller --onedir)
npm run vendor                    # bin/{gs,tesseract,poppler}, pruned (first build / version bumps)
npm run tauri:dev                 # dev window (uses build/sidecar if present, else Python)
npm run tauri:build               # release bundle without the sidecar/vendor steps
```

`tauri build` runs `beforeBuildCommand`, which produces `frontend/out` with an empty
`NEXT_PUBLIC_API_URL`; the shell injects the real API origin at window creation.

Release builds need the updater signing key, or `createUpdaterArtifacts` fails:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\yourpdf.key"
```

## Verify a build

```powershell
# 1. launch the built app with a debug port
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9225'
& 'src-tauri/target/release/yourpdf-desktop.exe'

# 2. in another terminal — every tool endpoint + the cancel path, from inside the app
npm run smoke
```

`scripts/smoke.mjs` drives the real UI origin (the injected globals carry the API base and
token), builds its own PDF fixture via `images-to-pdf`, runs all 28 endpoints against
`fixtures/`, then starts an OCR and cancels it — asserting a fast failure, `/health`
still 200, and no leftover gs/tesseract processes. Exit code 1 on any failure, so it can
gate a release.

Temp files go to `%LOCALAPPDATA%\com.yourpdf.desktop\tmp` (the shell sets `YOURPDF_TMP`);
logs to `%LOCALAPPDATA%\com.yourpdf.desktop\logs\desktop.log` (Help → Open Log Folder).

## Cancel

`ProgressBar` is shared by every tool page and owns the Cancel button, so all tools
get cancellation without per-page wiring:

1. `cancelActiveJob()` (`frontend/src/lib/api.ts`) aborts the in-flight fetch and
   POSTs `/api/v1/cancel`.
2. `useFileJob` treats the resulting `AbortError` as a cancel, not a failure: the
   workspace returns with the input still loaded and no error/alert.
3. The sidecar's `/cancel` runs `taskkill /T /F` on its child tree — aborting the
   fetch alone would leave gs/tesseract/soffice burning CPU.

**Do not kill `conhost.exe`.** It is a direct child of the sidecar, and killing it
breaks every later console child with `0xC0000142` (DLL init failed), so a single
Cancel would poison OCR until restart. `child_pids()` in `sidecar/serve.py`
explicitly skips it; the quit path can still tree-kill the whole sidecar.

**Never stop draining the sidecar's stdout.** The Rust reader must keep reading after
the `YOURPDF_PORT` handshake; returning closes the pipe, and the sidecar's next
`print(flush=True)` raises `OSError EINVAL` inside an endpoint — which aborts that
response mid-flight (Cancel then fails as "Failed to fetch" while `/health` stays up).

## Hard-won details (do not regress)

- `trailingSlash: true` in export mode, or `/merge/` 404s on reload (`merge.html`
  vs `merge/index.html`).
- The result card's download link has **no `download` attribute** and points at a
  `blob:` URL, and the webview's own download path reports `completed` while writing
  nothing. The working path is `src-tauri/src/bridge.js`: it intercepts the click,
  fetches the bytes, and hands them to the `save_blob` command as **raw bytes**
  (sending them as a JSON array would balloon a 30 MB file into ~100 MB of text).
- The filename must come from the **response**, never from the link text. Every
  tool page sets `download={fileName}` (parsed from `Content-Disposition`), and the
  bridge takes the extension from the response **MIME type**. Skipping either
  produced `.docx` responses saved as `Download Word File.pdf`.
- A save the user cannot see is a save that did not happen. `save_blob` records the
  entry in `downloads.json`, emits `yourpdf:saved`, and the bridge renders the toast;
  `File → Downloads…` (`Ctrl+J`) lists the history with Open / Show in folder.
- Sync Tauri commands run on the main thread, so a command that creates a webview
  window deadlocks the pending IPC response and every later `invoke` hangs. Window
  creation commands are `async` for that reason.
- Bundled executables are *not* at the top of their vendor trees: put
  `bin/gs/bin`, `bin/tesseract` and `bin/poppler/Library/bin` on `PATH` (plus
  `TESSDATA_PREFIX`), or the app silently falls back to system installs. The
  packaged `GET /api/v1/capabilities` reports the exact paths in use.
- Killing the sidecar needs a tree kill (`taskkill /PID <pid> /T /F`);
  `child.kill()` leaves gs/tesseract grandchildren holding temp-file locks.
- The port handshake (`YOURPDF_PORT <n>`) is printed only after `/health` answers;
  the shell creates the window on that line, so printing earlier yields
  `ERR_CONNECTION_REFUSED`.
