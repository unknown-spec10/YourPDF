# YourPDF Desktop — Electron shell

Windows desktop edition of YourPDF. The whole stack runs on loopback: the Electron
shell spawns a frozen FastAPI sidecar, which serves the static frontend export and
does all PDF work locally. Nothing leaves the machine, and there is no hosted
deployment path. Build/smoke-test details: `docs/desktop-build.md`.

Status: **v1 complete, unsigned.** The per-user NSIS installer is produced at
`desktop/release/YourPDF-Desktop-0.1.0-setup.exe`. Installing it is a user step
(SmartScreen warns because the binary is unsigned). Verified against the packaged
build: all 28 tool endpoints pass, and OCR → Cancel → OCR recovers (see
`docs/desktop-build.md` §4).

## Shape

```
Electron main  ──spawns──▶  PyInstaller sidecar (FastAPI on 127.0.0.1:<free port>)
      │                              │
      └── BrowserWindow ──loads──▶ http://127.0.0.1:<port>/?t=<token>
                                     (same sidecar serves frontend/out)
```

Same origin, so no CORS and no absolute API URL. A random per-launch token is
required on every API call (`X-YourPDF-Token`) because loopback is not a trust
boundary — any local process or web page can reach the port.

## Build

```powershell
# From desktop/. Requires the backend venv (../myenv, or YOURPDF_PYTHON).
$env:NEXT_PUBLIC_API_URL = ""     # relative API calls; a baked URL points at a dead host

npm run build:frontend            # frontend/out (next.config.ts: output "export")
npm run build:sidecar             # build/sidecar/yourpdf-backend/ (PyInstaller --onedir)
npm run vendor                    # bin/{gs,tesseract,poppler} (first build / version bumps)
npm run pack                      # release/YourPDF-Desktop-<version>-setup.exe

npm run pack:dir                  # unpacked app in release/win-unpacked (no installer)
npm start                         # dev shell (uses build/sidecar if present, else Python)
```

`frontend/next.config.ts` always exports statically, so no env switch is needed
there; the empty `NEXT_PUBLIC_API_URL` is the only frontend requirement.

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

## Hard-won details (do not regress)

- `trailingSlash: true` in export mode, or `/merge/` 404s on reload (`merge.html`
  vs `merge/index.html`); the sidecar's `StaticFiles(..., html=True)` resolves it.
- The result card's download link has **no `download` attribute** and points at a
  `blob:` URL. Electron's `webContents.downloadURL()` reports `completed` and
  writes nothing; the working path is the preload in `shell/preload.js` (fetch
  bytes → IPC → main writes the file, where a native Save-As belongs).
- Python processes cannot read inside `app.asar` — the frozen backend,
  `frontend/out` and `bin/` must ship as `extraResources`.
- Bundled executables are *not* at the top of their vendor trees: put
  `bin/gs/bin`, `bin/tesseract` and `bin/poppler/Library/bin` on `PATH` (plus
  `TESSDATA_PREFIX`), or the app silently falls back to system installs. The
  packaged `GET /api/v1/capabilities` reports the exact paths in use.
- Killing the sidecar needs a tree kill (`taskkill /PID <pid> /T /F`);
  `child.kill()` leaves gs/tesseract grandchildren holding temp-file locks.
- The port handshake (`YOURPDF_PORT <n>`) is printed only after `/health` answers;
  the shell loads that URL immediately, so printing earlier yields
  `ERR_CONNECTION_REFUSED`.
