# YourPDF Web on GCP Cloud Run — Architecture Assessment

**Status:** the deployment analysis that survived the desktop retirement. The desktop build is
gone (see `docs/architecture.md`), which removed the frozen-tree constraint this document was
written around: the guards now live in `backend/app` rather than in `web/` adapters, and CI no
longer ships an installer. What still applies here is the Cloud Run reasoning — the 32 MiB
envelope, the h2c rejection, sizing, IAP, cost — and that is why the file is kept.

**Question:** can the existing desktop app also be published as a hosted web app on Cloud Run,
as a "try it before you download it" funnel?

## 1. Verdict

**Yes, it is possible, and the shape of the app is a better fit for Cloud Run than most
desktop-derived codebases.** It is not a drop-in deploy, though: three Cloud Run limits collide
with current request/response handling, and one of them (the 32 MiB envelope) is a product
decision rather than a config flag.

The app is stateless, synchronous, has no database, no job queue, and no result store. Every
tool is one `POST` that returns bytes in the same response. That is exactly Cloud Run's
request model, so the usual serverless migration work — queue, worker, result store, session
affinity — does not apply here.

Work needed: a new additive `web/` package (entrypoint, three HTTP-layer guards, Dockerfile,
tests), a build-gated set of frontend changes, and one CI job. Roughly **5–8 days** including a
smoke pass, not counting hardening — the frozen tree costs about a day of that, because the
guards have to be adapters rather than edits.

### 1.1 Decisions locked in

| Decision | Choice | Consequence |
|---|---|---|
| Scope | **Full parity** — all 27 tools | No tool is web-disabled; the LibreOffice and OCR paths must work in the image |
| Upload envelope | **30 MB total per request** (not per file) | The 32 MiB request cap is satisfied without HTTP/2; multi-file endpoints need an aggregate check |
| Response envelope | **Chunked streaming** | The 32 MiB response cap does not apply; input size no longer bounds output size |
| Transport | **Stay on uvicorn / HTTP/1.1** — h2c rejected | No `--use-http2` flag, no server swap; see appendix |
| Rasterizer guardrail | **Page/slide budget**, 100 per job | Web-only limit; the desktop build keeps unlimited renders |

**Constraint: the published desktop tree is frozen.** `backend/app` is compiled into
`yourpdf-backend.exe` and `desktop/` is the shipped shell, so the web work must be **additive**:
a new `web/` package that wraps the app, exactly as `desktop/sidecar/serve.py` already does
("additive by design — nothing in `backend/` is modified"). The desktop release therefore keeps
building from a byte-identical tree, and the trade-off is that the three guards become HTTP-layer
adapters rather than `if` statements in the routers (§7).

The web container carries its own config; the desktop defaults stay exactly as published:

| Env var | Desktop | Web |
|---|---|---|
| `WEB_MAX_TOTAL_UPLOAD_MB` | unset → no aggregate cap | `30` |
| `WEB_MAX_RENDER_PAGES` | unset → no page budget | `100` |

The two size decisions are what retire the h2c question: the request side is bounded by the
30 MB cap, and the response side is bounded by nothing once the response is chunked.

## 2. Why the current design maps well

| Current property | Cloud Run consequence |
|---|---|
| No DB, no broker, no result store (`docs/architecture.md` §7) | Any instance can serve any request; no affinity, no shared state |
| Sync `POST` → bytes (`Response(content=...)`) | Fits request-bound CPU allocation; nothing runs after the response |
| Per-request tmp cleanup in a `finally` block (`tasks/common.py`) | No storage lifecycle, no TTL job, no bucket to secure |
| `GET /health` already exists | Startup probe ready |
| Static export (`output: "export"`) | Can be served by the same container → single origin, no CORS, no token |
| Frontend already web-tolerant | No token in a browser, `window.yourpdf` not referenced by `src/`, `cancelActiveJob` already swallows a 404 (`lib/api.ts:136-157`) |
| Platform branches are guarded | `win32com` Word fallback only on `win32` (`pdf_tasks.py:1007-1045`); image watermark uses `LiberationSans-Regular.ttf` off Windows (`image_tasks.py:352-355`); `gs`/`soffice`/`ocrmypdf` resolved by name |
| Prior art | Cloud Run services (`yourpdf-frontend`, `yourpdf-backend`, us-central1) ran until they were deleted in October 2026 using the same images as the compose stack (old `docs/deploy.md` §8, removed in `9dd863b`) |

## 3. Cloud Run limits that matter (verified)

From the Cloud Run quotas and limits page:

| Limit | Value | Consequence here |
|---|---|---|
| Max request timeout | 60 minutes | Fine: app subprocess timeout is 600 s (`SUBPROCESS_TIMEOUT`) |
| Max HTTP/1 **request** size | **32 MiB** (no limit on an HTTP/2 server) | Bites multi-file endpoints (see B1) |
| Max HTTP/1 **response** size | **32 MiB** unless chunked/streaming | Bites ZIP outputs (see B2) |
| Max concurrent requests per instance | 80 | Default is wrong for CPU-bound work (see B3) |
| Memory / vCPU | 32 GiB / 8 vCPU | LibreOffice + OCR fit comfortably |
| Writable `/tmp` | In-memory, counted against the memory limit | Uploads + outputs consume RAM, not disk |
| Startup timeout | 4 minutes | Enough; cold start is the real cost |
| Container image size | No direct limit | Image can carry gs/tesseract/poppler/LibreOffice |

Practical rates for cost (verify on the pricing page): CPU ≈ $0.000024/vCPU-s, memory ≈
$0.0000025/GiB-s.

## 4. Where the current code collides

### B1 — Multi-file uploads can exceed the 32 MiB request cap (hard; resolved by the 30 MB total cap, §5.1)

The 4 multi-file endpoints validate **30 MB per file** and have no aggregate cap:

- `POST /api/merge` (`routers/pdf.py:73-87`)
- `POST /api/images-to-pdf` (`routers/pdf.py:146`)
- `POST /api/office/merge-docx` (`routers/office.py:43`)
- `POST /api/office/merge-pptx` (`routers/office.py:127`)

Two 20 MB PDFs merged = 40 MB. Cloud Run rejects the request with 413 before FastAPI ever
runs, so the user sees an infrastructure error, not the app's validation message. A single
30 MB file is safe (31.5 MiB payload < 32 MiB cap, ~2 MiB of headroom for multipart overhead).

### B2 — Large responses are sent with `Content-Length`, so they hit the 32 MiB response cap (hard; resolved by chunked streaming, §5.1a)

Every handler returns `Response(content=data, ...)` (`routers/pdf.py:47-54`), which sets
`Content-Length` and therefore falls under the 32 MiB response limit. Legal inputs produce
outputs well past that:

- `pdf-to-images` → ZIP of rendered PNGs (`pdf_tasks.py:727-740`)
- `split` → ZIP (`pdf_tasks.py:612-630`)
- `docx-to-images` / `pptx-to-images` → ZIPs (`office_tasks.py:158-169`, `242-253`)

A 30 MB, 200-page PDF at 150 DPI renders to hundreds of MB. Since the handler cannot be edited,
the fix is to strip `Content-Length` from `/api/*` responses in the web layer: uvicorn then emits
`Transfer-Encoding: chunked`, which the limit exempts. The body is still built in memory — the
cap is a transport rule, not a memory rule (§5.1a).

### B3 — Default concurrency and memory are wrong for this workload

Cloud Run defaults to 80 concurrent requests per instance and 512 MiB. This app shells out to
Ghostscript, Tesseract, ocrmypdf and LibreOffice, all CPU- and memory-hungry. With defaults,
two concurrent jobs thrash one vCPU and `soffice` gets OOM-killed. Set `--concurrency 1`
(or 2) and ≥2 GiB, 4 GiB for headroom. `/tmp` being in-memory makes memory sizing stricter:
a 30 MB upload is up to three copies (multipart spool + `upload_*` + output + result bytes).

### B4 — Cold starts are slow (quality issue, not a blocker)

Importing `cv2`, `PyMuPDF`, `pdf2docx`, `reportlab` plus the first LibreOffice launch is
several seconds before the first request can be answered. Expect 5–10 s on a cold instance.
Mitigate with startup CPU boost and either `--min-instances 1` (cost) or accept it for a demo.

### B5 — A public CPU-burning endpoint needs an abuse plan (product decision)

`API_KEY` is empty by default (`config.py`), so a deployed service is an open "convert my file"
API. Every request costs real CPU time. Minimum: `--max-instances` cap, a budget alert, and
either IAP (Google sign-in, best for a beta) or a shared key. Cloud Armor needs a load balancer.

### B6 — Cancel has no cross-instance meaning

`POST /api/v1/cancel` exists only in the desktop sidecar (`desktop/sidecar/serve.py:321-325`)
and kills **that process's** children with `taskkill` (Windows-only). On Cloud Run there is no
global process table: a cancel reaches one of N instances, or none. Aborting the fetch still
stops the wait, but the instance keeps burning CPU until the subprocess timeout. Options:
per-instance cancel keyed by request id (best effort), or drop the button on web (the frontend
already tolerates the missing route).

### B7 — The desktop entrypoint cannot be reused as-is

`desktop/sidecar/serve.py` binds `127.0.0.1` on an ephemeral port, prints a port handshake,
and installs `LoopbackTokenMiddleware`, which would 401 every browser request. A web
entrypoint must bind `0.0.0.0:$PORT`, skip the token, and **keep** two pieces that are not
optional for the static export: the `RscPrefetchRewriteMiddleware` (Next.js 16 writes
`/x/__next.x/__PAGE__.txt`, the client requests `/x/__next.x.__PAGE__.txt`) and the
`StaticFiles(..., html=True)` mount after the API routes.

## 5. Decisions and trade-offs

### 5.1 The 32 MiB envelope

| Option | What it takes | Trade-off |
|---|---|---|
| **A. Cap the envelope** (recommended for a trial) | Reject total uploads > ~30 MB in the 4 multi-file endpoints (413 with a friendly message); stream all byte responses | Smallest change; merge of two large PDFs is not offered on web; keeps the "no storage" promise intact |
| **B. Serve HTTP/2 (h2c)** | Swap uvicorn for hypercorn, enable HTTP/2 on the Cloud Run service | Documented to lift the request limit ("no limit if using HTTP/2 server"); needs a spike to confirm Cloud Run → h2c → Starlette multipart + chunked streaming, and uvicorn-specific behaviour must be re-verified |
| **C. Presigned Cloud Storage** | Client uploads to GCS, API processes from GCS, result to GCS with a signed URL | Removes every size limit, but adds a bucket, object TTL cleanup, IAM, and directly contradicts the "nothing is stored" pitch |

**Decision: A.** 30 MB total per request, chunked responses. B and C are out; see the appendix
for why B in particular buys nothing once A is in place.

### 5.1a Response envelope and the one place parity cannot be literal

Dropping `Content-Length` in the web layer removes Cloud Run's response cap, so the *transport*
no longer bounds output size. The response body is still built in memory, though, so two other
things still do:

1. **Instance memory.** Tasks return `tuple[bytes, str]` — the finished file is already fully in
   Python memory, and `/tmp` is in-memory too. Stripping the header only changes framing; it does
   not make the process memory-flat, and the frozen tree means we cannot change the tasks to
   return paths instead. For most tools a 30 MB input yields a smaller output; for the
   rasterizers it does not.
2. **Browser memory.** The client buffers the whole response (`res.blob()` in
   `hooks/useFileJob.ts:108`) to build the download link. A 300 DPI `pdf-to-images` of a
   200-page PDF is plausibly several hundred MB — acceptable for Cloud Run with 4 GiB and
   concurrency 1, potentially fatal to a mobile browser tab.

So the honest framing of "full parity": every tool works, but the rasterizing tools
(`pdf-to-images`, `docx-to-images`, `pptx-to-images`) need a web-side guardrail that the
desktop build does not need.

**Decision: page/slide budget, 100 per job, gated on `WEB_MAX_RENDER_PAGES`.** Reject the job
before rendering with a message that names the limit and points at the desktop app. 100 pages
at 150 DPI is roughly 100–150 MB of PNG — large but survivable in a desktop browser, and
comfortably inside a 4 GiB instance. The alternatives considered were a lower default DPI
(leaks a quality regression into the parity story), the File System Access API (most work, no
protection on non-Chromium browsers), and no guardrail at all (a killed tab reads as a broken
app).

Because the tree is frozen, the budget is enforced in the web layer by wrapping the task
reference the router already holds (`app.routers.pdf.pdf_to_images_task`), counting pages with
`pypdf` / slides with `python-pptx` before delegating. **`docx-to-images` is the residual gap**:
a DOCX has no page count until LibreOffice paginates it, so no cheap pre-flight exists and that
path is protected only by instance memory plus `--max-instances`. Record that limitation rather
than shipping a fabricated estimate.

### 5.1b Can a bucket lift the 32 MiB cap?

**Understanding the limit matters more than the workaround.** The 32 MiB numbers are limits on
the **HTTP message** between the client and Cloud Run's frontend. They are not limits on payload,
compute, or disk. So anything that changes where the *server* puts data — a bigger `/tmp`, a
Cloud Storage volume mount, writing outputs to a bucket before responding — leaves the envelope
untouched. A bucket only helps in one shape: when the **client talks to the bucket directly**,
so the bytes never enter a Cloud Run request or response.

There are exactly four ways to move more than 32 MiB, and they are not interchangeable:

| Lever | Lifts | App changes | Reliability |
|---|---|---|---|
| Keep messages small (30 MB cap) | — | none | **Highest** — nothing to go wrong |
| Chunked responses | response only | ~10 lines of ASGI middleware | **High** — small, testable surface |
| h2c (`--use-http2` + hypercorn) | request only | entrypoint only | **Medium** — binary: flag and server must match or every request fails |
| Direct-to-GCS (signed URLs) | both, and unbounded | client contract rewrite + new endpoints | **High at scale, most moving parts** |

The last row is the one that gets proposed, and it is genuinely the only way to accept a 200 MB
PDF. It is also the most expensive here, for a reason specific to this repo:

- The existing 27 handlers accept `UploadFile` from the current request. They cannot read from a
  bucket, and the tree is frozen. So direct-to-GCS means **new endpoints in `web/`** — either 27
  duplicated handlers, or a body-synthesis shim that intercepts a JSON manifest, fetches the
  object, builds a multipart body and replays it into the app. The shim keeps the handlers
  untouched but is exactly the kind of cleverness that fails subtly under load; I would not ship
  it.
- It adds a bucket, bucket CORS for the web origin, a signing identity
  (`roles/iam.serviceAccountTokenCreator` for V4 URLs), and lifecycle cleanup. GCS lifecycle
  rules have a **one-day minimum**, so either you delete objects explicitly after each job (best
  effort, as the app already does with `/tmp`) with lifecycle as the backstop, or the privacy
  statement becomes "deleted within 24 hours" — a materially weaker claim than "deleted after the
  response".
- It changes the client contract for all 27 tools from one `FormData` POST to a three-step flow,
  and the download path from one blob to a signed fetch. That is a frontend rewrite, not a tweak.

**Recommendation: do not build it now.** For the accepted design (30 MB total, streamed
responses) a bucket lifts nothing that is still capped. Revisit it only if the product wants
uploads above 32 MiB, resumable transfers, or jobs that outlive the connection — at which point
it is a deliberate v2 with a known cost, not a workaround. If the itch is specifically "let bigger
files through soon", h2c is the cheaper lever, and the honest trade is hypercorn's maturity for
the absence of any app changes.

### 5.2 Topology

| Option | Notes |
|---|---|
| **One service** (recommended): the container serves the static export *and* the API | Single origin → no CORS, no preflight, no token, one URL to share, one revision to roll back |
| Two services: static on Cloud Storage + CDN, API on Cloud Run | Cheaper static hosting, better caching, but reintroduces CORS (`expose_headers` for `Content-Disposition`/`X-Job-Notice`/`X-OCR-Applied` are already wired) and an API-key/token story |

### 5.3 Sizing

| Knob | Value | Why |
|---|---|---|
| CPU / memory | 1 vCPU / 2 GiB minimum; 2 vCPU / 4 GiB for OCR + LibreOffice | `soffice` and `ocrmypdf` are memory-hungry |
| Concurrency | 1 | CPU-bound sync work; 80 would thrash |
| Timeout | 1800 s (or 900 s) | Must exceed `SUBPROCESS_TIMEOUT` 600 s |
| min-instances | 1 for a polished demo, 0 for cheapest | 1 always-on instance ≈ $60–80/month at list rates; 0 relies on cold starts |
| max-instances | 3–5 | Caps both spend and abuse |
| Region | Nearest user base (e.g. `asia-south1`); check tier pricing | Latency on uploads, not compute |

## 6. Target architecture

```
Browser ── HTTPS ──► Cloud Run service (single, 0.0.0.0:$PORT)
                      │
                      ├─ StaticFiles(frontend/out, html=True)  ← "/", 27 tool pages
                      └─ FastAPI app (backend/app)  ← /api, /api/v1
                            │
                            └─ /tmp scratch (in-memory)
                                 ├─ upload_<uuid>.*
                                 ├─ gs / pdftoppm / tesseract / ocrmypdf / soffice
                                 └─ output_* → returned chunked, deleted in a finally block
```

No database, no bucket, no queue, no broker. One revision = one image = one static export.

## 7. Change list — as finally built

> **Superseded by the pivot.** This section describes the adapter layer that existed while the
> desktop build was frozen: `web/chunked.py`, `web/limits.py`, `web/pages.py` and their ASGI
> tests. Once the desktop app was retired those files were deleted and the same three rules
> moved into the code they belong to — a `StreamingResponse` in both routers' `_file_response`,
> `validate_total_size` in `validation.py`, and `validate_render_budget` in the three
> rasterising tasks, which also closed the `docx-to-images` gap because the page count is now
> taken after LibreOffice paginates. The live suite passes 35/35. Read the rest of this section
> as the history of *why* those rules exist, not as the current layout.

**The old constraint (no longer applicable): the published desktop tree was frozen.**
`backend/app` was frozen into `yourpdf-backend.exe` and `desktop/` was the shipped shell.

The consequence is that the three guards become HTTP-layer adapters instead of `if` statements
in the routers. That is more code, not less, and it needs its own tests.

### New `web/` (all of it additive)

**Built so far:** all three guards live in `backend/`; the entrypoint, the image and the deploy
workflow exist and the image is verified. `web/Dockerfile` builds the export in a Node stage and
the runtime carries Ghostscript, Poppler, Tesseract, LibreOffice (writer **and** impress) and
ocrmypdf; `backend/requirements-image.lock` is the Linux-resolved dependency set.
`.github/workflows/deploy-web.yml` builds, pushes by digest, runs the 35-case suite **inside the
image with `--fail-on-skip`**, then deploys with the flags from §5.3. Locally verified: 36/36
endpoints in-container with zero skips, as a non-root user.

**Image size: 1.34 GB** (was 1.57 GB). The build is dominated by things the feature set needs:
LibreOffice 187 MB plus 179 MB of shared system libraries, and the Python payload at 413 MB —
OpenCV alone is 158 MB (pdf2docx's table detection), then PyMuPDF 62, NumPy 70, fontTools 27.
What was reclaimed, all verified by running the full suite after each change:

| Change | Saving |
|---|---|
| `libreoffice-writer-nogui` / `-impress-nogui` instead of the GUI variants | ~30 MB |
| Drop `/usr/share/doc`, the LO gallery/templates, the duplicate `/usr/share/libreoffice` registry, `osd.traineddata` | ~60 MB |
| `pip --no-compile` (no `.pyc`; imports compile in memory, +1.3 s on a cold import) | ~59 MB |
| Remove `pip` itself from the runtime | ~7 MB |

Two things looked attractive and were rejected: **stripping symbols** (27 MB) corrupts NumPy's
bundled OpenBLAS with "ELF load command address/offset not page-aligned", and a strip in its own
layer *grew* the image by 300 MB because rewritten files are copied while the originals stay.
Deleting poppler's cMap data or the Type1 fonts would save another ~20 MB but change how CJK and
unembedded fonts render, which is not worth it for a conversion tool.

1. ✅ `web/serve.py` — entrypoint. Imports `app.main:app` **unmodified**, binds `0.0.0.0:$PORT`
   (`PORT` or `WEB_PORT`), keeps `RscPrefetchRewriteMiddleware` and the `StaticFiles(html=True)`
   mount (both required by the Next.js 16 export), prunes `upload_*`/`output_*` at startup, and
   installs the guards. Skips `LoopbackTokenMiddleware` (browser, not loopback) and the Windows
   child-kill. A missing `frontend/out` degrades to API-only instead of crashing.
2. ✅ `web/limits.py` — **guard 1, 30 MiB total upload**, as pure ASGI middleware: reject
   `/api/*` requests whose `Content-Length` exceeds the cap with the app's own JSON 413 before
   the body is parsed; when the header is absent, buffer up to the cap and replay the body
   downstream, so a chunked client also gets a clean rejection instead of a dead connection.
   Browsers always send `Content-Length` for `FormData`, so the header path is the real one and
   the buffer path is bounded by the cap itself. `WEB_MAX_TOTAL_UPLOAD_MB=0` disables it.
3. ✅ `web/chunked.py` — **guard 2, chunked responses**. On `http.response.start`, drop
   `content-length` for `/api/*` responses above the threshold (16 MiB default,
   `WEB_CHUNK_THRESHOLD_MB` to override) so uvicorn emits `Transfer-Encoding: chunked` and the
   32 MiB response cap stops applying. Skips `HEAD` (its length is legitimately useful),
   `1xx`/`204`/`304`, and every non-`/api` path, so static assets and `/health` are untouched.
   Pure ASGI for the same reason the sidecar's token middleware is: `BaseHTTPMiddleware` would
   buffer the body a second time and can deadlock multipart uploads.
4. ✅ `web/pages.py` — **guard 3, page/slide budget**: rebind the task reference each router
   already holds (`app.routers.pdf.pdf_to_images_task`, `app.routers.office.pptx_to_images_task`),
   count the *requested selection* with `pypdf` / slides with `python-pptx`, and raise
   `HTTPException(400)` over budget. Rebinding the module global works because the routers look
   the name up at request time: no request-body parsing, no duplicated handlers. The counter
   reuses the backend's own `resolve_path` and pages-spec parser so the guard and the task can
   never disagree, and any counting error declines the check so a broken file still fails with
   the task's own message rather than a confusing budget error.
   **Known gap: `docx-to-images` cannot be pre-counted** — a DOCX has no page count until
   LibreOffice lays it out, so that one path is guarded only by instance memory (4 GiB) and
   `--max-instances`. Documented rather than faked with a character heuristic.
5. ⬜ `web/Dockerfile` — multi-stage `python:3.12-slim`; runtime apt: `ghostscript`,
   `poppler-utils`, `tesseract-ocr`, `tesseract-ocr-eng`,
   `libreoffice-writer --no-install-recommends`, `fonts-liberation`, `ocrmypdf`, `procps`;
   `pip install -r requirements.lock` (the desktop `requirements-build.lock` is
   Windows/PyInstaller-specific and must not be used); non-root;
   `ENV PORT=8080 YOURPDF_TMP=/tmp HOME=/tmp TMPDIR=/tmp TMP=/tmp
   WEB_MAX_TOTAL_UPLOAD_MB=30 WEB_MAX_RENDER_PAGES=100`.

   **`HOME` and `TMPDIR` are not optional** — both were proven by a live run, not assumed.
   LibreOffice exits `0xC0000409` (fail-fast) when it cannot create its user profile, so with
   a non-writable `HOME` every Office conversion 500s while the pure-Python merges still pass.
   ocrmypdf copies its input into a `tempfile.mkdtemp` work folder, so a non-writable
   `TMPDIR` turns every OCR into a `PermissionError` surfaced as "The file couldn't be
   written". Both are invisible in `TestClient`, which runs no child processes.
6. ⬜ `web/service.yaml` / documented `gcloud run deploy` flags (sizing table in §5.3) and the CI
   job: build the frontend export, copy into the image, push to Artifact Registry, deploy.
7. ✅ `web/tests/` — guard 2 is covered by 11 tests driven through `httpx`'s ASGI transport:
   strip above threshold, keep at/below, the 16 MiB default, byte-exact body, preserved
   `Content-Disposition`/`X-Job-Notice`, untouched non-`/api` paths, untouched `HEAD`, missing
   `content-length` passthrough, `204`, and lifespan passthrough. Guards 1 and 3 will need
   their own. These are new tests, never edits to the existing 114.

**Live-wire verification of guard 2** (what the unit tests structurally cannot prove, because
`Transfer-Encoding` is emitted by the server, not the app):

| Check | Result |
|---|---|
| `image/compress` with `WEB_CHUNK_THRESHOLD_MB=0.001` | `Transfer-Encoding: chunked`, no `content-length`, `content-disposition` intact |
| same call at the default 16 MiB threshold | `content-length: 10799` — untouched |
| 20 MiB body through a real uvicorn socket | chunked, `size_download=20971520` (all bytes) |
| `/` (static export), `/health` | `content-length` preserved; API unchanged at both `/api` and `/api/v1` |

**Live endpoint run (34 of 35 cases pass).** `web/tests/smoke_endpoints.py` drives every tool
endpoint against a running server; `web/tests/test_smoke_coverage.py` parses the desktop
suite's `CASES` table out of `desktop/scripts/smoke.mjs` and fails if the web suite stops
covering a path, so the two lists cannot drift. The suite includes the guard cases below, so a
budget regression shows up as a failed endpoint rather than a production surprise:

| Case | Expectation | Result |
|---|---|---|
| `pdf-to-images`, 150-page PDF, `pages=all` | 400 over the 100-page budget | PASS |
| same document, `pages=1-2` | 200 — the budget counts the selection | PASS |
| any tool call with `WEB_MAX_TOTAL_UPLOAD_MB=0.001` | JSON 413 naming the limit | PASS |
| the same call at the default 30 MB | 200 | PASS |

Three findings that only a live run produces:

- Office conversions and OCR depend on writable `HOME` / `TMPDIR` in the process that spawns
  them (details in item 5 above). Everything else — all PDF and image tools, both Office
  merges, protect/unlock — passes without them, which is exactly the false-green a
  `TestClient` suite would have shown.
- An **empty required form field never reaches the handler**: the multipart parser drops it,
  so FastAPI answers `422 field required` and the endpoint's own `400` branch is unreachable.
  The UI must render 422s, not assume every rejection is a `detail` string.
- The **budget wrapper must resolve the upload path itself**. Routers hand tasks a relative
  `tmp/upload_*` path and the task resolves it internally; a wrapper that opened the raw path
  produced `[Errno 2] No such file` on every rasterise. It now reuses the backend's own
  `resolve_path`, which is the only version that stays correct if `YOURPDF_TMP` moves.

**Local Windows run** needs three things the container gets for free: `myenv\Scripts` on
`PATH` (for `ocrmypdf`), and writable `APPDATA` + `TEMP` dirs for the server process, e.g.
point them at a scratch directory before `python -m web.serve`.

### Frontend — build-gated, must be provably inert

The shared export is also what Tauri loads, so any UI change is gated on
`NEXT_PUBLIC_WEB_MODE=1` and off by default:

8. Total-size pre-check before upload (sum of selected files), so an oversize request gets a
   sentence instead of Cloud Run's HTML 413. This one cannot be replaced server-side: Cloud Run
   rejects >32 MiB before any Python code runs.
9. A web-only notice on the tool pages: files are uploaded to the server and deleted after the
   response. Without it the current privacy copy is false on web.
10. A "download the desktop app" CTA (the `site/` landing page already links the installer).

Acceptance check for 8–10: build the export with the flag **unset** and diff it against the
current `frontend/out`. If anything differs, the gating leaks and the change is rejected. If
you decide even gated frontend edits are out of bounds, drop 8–10 and accept Cloud Run's own
413 plus a notice on the landing page instead — that is a real UX regression, so it should be a
deliberate choice.

### Not needed

- Any change to `backend/`, `desktop/`, the sync "one POST → bytes in the same response"
  contract, the 27 tool pages, CORS (single origin), or the `X-API-Key` path.

## 8. Cost sketch (order of magnitude)

- `min-instances 0`, demo traffic: likely inside the free monthly allotment, or a few dollars.
  An OCR job of a minute at 2 vCPU is fractions of a cent.
- `min-instances 1`, 1 vCPU / 2 GiB: ~$60–80/month at list rates, billed whether or not
  anyone is using it.
- Storage cost is zero: there is no bucket.
- The dominant risk is not the average bill, it is an uncapped public endpoint under abuse —
  hence `--max-instances` and a budget alert.

## 9. Verification plan before committing to the design

1. **Prove nothing leaked into the desktop tree**: `git status` shows only new files under
   `web/` plus the gated frontend edits, and the existing 114 backend tests run unchanged.
   Build the frontend export with `NEXT_PUBLIC_WEB_MODE` unset and diff it against the current
   `frontend/out` — byte-identical, or the gating leaks.
2. Build the image; run it locally on `:8080`; smoke 6 representative tools: compress, merge
   (2 files), split, ocr, docx-to-pdf, pdf-to-images (which produces a ZIP). Assert
   `Transfer-Encoding: chunked` and no `Content-Length` on the ZIP.
3. Deploy once and re-run the smoke through the Cloud Run URL (this is where CORS, `$PORT`,
   and probe behaviour surface).
4. **Empirically test the envelope**: POST a ~40 MB merge and a request that produces a >32 MiB
   ZIP. The first should be refused (ideally by the client pre-check, at worst by Cloud Run);
   the second must stream successfully.
5. Measure cold start and p95 per tool; decide min-instances.
6. Check `soffice` under concurrency 1 with a 30 MB DOCX; watch memory in Cloud Monitoring.

## 10. Alternatives worth weighing before building

Kept for the record: the full-parity decision in §1.1 supersedes the subset options below.

- **Client-side demo subset.** The light tools (merge, split, rotate, organize, images-to-pdf,
  image tools) are achievable in the browser with WASM (`pdf-lib`, `pdf.js`, `tesseract.js`,
  ghostscript-wasm). Zero server cost, preserves the privacy pitch exactly, and no 32 MiB
  limit. It cannot reach LibreOffice/ocrmypdf parity, so it is a funnel, not a full web app.
- **Hosted demo limited to the cheap tools** (compress, images-to-pdf, rotate, image tools),
  with OCR/Office marked "desktop only". Cuts memory to ~1 GiB, keeps concurrency 1, and makes
  the cost per trial near zero.
- **Full parity on Cloud Run** — what this document assesses. Highest cost and risk, best
  "try before download" fidelity.

## 11. Open questions

Answered: full parity (all 27 tools); 30 MB **total** per request; h2c rejected; rasterizer
guardrail = 100-page/slide budget on web.

Still open:

1. Is sign-in (IAP) acceptable for a beta, or must the demo be anonymous? This is the largest
   remaining cost/abuse decision.
2. Is `asia-south1` acceptable as the region, given the current user base?
3. Does the trial get `--min-instances 0` (cheap, 5–10 s cold start) or `1` (≈$60–80/month,
   instant first request)?

## 12. Bottom line

The architecture is not the obstacle: statelessness, the sync `POST`-returns-bytes contract,
and the static export are all serverless-friendly, and this exact stack already ran on Cloud
Run once. The obstacles are the 32 MiB request/response envelope, the default concurrency and
memory, and the missing web entrypoint — all fixable, the first by a deliberate product
decision about file limits. Treat the envelope as a design constraint from day one rather than
something to discover in production.

## Appendix: why h2c is rejected

Cloud Run's HTTP/2 (`--use-http2`) is a real, documented switch, not a rumour — but it is the
wrong lever here. The mechanics, verified against the current docs:

- By default Cloud Run **downgrades** requests from HTTP/2 to HTTP/1.1 before they reach the
  container (native gRPC excepted).
- `--use-http2` (or `ports: [{name: h2c, containerPort: 8080}]` in YAML, or the Terraform
  equivalent) stops that downgrade; TLS still terminates at Google's frontend, which forwards
  **h2c** to the container.
- The container must then genuinely speak h2c; the documented local check is
  `curl -i --http2-prior-knowledge http://localhost:PORT`.
- The quotas page states the 32 MiB request limit "applies if using HTTP/1 server. No limit
  if using HTTP/2 server" — so the flag does lift the request cap.

Why it still loses:

1. **It solves a problem we no longer have.** With a 30 MB total upload cap the body is
   ~31.5 MB, comfortably under 32 MiB. h2c only matters if the cap is ever raised.
2. **It does not solve the response side alone.** The 32 MiB response limit already exempts
   chunked/streaming responses (`Starlette`'s `StreamingResponse` never sets `Content-Length`
   — verified in `starlette/responses.py`), so streaming is the fix there and works on
   HTTP/1.1.
3. **It is all-or-nothing at the service level.** The flag and the server implementation must
   match exactly. `--use-http2` in front of a uvicorn container breaks *every* request, not
   one endpoint; and nothing in the 114 backend tests (TestClient, no real ASGI server) would
   catch that mismatch.
4. **It swaps a boring dependency for a less-exercised one.** hypercorn replaces uvicorn,
   forcing re-verification of multipart parsing, `X-Forwarded-*` handling, the sync threadpool
   path, and graceful shutdown — while the desktop sidecar keeps uvicorn, so two server
   runtimes would need supporting.
5. **It buys nothing a customer can see.** Browsers already reach Cloud Run over HTTP/2; the
   h2c hop is invisible. Multiplexing is irrelevant at concurrency 1.

Revisit h2c only if the product later needs a request larger than 32 MiB without Cloud
Storage. It is contained to the entrypoint file, so deferring it costs nothing.
