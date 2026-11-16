"""Web entrypoint: the FastAPI app plus the static export, on one origin.

Serves the built Next.js export at ``/`` and the API at ``/api`` and ``/api/v1``, so a browser
talks to a single origin: no CORS, no preflight, no token.

Run locally::

    .\\myenv\\Scripts\\python.exe -m web.serve          # http://127.0.0.1:8080

In the container::

    PORT=8080 python -m web.serve

Everything else — size limits, render budget, streaming responses — lives in ``backend/``
because it is application behaviour, not deployment plumbing.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
BACKEND = REPO / "backend"

# The backend package imports as `app.*`, so backend/ has to be importable.
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from fastapi import FastAPI  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

OUT_DIR = Path(os.environ.get("YOURPDF_OUT") or (REPO / "frontend" / "out"))
SERVE_STATIC = os.environ.get("YOURPDF_SERVE_STATIC", "1") != "0"


class RscPrefetchRewriteMiddleware:
    """Next.js 16 writes the RSC segment payload nested (``/x/__next.x/__PAGE__.txt``) but the
    client requests the dot form (``/x/__next.x.__PAGE__.txt``); rewrite so prefetch hits a
    real file instead of a 404.
    """

    _pattern = re.compile(r"^(?P<base>.*/__next\.[^/]+)\.__PAGE__\.txt$")

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            match = self._pattern.match(path)
            if match:
                path = f"{match.group('base')}/__PAGE__.txt"
                scope = dict(scope)
                scope["path"] = path
                scope["raw_path"] = path.encode("utf-8")
        return await self.app(scope, receive, send)


def prune_tmp() -> None:
    """Remove upload/output debris left by an instance that was killed mid-request."""
    from app.storage import tmp_root

    tmp = Path(tmp_root())
    if not tmp.is_dir():
        return
    for pattern in ("upload_*", "output_*"):
        for path in tmp.glob(pattern):
            if path.is_file():
                try:
                    path.unlink()
                except OSError:
                    pass


def build_app() -> FastAPI:
    """Add the static export to the app and return it."""
    app.add_middleware(RscPrefetchRewriteMiddleware)

    if SERVE_STATIC:
        if OUT_DIR.is_dir():
            # Mounted last: the API routes are already registered, so they win. A missing
            # export is a warning, not a crash, so an API-only container still boots.
            app.mount("/", StaticFiles(directory=str(OUT_DIR), html=True), name="web-static")
        else:
            print(f"WEB_WARN missing frontend export at {OUT_DIR}; serving API only", flush=True)

    return app


def main() -> None:
    import logging

    import uvicorn

    # Without basicConfig there is no root handler, so every task's `logger.info` is dropped and
    # only WARNING+ reaches stderr through logging's last-resort handler. That is the difference
    # between "the job just failed" and knowing which tool, on what input, and how long.
    logging.basicConfig(
        level=os.environ.get("WEB_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    prune_tmp()
    build_app()

    host = os.environ.get("WEB_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT") or os.environ.get("WEB_PORT") or "8080")
    # Printed so a revision's log states which export, tmp dir and limits it is actually
    # running with — "export missing" otherwise only shows up as unexplained 404s.
    print(
        f"WEB_READY http://{host}:{port} static={OUT_DIR if SERVE_STATIC else 'off'} "
        f"tmp={os.environ.get('YOURPDF_TMP') or (BACKEND / 'tmp')} "
        f"max_file={settings.max_file_size_mb}MB "
        f"max_total_upload={settings.max_total_upload_mb}MB "
        f"max_render_pages={settings.max_render_pages}",
        flush=True,
    )
    # access_log=False: RequestContextMiddleware logs every request with its id and duration,
    # so uvicorn's own line would just duplicate it without the id.
    uvicorn.run(app, host=host, port=port, log_level=os.environ.get("WEB_LOG_LEVEL", "info").lower(), access_log=False)


if __name__ == "__main__":
    main()
