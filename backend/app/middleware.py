"""Request context: one id, one access line, zero buffering.

Pure ASGI on purpose. ``BaseHTTPMiddleware`` wraps the receive channel, and this app streams
multipart uploads and chunked downloads through it — the earlier token middleware in the
desktop build deadlocked exactly that way.

The id is echoed as ``X-Request-ID`` so a user's screenshot of an error screen maps to a log
line, which is the difference between "it failed" and a diagnosable report.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

access_log = logging.getLogger("yourpdf.access")


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key.lower() == name:
            return value.decode("latin-1")
    return None


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        # Trust an upstream id (Cloud Run can supply one) so tracing crosses the boundary.
        request_id = _header(scope, b"x-request-id") or uuid.uuid4().hex[:12]
        scope.setdefault("state", {})["request_id"] = request_id

        started = time.perf_counter()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message.get("type") == "http.response.start":
                status = int(message.get("status", 500))
                headers = list(message.get("headers") or [])
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            access_log.info(
                "%s %s -> %s in %sms rid=%s",
                scope.get("method", "?"),
                scope.get("path", "?"),
                status,
                elapsed_ms,
                request_id,
            )
