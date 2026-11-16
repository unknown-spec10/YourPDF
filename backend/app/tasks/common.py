"""Shared helpers for the sync processing functions.

Centralizes the boilerplate shared across every processing module:

- path resolution relative to the backend root,
- ensuring the backend ``tmp/`` working directory exists,
- best-effort cleanup of temporary files,
- output file writing.
"""

import logging
import os
import signal
import subprocess

logger = logging.getLogger(__name__)

# Shared timeout (seconds) for external tools (Ghostscript, LibreOffice, ocrmypdf)
# so crafted files can't hang a request slot forever.
SUBPROCESS_TIMEOUT = 600

# User-facing message raised when an external tool exceeds SUBPROCESS_TIMEOUT.
SUBPROCESS_TIMEOUT_MESSAGE = "Processing timed out, the file may be too complex."

BACKEND_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)


def tmp_root() -> str:
    """Where uploads/outputs live. Delegates to :mod:`app.storage`, the single definition."""
    from app.storage import tmp_root as _tmp_root

    return _tmp_root()


def resolve_path(path_str: str) -> str:
    """Resolve an upload/tmp path to an absolute path under the backend root."""
    path_str = path_str.replace("\\", "/")
    if os.path.isabs(path_str):
        return path_str
    if path_str.startswith("tmp/"):
        return os.path.abspath(os.path.join(tmp_root(), path_str[4:]))
    return os.path.abspath(os.path.join(BACKEND_ROOT, path_str))


def resolve_paths(paths: list[str]) -> list[str]:
    """Resolve a list of upload/tmp paths relative to the backend root."""
    return [resolve_path(fp) for fp in paths]


def ensure_tmp_dir() -> str:
    """Return the backend ``tmp/`` directory, creating it if needed."""
    tmp_dir = tmp_root()
    os.makedirs(tmp_dir, exist_ok=True)
    return tmp_dir


def cleanup_paths(*paths: str | None) -> None:
    """Best-effort removal of temporary files, ignoring missing/failed deletes."""
    for path in paths:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass


def read_bytes(path: str) -> bytes:
    """Read a file's bytes from disk."""
    with open(path, "rb") as f:
        return f.read()


def write_bytes(path: str, data: bytes) -> None:
    """Write bytes to ``path``."""
    with open(path, "wb") as f:
        f.write(data)


def write_text(path: str, text: str) -> None:
    """Write UTF-8 text to ``path``."""
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def count_pdf_pages(path: str) -> int:
    """Page count of a PDF on disk, used to enforce the render budget.

    Imported lazily: this module is shared by every task, and pypdf is only needed by the
    rasterisers.
    """
    from pypdf import PdfReader

    return len(PdfReader(path).pages)


def _kill_tree(pid: int, posix: bool) -> None:
    """Kill a process and everything it spawned. Never raises: it runs on the failure path."""
    try:
        if posix:
            os.killpg(os.getpgid(pid), signal.SIGKILL)
        else:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                check=False,
            )
    except Exception:
        try:
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass


def run_tool(cmd: list[str], *, timeout: int, check: bool = True) -> subprocess.CompletedProcess:
    """Run an external tool so that a timeout kills its whole tree, not just the launcher.

    ``subprocess.run(timeout=...)`` kills the direct child only. Ghostscript, LibreOffice and
    Tesseract all spawn grandchildren, and at concurrency 1 a single orphan keeps the instance's
    only vCPU busy for the rest of its life. Starting the tool in its own session (POSIX) or
    process group (Windows) makes the group killable.
    """
    posix = os.name != "nt"
    kwargs: dict[str, object] = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "text": True,
    }
    if posix:
        kwargs["start_new_session"] = True
    else:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

    process = subprocess.Popen(cmd, **kwargs)
    try:
        out, err = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_tree(process.pid, posix)
        try:
            process.communicate(timeout=10)  # reap so the zombie does not linger
        except subprocess.TimeoutExpired:
            process.kill()
        raise

    completed = subprocess.CompletedProcess(cmd, process.returncode, out, err)
    if check and process.returncode != 0:
        raise subprocess.CalledProcessError(process.returncode, cmd, out, err)
    return completed


def download_name(original_filename: str | None, fallback: str, build) -> str:
    """Name the output after the input, via ``build(base, ext)``.

    One implementation for every task: this existed three times with a stray rename
    (``ext`` vs ``ext_orig``) in the image copy.
    """
    if original_filename:
        base, ext = os.path.splitext(original_filename)
        return build(base, ext)
    return fallback
