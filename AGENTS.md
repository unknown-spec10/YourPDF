# AGENTS.md — YourPDF Desktop

Privacy-first PDF/image/Office toolkit. Ships as a **Windows Tauri v2** app: the shell
serves the React static export and spawns a frozen FastAPI sidecar on loopback. No server,
no uploads, no database, no job queue — every tool is one synchronous `POST` that returns
bytes.

## Entrypoints

| Path | What it is |
|---|---|
| `backend/app/main.py` | FastAPI app; routers are mounted at **both** `/api` and `/api/v1` — keep both working |
| `backend/app/tasks/` | All processing (`pdf_tasks.py`, `image_tasks.py`, `office_tasks.py`) |
| `frontend/src/app/<tool>/page.tsx` | 27 tool pages, all client components using `useFileJob` + `submitJob` |
| `desktop/src-tauri/src/lib.rs` | Tauri core: sidecar lifecycle, token, commands, menu, updater |
| `desktop/src-tauri/src/bridge.js` | Injected into every window: `window.yourpdf` + blob-download save |
| `desktop/sidecar/serve.py` | Desktop entry: token middleware, port handshake, OCR dispatch |
| `desktop/scripts/*.mjs` | frontend export, sidecar freeze, vendoring, smoke suite |

## Commands

**Backend** (from `backend/`, venv at repo-root `myenv`):
```powershell
..\myenv\Scripts\python.exe -m pytest -q tests                        # 114 tests
..\myenv\Scripts\python.exe -m pytest tests/test_sign.py -k rotate -q # one test
```
OCR tests need Tesseract + ocrmypdf and `pdf2image` tests need Poppler; they **skip** when
missing, so a green run can hide them. To actually exercise them, prepend
`desktop/bin/tesseract`, `desktop/bin/gs/bin`, `desktop/bin/poppler/Library/bin` to `PATH`
and set `TESSDATA_PREFIX=desktop/bin/tesseract/tessdata`.
Run uvicorn **without** `--reload` — restart it after backend edits.

**Frontend** (from `frontend/`):
```powershell
npm run dev -- --webpack --port 3000 --hostname 127.0.0.1
npx tsc --noEmit ; npm run lint ; npm test
```
`--webpack` is required: Turbopack dev 404s every sub-route on this machine. Open
`http://localhost:3000`, **not** `127.0.0.1:3000` — the backend CORS allow-list only
contains `http://localhost:3000` (`.env.local` points the UI at `localhost:8000`).

**Desktop** (from `desktop/`):
```powershell
npm run dist        # sidecar freeze → vendor binaries → tauri build
npm run tauri:dev   # dev window; uses build/sidecar if present, else myenv + serve.py
npm run smoke       # 28-endpoint suite, needs the app already running with CDP
```
Release builds require `TAURI_SIGNING_PRIVATE_KEY` (path to `%USERPROFILE%\.tauri\yourpdf.key`)
or `tauri build` fails on `createUpdaterArtifacts`. To smoke-test a build, launch it with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9225`, then `npm run smoke`.

## Release

Tag-driven (`v*`). The version must be identical in `desktop/package.json`,
`desktop/src-tauri/tauri.conf.json` and `desktop/src-tauri/Cargo.toml`; the workflow fails
if they differ or if the tag does not match.

CI installs `desktop/requirements-build.lock` (a full freeze of the validated venv) plus
pinned Ghostscript 10.05.1, Tesseract 5.5.0 and Poppler. **Do not swap the lock back to
`requirements-build.txt`** — that floor file resolved newer numpy/opencv/pymupdf on the
runner and shipped a 294 MB sidecar next to the 232 MB one that had been tested.

`.github/workflows/deploy.yml` (CI) still installs unpinned `backend/requirements.txt`, so a
new release of any backend dependency can turn it red independently of the release workflow.

## Traps (each of these shipped a bug)

- **Tauri resource paths arrive `\\?\`-prefixed.** Windows skips slash normalization for
  verbatim paths, so Tesseract appending `/` to its tessdata dir fails and OCR/pdf→docx
  return 500. `plain()` in `lib.rs` strips it from `PATH`, `TESSDATA_PREFIX`, `YOURPDF_TMP`
  and the sidecar argv. **Only reproduces in an installed build**, never in `tauri dev`.
- **The updater bypasses `RunEvent::Exit`** (it ends in `std::process::exit`), so the exit
  hook never kills the sidecar. Its locked files make NSIS abort halfway — new exe, old
  uninstaller/registry, no relaunch. `install_update` tree-kills the sidecar first.
- **Keep draining the sidecar's stdout** after the `YOURPDF_PORT` handshake. Closing the
  pipe makes its next `print(flush=True)` raise `OSError EINVAL` inside an endpoint; Cancel
  then fails as "Failed to fetch" while `/health` stays 200.
- **Sync Tauri commands run on the main thread.** Building a webview window from one
  deadlocks the pending IPC reply and every later `invoke` hangs. Window-creating commands
  are `async` for that reason.
- `child.kill()` leaves gs/tesseract/soffice grandchildren holding temp locks — quit with
  `taskkill /PID <pid> /T /F`. Never kill `conhost.exe` on cancel (later console children
  then exit with `0xC0000142`).
- `pypdf` is pinned `<7`: 7 removed `PageObject.replace_contents()`, which sign, watermark
  and add-page-numbers still use.
- PDF→Word classifies the text layer and **auto-OCRs scans**; an unreadable scan returns 422.
  `X-OCR-Applied` / `X-Job-Notice` drive the UI notice — both must stay exposed in CORS.
- The CI smoke step is `continue-on-error` and has **never** passed on a runner
  ("App did not expose a debug port"). Do not treat it as verification.

## More context

- `.opencode/skills/pdf-toolkit/SKILL.md` — deep local-dev and packaging notes; read before
  any desktop/packaging work.
- `docs/architecture.md` (as built), `docs/desktop-build.md` (build/release), `docs/install.md`
  (end-user install).
- `frontend/AGENTS.md` — this Next.js 16 differs from training data; consult
  `frontend/node_modules/next/dist/docs/` before writing Next code.
