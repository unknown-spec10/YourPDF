"""Upload and render limits, as domain rules rather than HTTP concerns.

Why this module exists separately from ``validation.py`` and from the routers:

- the caps have to be enforced *inside tasks* (the render budget can only be known after a
  DOCX is paginated), so the task layer needs them without importing FastAPI;
- they used to be a literal ``30`` at every call site plus two dead constants, so moving a
  limit meant touching twenty-odd files.

Failures are domain exceptions. ``main.py`` maps them to responses once, so a limit hit in a
task still produces the right status code instead of a generic 500.
"""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.errors import DomainError


class LimitExceeded(DomainError):
    """Base for a request that is valid but too large to serve."""

    http_status = 400


class UploadTooLarge(LimitExceeded):
    http_status = 413


class RenderBudgetExceeded(LimitExceeded):
    http_status = 400


def file_size_mb() -> int:
    return settings.max_file_size_mb


def _size_of(file: Any) -> int:
    """Byte size of an uploaded file, leaving its read position at the start."""
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    return size


def validate_file_size(file: Any, max_size_mb: int | None = None) -> None:
    """Per-file cap. ``max_size_mb`` overrides the configured default when a field needs its
    own limit (a signature image is capped at 5 MB, not 30)."""
    limit = file_size_mb() if max_size_mb is None else max_size_mb
    if limit and _size_of(file) > limit * 1024 * 1024:
        raise UploadTooLarge(f"File size exceeds the maximum limit of {limit}MB.")


def validate_total_size(files: list[Any], max_size_mb: int | None = None) -> None:
    """Cap the sum of every upload in one request.

    The host rejects an HTTP/1.1 request above 32 MiB before the app sees it, so a request that
    adds up past the cap would fail with an opaque infrastructure error. Refusing it here keeps
    the message actionable and leaves headroom for multipart framing.
    """
    limit = settings.max_total_upload_mb if max_size_mb is None else max_size_mb
    if limit <= 0:
        return

    total = sum(_size_of(file) for file in files)
    if total > limit * 1024 * 1024:
        raise UploadTooLarge(
            f"These files total {total / (1024 * 1024):.1f} MB, over the {limit} MB limit "
            "for one request. Remove a file or split the work into smaller batches."
        )


def validate_render_budget(page_count: int, unit: str = "pages") -> None:
    """Cap how many pages/slides one job may rasterise.

    Rasterising turns a small upload into an unbounded download (100 pages at 150 DPI is
    roughly 100-150 MB), and the archive is built in memory before it streams. The cap keeps
    one job from exhausting an instance or a browser tab.
    """
    limit = settings.max_render_pages
    if limit <= 0 or page_count <= limit:
        return

    raise RenderBudgetExceeded(
        f"This job would render {page_count} {unit}, but the limit is {limit} per job. "
        "Render a smaller page range, or split the document into parts."
    )
