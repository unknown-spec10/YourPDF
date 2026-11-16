"""Detect a digital signature so tools can warn when they invalidate it.

Compressing or annotating a signed PDF silently breaks the signature: the bytes change, so the
cryptographic digest no longer matches. OCR refuses to do this (ocrmypdf stops), but every other
rewriting tool happily proceeded, and the user had no idea their signed document had just become
an unsigned one. Refusing outright would block legitimate work, so these tools warn instead and
still return the result.

Detection is deliberately cheap and structural — no certificate validation:

* an AcroForm with a signature field (``/FT /Sig``) or ``/SigFlags`` set, or
* the byte-range markers a signature dictionary always carries.

Anything unreadable counts as "not signed": a warning is advice, not a gate, so a false negative
costs a missed hint while a false positive would nag on every file.
"""

from __future__ import annotations

import io

from pypdf import PdfReader
from pypdf.generic import IndirectObject

# ASCII only: HTTP header values are latin-1, and an em dash made the whole response 500.
NOTICE = (
    "This PDF was digitally signed. Rewriting it invalidated the signature - "
    "keep the original if you need the signed version."
)


def _field_is_signature(field: object) -> bool:
    try:
        resolved = field.get_object() if isinstance(field, IndirectObject) else field
        field_type = resolved.get("/FT")
        if field_type is not None and str(field_type) == "/Sig":
            return True
        kids = resolved.get("/Kids")
        if kids:
            return any(_field_is_signature(kid) for kid in kids)
    except Exception:
        return False
    return False


def _signed(reader: PdfReader | None, blob: bytes) -> bool:
    if reader is not None:
        try:
            root = reader.trailer.get("/Root") or {}
            acroform = root.get("/AcroForm")
            if acroform is not None:
                form = acroform.get_object() if isinstance(acroform, IndirectObject) else acroform
                if form.get("/SigFlags"):
                    return True
                fields = form.get("/Fields")
                if fields and any(_field_is_signature(field) for field in fields):
                    return True
        except Exception:
            pass
    # Fallback for writers that keep the signature outside an AcroForm.
    return b"/ByteRange" in blob and (b"/Type /Sig" in blob or b"/Type/Sig" in blob)


def _reader_for(source: io.BytesIO) -> PdfReader | None:
    try:
        reader = PdfReader(source)
        # A locked document is refused elsewhere; do not guess about its contents.
        return None if reader.is_encrypted else reader
    except Exception:
        return None


def has_digital_signature_bytes(data: bytes) -> bool:
    """True when these PDF bytes carry a signature field or signature data."""
    return _signed(_reader_for(io.BytesIO(data)), data)


def has_digital_signature(path: str) -> bool:
    """True when the PDF at ``path`` carries a signature field or signature data.

    Routers hand us the ``tmp/...`` relative path the upload helper returned, so it is resolved
    through the same helper the tasks use before opening it.
    """
    from app.tasks.common import resolve_path

    try:
        with open(resolve_path(path), "rb") as handle:
            blob = handle.read()
    except Exception:
        return False
    return _signed(_reader_for(io.BytesIO(blob)), blob)


def _headers(signed: bool) -> dict[str, str]:
    return {"X-Job-Notice": NOTICE} if signed else {}


def signature_headers(paths: list[str] | str | None) -> dict[str, str]:
    """Headers telling the client its signed input was rewritten by this operation."""
    if paths is None:
        return {}
    if isinstance(paths, str):
        paths = [paths]
    return _headers(any(has_digital_signature(path) for path in paths if path))


def signature_headers_bytes(data: bytes) -> dict[str, str]:
    """Same, for endpoints that hold the upload in memory rather than on disk."""
    return _headers(has_digital_signature_bytes(data))
