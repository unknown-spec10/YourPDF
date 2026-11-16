# YourPDF — Architecture (as built)

A hosted web app: one container serves the Next.js static export and a FastAPI backend from a
single origin. Every tool is one synchronous `POST` multipart that validates, processes inline
and streams the result back. There is no database, no job queue, no result store and no object
storage; an upload lives in `tmp/` only for the duration of its request.

> The Windows desktop build (Tauri shell + frozen FastAPI sidecar on loopback) has been
> retired. `docs/web-cloud-run.md` keeps the deployment analysis that outlived it.

## 1. Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind, Framer Motion, react-dropzone, Zustand; static export (`output: "export"`, `trailingSlash: true`, `images.unoptimized`) |
| Backend | Python 3.12, FastAPI + Uvicorn, pypdf/pikepdf, Pillow, img2pdf, pdf2image, pdf2docx, reportlab, python-docx, python-pptx, ocrmypdf |
| Native tools | Ghostscript, Poppler, Tesseract, ocrmypdf, LibreOffice — installed in the image, resolved from `PATH` |
| Job model | None — synchronous request/response, no Celery, no Redis, no polling |
| Storage | Process-local `tmp/`, wiped per request; no database, no bucket |
| Hosting | One Cloud Run service behind IAP (`docs/web-cloud-run.md`) |

## 2. Topology

```
Browser ── HTTPS ──► Cloud Run (one container, one origin)
                      ├─ StaticFiles(frontend/out, html=True)  → /            (Next.js export)
                      └─ FastAPI app (backend/app)             → /api, /api/v1, /health
                            └─ shells out to gs · pdftoppm · tesseract · ocrmypdf · soffice
```

Single origin is deliberate: no CORS preflight, no per-launch token, no second service to keep
in sync. `web/serve.py` imports `app.main:app` unchanged and adds the static mount plus the RSC
prefetch rewrite the Next.js 16 export needs.

## 3. Request flow

```
1. Tool page builds FormData (buildSingleFileFormData / buildMultiFileFormData)
2. useFileJob → submitJob('/api/<endpoint>', formData) → /api/v1/<endpoint>
3. Router validates: per-file cap, aggregate cap, extension allowlist, render budget
4. save_upload_file() writes upload_<uuid>.<ext> under tmp/
5. Task runs inline and returns (bytes, download_name)
6. Router returns a StreamingResponse with Content-Disposition: attachment
   (extract-text without export returns {"text": ...} instead)
7. finally: cleanup_paths(upload, output) — deleted on success and on failure
```

No `202 {job_id}`, no `GET /status/{id}`, no `GET /download/{filename}`, no expiry worker.

## 4. Upload and response size

The host caps an HTTP/1.1 request at 32 MiB and a **non-chunked** response at 32 MiB. Both
constrain the design:

- **Uploads:** 30 MB total per request (`validate_total_size`, applied to the four multi-file
  endpoints) plus the existing 30 MB per-file check. That leaves ~2 MiB of headroom for
  multipart framing under the platform ceiling.
- **Responses:** every file response is a `StreamingResponse` (chunked, no `Content-Length`),
  which the response cap does not apply to. This is what allows a 30 MB PDF to produce a
  300 MB ZIP of page images. The body is still built in memory by the task, so the practical
  ceiling is instance memory and the browser's blob buffer — which is why the render budget
  exists.

## 5. Render budget

`validate_render_budget` (default 100 pages/slides per job, `MAX_RENDER_PAGES`) is enforced at
three places, each at the earliest point the count is knowable:

| Tool | When |
|---|---|
| `pdf-to-images` | after parsing the page spec, on the **selection** — rendering 2 of 500 pages is fine |
| `pptx-to-images` | after LibreOffice conversion, counted from the converted PDF |
| `docx-to-images` | after LibreOffice conversion — a DOCX has no page count before layout |

The rejected job still deletes its upload (`cleanup_paths` runs in `finally`), so a 400 leaves
no debris.

## 6. Auth, trust, state

| Concern | Behaviour |
|---|---|
| Access | **Identity-Aware Proxy** in front of the service: Google sign-in at the edge, no auth code in the app |
| Trust inside | The container trusts its caller because IAP is the only ingress; no token middleware, no API key by default (`API_KEY` exists for a locked-down alternative) |
| CORS | Irrelevant in the deployed shape (one origin); `CORS_ORIGINS` still supports a split static/API deployment |
| State | Stateless per request; any instance can serve any request; no affinity needed |
| Cleanup | `cleanup_paths()` in a `finally` block; the entrypoint also prunes `upload_*`/`output_*` debris at startup |

## 7. Concurrency and sizing

The work is CPU-bound and shells out to single-threaded tools, so Cloud Run runs with
**concurrency 1**: one request per instance, no thrashing, no `soffice` OOM. `tmp/` is an
in-memory filesystem there and counts against the memory limit, so the upload, the output and
the streamed body are all RAM. Sizing table and cost sketch: `docs/web-cloud-run.md` §5.3.

## 8. Layout

```
backend/app/
├── main.py            # wiring: 4 routers × (/api, /api/v1), /health, /static, domain-error handler
├── config.py          # CORS, API key, MAX_FILE_SIZE_MB, MAX_TOTAL_UPLOAD_MB, MAX_RENDER_PAGES
├── errors.py          # DomainError / InvalidRequest → responses, mapped once in main.py
├── limits.py          # per-file, aggregate, render budget; raises UploadTooLarge / RenderBudgetExceeded
├── http_io.py         # file_response() (streamed) + MEDIA_TYPES — routers never build responses
├── storage.py         # tmp_root() / ensure_tmp_dir() — one answer to where files live
├── validation.py      # extension allowlists + image shape checks
├── uploads.py         # persist uploads into the tmp dir
├── pdf_security.py    # protect/unlock, in-memory
├── routers/           # pdf.py, image.py, office.py, system.py — thin: parse → limits → task → file_response
└── tasks/             # pdf_tasks.py, image_tasks.py, office_tasks.py, common.py — no FastAPI imports

frontend/src/
├── app/               # 27 tool pages + tools index + how-it-works (all client components)
├── hooks/useFileJob.ts# POST → branch on content-type → blob URL or JSON
└── lib/api.ts         # API_URL (same origin), resolveApiPath, submitJob, FormData builders

web/
├── serve.py           # entrypoint: static mount + API + $PORT
└── tests/smoke_endpoints.py  # live 35-case suite
```

The HTTP/processing seam is deliberate: a task fails only by raising a `DomainError`, `main.py`
maps those to status codes once, and the render budget can therefore be enforced *inside* a task
— after a DOCX has actually been paginated. `tests/test_architecture.py` holds the line: no
`Response(content=…)` in routers, no `fastapi` import in tasks, an aggregate cap on every
multi-file endpoint, and the media table covering every extension a task can emit.

## 9. Tests

- `backend/tests` — 131 tests: endpoint roundtrips, validation, limits (`test_service_limits.py`),
  signing geometry, merge plans, layout extraction, versioned/legacy path parity, plus
  `test_architecture.py` guards on the module seams described above.
- `web/tests/smoke_endpoints.py` — every endpoint against a running server; native-tool cases
  SKIP when the binary is absent.
- `frontend` — `tsc --noEmit`, ESLint, Vitest.

## 10. Retired with the desktop build

Local/offline processing and its "files never leave the machine" promise, the NSIS installer and
updater, the per-launch loopback token, the frozen PyInstaller sidecar, the Windows-only Word
COM fallback, and the CDP-driven smoke suite. None of them are missed by the service; the
privacy statement changed from "nothing is uploaded" to "uploaded, processed, deleted".
