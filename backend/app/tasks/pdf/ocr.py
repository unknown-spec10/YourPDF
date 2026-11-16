"""Synchronous PDF processing functions (in-request, no queue).

Each function takes an absolute (or backend-relative) input path, runs the
same conversion logic the old queued tasks used to run, and returns
``(output_bytes, download_filename)``. Callers stream the bytes straight
back as a ``Response``. ``extract_text`` is the exception: with
``export_txt=False`` it returns ``(text, None)`` and the router replies
with JSON.
"""

import logging
import os
import subprocess
import sys
import uuid


from app.errors import InvalidRequest
from app.tasks.common import (
    SUBPROCESS_TIMEOUT,
    SUBPROCESS_TIMEOUT_MESSAGE,
    cleanup_paths,
    ensure_tmp_dir,
    read_bytes,
    resolve_path,
    resolve_paths,
    write_bytes,
    write_text,
    run_tool,
)

from app.tasks.common import download_name as _download_name
logger = logging.getLogger(__name__)

from app.limits import validate_render_budget  # noqa: E402  (kept beside the tasks it guards)



# ocrmypdf refuses some inputs for reasons the user can actually act on. Those deserve a 400
# with the reason, not a 500 that says "maybe the engine is unavailable".
_OCR_USER_ERRORS: tuple[tuple[tuple[str, ...], str], ...] = (
    (
        ("encryptedpdferror", "input pdf is encrypted"),
        "This PDF is password-protected. Remove the password with the Unlock tool, then run OCR.",
    ),
    (
        ("digitalsignatureerror", "has a digital signature", "digital signature"),
        "This PDF is digitally signed, and OCR would invalidate the signature. "
        "Use an unsigned copy, or remove the signature first.",
    ),
    (
        ("not a pdf", "cannot identify image file"),
        "That file isn't a readable PDF.",
    ),
    (
        ("permission denied",),
        "The file couldn't be written. Check disk permissions or free space.",
    ),
)


def _ocr_user_message(raw: str) -> str | None:
    """The user-facing reason for a known refusal, or None when the cause is unknown."""
    low = (raw or "").lower()
    for needles, message in _OCR_USER_ERRORS:
        if any(needle in low for needle in needles):
            return message
    return None


def _ocr_error_summary(raw: str) -> str:
    """Turn ocrmypdf's DEBUG firehose into one sentence a user can act on.

    ocrmypdf writes hundreds of DEBUG lines before failing, so the raw tail is useless in a
    dialog. Known failure classes get a specific message; anything else falls back to the last
    real error line.
    """
    text = raw or ""
    known = _ocr_user_message(text)
    if known:
        return known
    for line in reversed(text.splitlines()):
        stripped = line.strip()
        if stripped.startswith("[ERROR]"):
            return stripped.replace("[ERROR]", "").strip()[:200] or "OCR failed."
    return "OCR failed. The file may be too complex, or the OCR engine may be unavailable."

def _ocrmypdf_argv() -> list[str]:
    """Where to find ocrmypdf. The container installs the console script on PATH; a frozen
    build (no longer shipped) had to run the bundled module through this interpreter."""
    if getattr(sys, "frozen", False):
        return [sys.executable, "-m", "ocrmypdf"]
    return ["ocrmypdf"]

def _run_ocrmypdf(input_path: str, output_path: str, language: str = "eng") -> None:
    """Run ocrmypdf on ``input_path`` into ``output_path`` and require the output file."""
    cmd = [*_ocrmypdf_argv(), "--skip-text", "-l", language, input_path, output_path]
    logger.info(f"Running OCR command: {' '.join(cmd)}")
    try:
        proc = run_tool(cmd, timeout=SUBPROCESS_TIMEOUT, check=False)
    except FileNotFoundError:
        logger.error(f"OCR could not run: argv={cmd!r}, executable={sys.executable!r}")
        raise

    # ocrmypdf can log a fatal error and still exit 0 when it is dispatched in-process
    # (frozen desktop build), so the exit code alone is not trustworthy: require output.
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip()
        logger.error(f"OCR command failed (code {proc.returncode}): {tail[-2000:]}")
        reason = _ocr_user_message(tail)
        if reason:
            raise InvalidRequest(reason)
        raise Exception(_ocr_error_summary(tail))
    if not os.path.exists(output_path):
        tail = (proc.stderr or proc.stdout or "").strip()
        logger.error(f"OCR produced no output file. ocrmypdf said: {tail[-2000:]}")
        reason = _ocr_user_message(tail)
        if reason:
            raise InvalidRequest(reason)
        raise Exception(_ocr_error_summary(tail))

def ocr_pdf_task(file_path: str, language: str = "eng", original_filename: str = None) -> tuple[bytes, str]:
    """Run OCR via ocrmypdf and return the processed PDF bytes."""
    logger.info(f"Starting OCR task for {file_path}. Language: {language}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")

    output_dir = os.path.dirname(file_path)
    output_filename = f"ocr_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    try:
        _run_ocrmypdf(file_path, output_path, language)

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_ocr{ext}"
        )
        return data, download_name
    except FileNotFoundError as e:
        logger.error(f"OCR could not run: {e!r} (executable={sys.executable!r})")
        raise Exception(f"OCR tool could not be started on this machine: {e}")
    except subprocess.TimeoutExpired:
        logger.error("OCR timed out after %s seconds", SUBPROCESS_TIMEOUT)
        raise Exception(SUBPROCESS_TIMEOUT_MESSAGE)
    except subprocess.CalledProcessError as e:
        logger.error(f"OCR command failed (code {e.returncode}): {e.stderr}")
        raise Exception(f"OCR processing failed: {e.stderr or e.stdout}")
    except Exception as e:
        logger.error(f"OCR task failed: {e}")
        raise e
    finally:
        cleanup_paths(file_path, output_path)
