"""In-memory PDF password protection helpers (pypdf only, no disk, no queue)."""

import io

from pypdf import PdfReader, PdfWriter
from pypdf.errors import WrongPasswordError


def protect_pdf_bytes(data: bytes, password: str) -> bytes:
    """Encrypt PDF bytes with a password. Returns encrypted PDF bytes."""
    if not password:
        raise ValueError("Password is required.")
    reader = PdfReader(io.BytesIO(data))
    writer = PdfWriter()
    writer.append(reader)
    writer.encrypt(password)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def unlock_pdf_bytes(data: bytes, password: str) -> bytes:
    """Decrypt password-protected PDF bytes. Raises ValueError on wrong password."""
    if not password:
        raise ValueError("Password is required.")
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        try:
            result = reader.decrypt(password)
        except WrongPasswordError as e:
            raise ValueError("Incorrect password provided for the PDF file.") from e
        except Exception as e:
            raise ValueError("Incorrect password provided for the PDF file.") from e
        if result == 0:
            raise ValueError("Incorrect password provided for the PDF file.")
    writer = PdfWriter()
    writer.append(reader)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
