"""Desktop sidecar: the real FastAPI app + static export, same origin, token-gated.

Additive by design — nothing in backend/ is modified. Dev run:

    YOURPDF_TOKEN=dev ..\\..\\myenv\\Scripts\\python.exe serve.py

Prints `YOURPDF_PORT <port>` on stdout once ready — the handshake the desktop shell reads
before loading the UI (no hardcoded port, no race).
"""
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent  # D:\Projects\pdf-toolkit
BACKEND = REPO / "backend"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from fastapi.staticfiles import StaticFiles  # noqa: E402
from app.main import app  # noqa: E402

TOKEN = os.environ.get("YOURPDF_TOKEN") or secrets.token_urlsafe(24)
OUT_DIR = Path(os.environ.get("YOURPDF_OUT") or (REPO / "frontend" / "out"))
# The desktop shell serves the export itself and only needs the API, so it spawns with
# YOURPDF_SERVE_STATIC=0. Leaving it at 1 also serves frontend/out from this server, which is
# handy for a plain-browser session against the real backend.
SERVE_STATIC = os.environ.get("YOURPDF_SERVE_STATIC", "1") != "0"

OPEN_PATHS = ("/health", "/healthz", "/api/v1/capabilities")
OPEN_PREFIXES = ("/_next/", "/fonts/", "/favicon", "/icons/")

WINDOWS = os.name == "nt"
CREATE_NO_WINDOW = 0x08000000 if WINDOWS else 0
DEFAULT_TIMEOUT = int(os.environ.get("YOURPDF_TIMEOUT", "120"))
LONG_TIMEOUT = int(os.environ.get("YOURPDF_LONG_TIMEOUT", "300"))
LONG_PATHS = ("/ocr", "/docx-to-pdf", "/pptx-to-pdf", "/merge-docx", "/merge-pptx", "/pdf-to-docx")


def _log(message: str) -> None:
    """Desktop status prints must never be able to break a request. When the shell stops
    draining our stdout the pipe closes, and print(flush=True) raises OSError EINVAL —
    inside an endpoint that aborts the HTTP response mid-flight. Callers on the request
    path (cancel, watchdog) use this instead of print."""
    try:
        print(message, flush=True)
    except OSError:
        pass


def _is_static(path: str, method: str) -> bool:
    # CORS preflight never carries the token (browsers omit custom headers on OPTIONS),
    # so it must pass or a cross-origin UI can never reach the API at all.
    if method == "OPTIONS":
        return True
    if method in ("GET", "HEAD") and not path.startswith("/api/"):
        return True
    return path.startswith(OPEN_PREFIXES) or path in OPEN_PATHS


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)


def child_pids() -> list[int]:
    """Every subprocess the backend shelled out to (gs, tesseract, soffice, ocrmypdf…).

    conhost.exe is deliberately excluded: the sidecar's console host is a direct
    child, and killing it leaves the sidecar unable to start any later console
    program — tesseract/gs then exit at DLL init with 0xC0000142, so a single
    Cancel poisons every subsequent job until the app is restarted.
    """
    if not WINDOWS:
        out = _run(["pgrep", "-P", str(os.getpid())])
        return [int(x) for x in out.stdout.split() if x.isdigit()]
    try:
        return _child_pids_ctypes()
    except Exception:
        pass
    # Fallback only: this spawns PowerShell (~2s). It must never raise — a console-less
    # child (CREATE_NO_WINDOW) can fail Process creation outright with Errno 22, and an
    # exception here would escape the /cancel handler.
    try:
        out = _run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"Get-CimInstance Win32_Process -Filter 'ParentProcessId={os.getpid()}' | "
                'ForEach-Object { "$($_.ProcessId) $($_.Name)" }',
            ]
        )
    except OSError as e:
        _log(f"YOURPDF_CHILD_PIDS fallback failed: {e}")
        return []
    pids: list[int] = []
    for line in out.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].lower() != "conhost.exe":
            pids.append(int(parts[0]))
    return pids


def _child_pids_ctypes() -> list[int]:
    """Toolhelp32 snapshot: ~1ms, versus ~2s for spawning PowerShell on every Cancel."""
    import ctypes
    from ctypes import wintypes

    class PROCESSENTRY32(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", ctypes.c_char * 260),
        ]

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    # Declare the signatures: without restype, ctypes assumes a 32-bit int and truncates
    # the 64-bit snapshot HANDLE. That silently broke enumeration, dropped the code into
    # the PowerShell fallback, and the fallback raised Errno 22 in a console-less child —
    # which surfaced as POST /api/v1/cancel dying mid-response ("Failed to fetch").
    k32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    k32.Process32First.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32)]
    k32.Process32First.restype = wintypes.BOOL
    k32.Process32Next.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32)]
    k32.Process32Next.restype = wintypes.BOOL
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    k32.CloseHandle.restype = wintypes.BOOL

    snap = k32.CreateToolhelp32Snapshot(0x00000002, 0)  # TH32CS_SNAPPROCESS
    if snap == wintypes.HANDLE(-1).value:
        raise OSError("CreateToolhelp32Snapshot failed")

    entry = PROCESSENTRY32()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
    me = os.getpid()
    pids: list[int] = []
    try:
        if not k32.Process32First(snap, ctypes.byref(entry)):
            raise OSError("Process32First failed")
        while True:
            name = entry.szExeFile.decode("mbcs", "ignore").lower()
            if entry.th32ParentProcessID == me and name != "conhost.exe":
                pids.append(int(entry.th32ProcessID))
            if not k32.Process32Next(snap, ctypes.byref(entry)):
                break
    finally:
        k32.CloseHandle(snap)
    return pids


def kill_task_children() -> int:
    """Aborting a request only drops the HTTP response; the work keeps burning CPU.
    Killing the tree is what actually cancels a merge/OCR. Never raises: Cancel is a
    last-resort action and must not be able to take the server down with it."""
    killed = 0
    try:
        pids = child_pids()
    except Exception as e:
        _log(f"YOURPDF_CANCEL enumerate failed: {e}")
        return 0
    for pid in pids:
        try:
            _run(["taskkill", "/PID", str(pid), "/T", "/F"])
            killed += 1
        except OSError as e:
            _log(f"YOURPDF_CANCEL taskkill {pid} failed: {e}")
    return killed


class ActiveRequests:
    """Tracks in-flight /api calls so a watchdog can free the single-port server."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict[str, float] = {}

    def start(self, key: str) -> None:
        with self._lock:
            self._active[key] = time.monotonic()

    def finish(self, key: str) -> None:
        with self._lock:
            self._active.pop(key, None)

    def expired(self) -> list[str]:
        now = time.monotonic()
        with self._lock:
            return [k for k, t in self._active.items() if now - t > self._timeout_for(k)]

    @staticmethod
    def _timeout_for(key: str) -> int:
        return LONG_TIMEOUT if any(p in key for p in LONG_PATHS) else DEFAULT_TIMEOUT


ACTIVE = ActiveRequests()


def watchdog() -> None:
    while True:
        time.sleep(5)
        stale = ACTIVE.expired()
        if stale:
            n = kill_task_children()
            _log(f"YOURPDF_TIMEOUT killed {n} child process(es) for {len(stale)} stale request(s)")
            for key in stale:
                ACTIVE.finish(key)


class RscPrefetchRewriteMiddleware:
    """Next.js 16 static export writes the RSC segment payload nested (/x/__next.x/__PAGE__.txt)
    but the client requests the dot form (/x/__next.x.__PAGE__.txt); rewrite so prefetch hits a real file."""

    _pattern = re.compile(r"^(?P<base>.*/__next\.[^/]+)\.__PAGE__\.txt$")

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            m = self._pattern.match(path)
            if m:
                path = f"{m.group('base')}/__PAGE__.txt"
                scope = dict(scope)
                scope["path"] = path
                scope["raw_path"] = path.encode("utf-8")
        return await self.app(scope, receive, send)


class LoopbackTokenMiddleware:
    """Loopback is not a trust boundary: any local process, or any web page in the user's
    browser, can POST here (a plain form post ignores CORS). Require the per-launch token.

    Pure ASGI (never BaseHTTPMiddleware): wrapping the request body stream deadlocks multipart
    uploads.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope.get("path", "")
        method = scope.get("method", "GET")
        if _is_static(path, method):
            return await self.app(scope, receive, send)

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        supplied = headers.get("x-yourpdf-token", "")
        if not supplied:
            for part in scope.get("query_string", b"").decode("latin-1").split("&"):
                if part.startswith("t="):
                    supplied = part[2:]
                    break
        if not supplied or not secrets.compare_digest(supplied, TOKEN):
            body = b'{"detail":"unauthorized"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        key = f"{method} {path}"
        ACTIVE.start(key)
        try:
            return await self.app(scope, receive, send)
        finally:
            ACTIVE.finish(key)


def add_desktop_routes() -> None:
    from fastapi.responses import JSONResponse

    @app.get("/api/v1/capabilities")
    def capabilities():
        def resolve(name: str, extra: tuple[str, ...] = ()) -> str | None:
            for cand in (shutil.which(name), *extra):
                if cand and os.path.exists(cand):
                    return cand
            return None

        soffice_paths = (
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        )
        gs = resolve("gswin64c") or resolve("gs")
        tess = resolve("tesseract")
        poppler = resolve("pdftoppm")
        return JSONResponse(
            {
                "libreoffice": bool(resolve("soffice", soffice_paths)),
                "ocr": bool(tess and gs),
                "gs": bool(gs),
                "poppler": bool(poppler),
                # Paths make it obvious whether the bundled copies are the ones in use.
                "paths": {"gs": gs, "tesseract": tess, "poppler": poppler},
            }
        )

    @app.post("/api/v1/cancel")
    def cancel():
        killed = kill_task_children()
        _log(f"YOURPDF_CANCEL killed {killed} child process(es)")
        return JSONResponse({"killed": killed})


def prune_tmp() -> None:
    tmp = Path(os.environ.get("YOURPDF_TMP") or (BACKEND / "tmp"))
    if not tmp.is_dir():
        return
    for pattern in ("upload_*", "output_*"):
        for path in tmp.glob(pattern):
            try:
                path.unlink()
            except OSError:
                pass


def main() -> None:
    # Frozen desktop builds have no `ocrmypdf` console script on PATH, so the backend calls
    # `<this exe> -m ocrmypdf …`. Dispatch that argv straight into the bundled CLI.
    if "-m" in sys.argv and "ocrmypdf" in sys.argv:
        module_args = sys.argv[sys.argv.index("ocrmypdf") + 1 :]
        sys.argv = ["ocrmypdf", *module_args]
        from ocrmypdf.__main__ import run as ocrmypdf_run

        ocrmypdf_run()
        return

    prune_tmp()
    add_desktop_routes()
    app.add_middleware(LoopbackTokenMiddleware)
    app.add_middleware(RscPrefetchRewriteMiddleware)

    if SERVE_STATIC:
        if not OUT_DIR.is_dir():
            print(f"YOURPDF_ERROR missing frontend export at {OUT_DIR}", flush=True)
            raise SystemExit(1)
        app.mount("/", StaticFiles(directory=str(OUT_DIR), html=True), name="desktop-static")
    else:
        print("YOURPDF_API_ONLY static export not served", flush=True)

    threading.Thread(target=watchdog, daemon=True).start()

    import socket
    import urllib.request

    import uvicorn

    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    def announce() -> None:
        # Report the port only once the socket actually accepts — the shell loads the URL
        # immediately and a premature print is a guaranteed ERR_CONNECTION_REFUSED.
        for _ in range(600):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=0.5)
                break
            except Exception:
                time.sleep(0.1)
        print(f"YOURPDF_PORT {port}", flush=True)

    threading.Thread(target=announce, daemon=True).start()
    server.run()


if __name__ == "__main__":
    main()
