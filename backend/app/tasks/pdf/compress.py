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
import shutil
import subprocess
import uuid


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



def _resolve_ghostscript_binary() -> str:
    """Resolve the Ghostscript binary robustly across platforms.

    On Windows the binary is ``gswin64c.exe``/``gswin32c.exe``, not ``gs``,
    so probe ``shutil.which`` first then fall back to well-known install
    locations (mirrors the LibreOffice probing in ``docx_to_pdf_task``).
    """
    for name in ("gswin64c", "gswin32c", "gs"):
        found = shutil.which(name)
        if found:
            return found
    candidates = [
        r"D:/gs10.05.1/bin/gswin64c.exe",
        r"D:\gs10.05.1\bin\gswin64c.exe",
        r"C:\Program Files\gs\gs10.05.1\bin\gswin64c.exe",
        r"C:\Program Files (x86)\gs\gs10.05.1\bin\gswin32c.exe",
        r"C:\Program Files\gs\bin\gswin64c.exe",
        r"C:\Program Files (x86)\gs\bin\gswin32c.exe",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    raise Exception(
        "Ghostscript is not installed or not on PATH. "
        "Install Ghostscript (gswin64c/gswin32c on Windows, gs elsewhere) "
        "and ensure it is reachable via PATH."
    )

def compress_pdf_task(file_path: str, quality: str, original_filename: str = None) -> tuple[bytes, str]:
    """Run Ghostscript compression and return the compressed PDF bytes."""
    logger.info(f"Starting compression task for {file_path} with quality {quality}")

    file_path = resolve_path(file_path)

    if not os.path.exists(file_path):
        logger.error(f"Input file not found: {file_path}")
        raise FileNotFoundError(f"Input file not found: {file_path}")

    quality_presets = {
        "low": "/printer",
        "medium": "/ebook",
        "high": "/screen",
    }
    preset = quality_presets.get(quality.lower(), "/ebook")

    output_dir = os.path.dirname(file_path)
    output_filename = f"compressed_{uuid.uuid4()}.pdf"
    output_path = os.path.join(output_dir, output_filename)

    gs_cmd = [
        _resolve_ghostscript_binary(),
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        f"-dPDFSETTINGS={preset}",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
    ]

    if quality.lower() == "medium":
        gs_cmd.extend(
            [
                "-dDownsampleColorImages=true",
                "-dColorImageDownsampleType=/Bicubic",
                "-dColorImageResolution=150",
                "-dDownsampleGrayImages=true",
                "-dGrayImageDownsampleType=/Bicubic",
                "-dGrayImageResolution=150",
                "-dDownsampleMonoImages=true",
                "-dMonoImageDownsampleType=/Bicubic",
                "-dMonoImageResolution=150",
                "-dColorImageFilter=/DCTEncode",
                "-dGrayImageFilter=/DCTEncode",
            ]
        )
    elif quality.lower() == "high":
        gs_cmd.extend(
            [
                "-dDownsampleColorImages=true",
                "-dColorImageDownsampleType=/Bicubic",
                "-dColorImageResolution=60",
                "-dDownsampleGrayImages=true",
                "-dGrayImageDownsampleType=/Bicubic",
                "-dGrayImageResolution=60",
                "-dDownsampleMonoImages=true",
                "-dMonoImageDownsampleType=/Bicubic",
                "-dMonoImageResolution=100",
                "-dColorImageFilter=/DCTEncode",
                "-dGrayImageFilter=/DCTEncode",
            ]
        )

    gs_cmd.extend([f"-sOutputFile={output_path}", file_path])

    try:
        logger.info(f"Running command: {' '.join(gs_cmd)}")
        run_tool(gs_cmd, timeout=SUBPROCESS_TIMEOUT)

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Ghostscript executed but output file was not created or is empty.")

        data = read_bytes(output_path)
        download_name = _download_name(
            original_filename, output_filename, lambda base, ext: f"{base}_compressed{ext}"
        )
        logger.info("PDF compression completed successfully.")
        return data, download_name

    except subprocess.TimeoutExpired:
        logger.error("Ghostscript timed out after %s seconds", SUBPROCESS_TIMEOUT)
        raise Exception(SUBPROCESS_TIMEOUT_MESSAGE)
    except subprocess.CalledProcessError as e:
        logger.error(f"Ghostscript failed (exit code {e.returncode}): {e.stderr}")
        raise Exception(f"Ghostscript compression failed: {e.stderr}")
    except FileNotFoundError as e:
        logger.error(f"Ghostscript binary not found: {e}")
        raise Exception(
            "Ghostscript is not installed or not on PATH. "
            "Install Ghostscript (gswin64c/gswin32c on Windows, gs elsewhere) "
            "and ensure it is reachable via PATH."
        )
    except Exception as e:
        logger.error(f"Task failed: {str(e)}")
        raise e
    finally:
        for path in (file_path, output_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"Cleaned up local file: {path}")
                except Exception as cleanup_err:
                    logger.warning(f"Failed to remove {path}: {cleanup_err}")
