"""One place that turns task output into an HTTP file response.

Every router used to carry its own copy of this, and the copies drifted: the PDF and Office
routers streamed while the image router returned a length-delimited ``Response``, which is
capped at 32 MiB by the host and silently failed large downloads. One implementation, one
media-type table, no drift.

Keep the response streamed: a rasterised ZIP or converted deck is routinely larger than the
upload that produced it, and only a chunked body escapes that cap.
"""

from __future__ import annotations

import os

from fastapi.responses import Response, StreamingResponse

# Union of every extension a task can produce. Keep it exhaustive: `test_http_io.py` asserts
# each router's outputs are covered here rather than falling back to octet-stream.
MEDIA_TYPES: dict[str, str] = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".zip": "application/zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

DEFAULT_MEDIA_TYPE = "application/octet-stream"


def media_type_for(filename: str) -> str:
    return MEDIA_TYPES.get(os.path.splitext(filename.lower())[1], DEFAULT_MEDIA_TYPE)


def file_response(data: bytes, download_name: str, headers: dict | None = None) -> Response:
    """Stream ``data`` back as an attachment.

    ``StreamingResponse`` is deliberate: it sends the body chunked, and the host's 32 MiB
    length-delimited response cap does not apply to a chunked body. Do not "simplify" this
    back to ``Response(content=data)``.
    """
    response_headers = {"Content-Disposition": f'attachment; filename="{download_name}"'}
    if headers:
        response_headers.update(headers)

    return StreamingResponse(
        iter([data]),
        media_type=media_type_for(download_name),
        headers=response_headers,
    )
