"""Shared helpers for the sync processing functions.

Centralizes the boilerplate shared across every processing module:

- path resolution relative to the backend root,
- ensuring the backend ``tmp/`` working directory exists,
- best-effort cleanup of temporary files,
- output file writing.
"""

import logging
import os

logger = logging.getLogger(__name__)

# Shared timeout (seconds) for external tools (Ghostscript, LibreOffice, ocrmypdf)
# so crafted files can't hang a request slot forever.
SUBPROCESS_TIMEOUT = 600

# User-facing message raised when an external tool exceeds SUBPROCESS_TIMEOUT.
SUBPROCESS_TIMEOUT_MESSAGE = "Processing timed out, the file may be too complex."

BACKEND_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)


def resolve_path(path_str: str) -> str:
    """Resolve an upload/tmp path to an absolute path under the backend root."""
    path_str = path_str.replace("\\", "/")
    if not os.path.isabs(path_str):
        path_str = os.path.abspath(os.path.join(BACKEND_ROOT, path_str))
    return path_str


def resolve_paths(paths: list[str]) -> list[str]:
    """Resolve a list of upload/tmp paths relative to the backend root."""
    return [resolve_path(fp) for fp in paths]


def ensure_tmp_dir() -> str:
    """Return the backend ``tmp/`` directory, creating it if needed."""
    tmp_dir = os.path.join(BACKEND_ROOT, "tmp")
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
