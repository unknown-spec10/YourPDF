"""Domain errors, mapped to HTTP exactly once.

The processing layer must be able to say "this page range is invalid" or "this job is too big"
without importing FastAPI. It raises these instead; ``main.py`` registers one handler that
turns them into responses, so the status code lives in one place and tasks stay testable
without an HTTP client.
"""

from __future__ import annotations


class DomainError(Exception):
    """A request the service refuses on its own terms."""

    http_status = 400

    def __init__(self, detail: str = "", status_code: int | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        if status_code is not None:
            self.http_status = status_code


class InvalidRequest(DomainError):
    """Malformed or unprocessable input: bad page spec, unreadable signature, bad geometry."""

    http_status = 400
