"""Synchronous PDF processing functions (in-request, no queue).

Each function takes an absolute (or backend-relative) input path, runs the
same conversion logic the old queued tasks used to run, and returns
``(output_bytes, download_filename)``. Callers stream the bytes straight
back as a ``Response``. ``extract_text`` is the exception: with
``export_txt=False`` it returns ``(text, None)`` and the router replies
with JSON.
"""

import json
import logging

from app.errors import DomainError, InvalidRequest


logger = logging.getLogger(__name__)

from app.limits import validate_render_budget  # noqa: E402  (kept beside the tasks it guards)



def _parse_merge_plan(plan, num_files: int) -> list | None:
    """Parse the optional merge ``plan`` into a list of {file, pages} blocks.

    ``plan`` is the raw JSON string from the ``plan`` form field (or an
    already-decoded list, accepted for direct unit use). Returns ``None``
    when the plan is missing/empty so callers keep the legacy append-all
    behavior. Raises ``InvalidRequest`` 400 on any shape/index error.
    """
    if plan is None:
        return None
    if isinstance(plan, str):
        if not plan.strip():
            return None
        try:
            parsed = json.loads(plan)
        except Exception:
            raise InvalidRequest(
                status_code=400,
                detail="Invalid merge plan: must be a JSON array string, "
                'e.g. \'[{"file": 0, "pages": "1-2"}]\'.',
            )
    else:
        parsed = plan
    if parsed is None:
        return None
    if isinstance(parsed, list) and len(parsed) == 0:
        return None
    if not isinstance(parsed, list):
        raise InvalidRequest(
            status_code=400,
            detail="Invalid merge plan: must be a JSON array of {file, pages} blocks.",
        )
    for i, block in enumerate(parsed):
        if not isinstance(block, dict):
            raise InvalidRequest(
                status_code=400,
                detail=f"Invalid merge plan block at index {i}: "
                "each block must be an object with 'file' and 'pages'.",
            )
        if "file" not in block or "pages" not in block:
            raise InvalidRequest(
                status_code=400,
                detail=f"Invalid merge plan block at index {i}: "
                "each block must contain 'file' and 'pages'.",
            )
        f = block["file"]
        if isinstance(f, bool) or not isinstance(f, int):
            raise InvalidRequest(
                status_code=400,
                detail=f"Invalid file index at plan block {i}: "
                "'file' must be a zero-based integer index.",
            )
        if f < 0 or f >= num_files:
            raise InvalidRequest(
                status_code=400,
                detail=f"Invalid file index {f} at plan block {i}: "
                f"only {num_files} files uploaded (valid range 0-{num_files - 1}).",
            )
        p = block["pages"]
        if not isinstance(p, str):
            raise InvalidRequest(
                status_code=400,
                detail=f"Invalid pages specification at plan block {i} for file index {f}: "
                "must be a string like '1-3, 5' or 'all'.",
            )
        if not p.strip():
            raise InvalidRequest(
                status_code=400,
                detail=f"Invalid pages specification at plan block {i} for file index {f}: "
                "pages string must not be empty.",
            )
    return parsed

def _parse_merge_pages_spec(pages_spec: str, total_pages: int, file_index: int) -> list[int]:
    """Parse a 1-based pages string into zero-based page indices.

    Supports ``all``, comma-separated numbers, closed ranges (``1-3``) and
    open-ended ranges (``3-`` means 3 to end). Raises ``InvalidRequest`` 400
    for unparsable input or page numbers beyond ``total_pages``.
    """
    if not isinstance(pages_spec, str):
        raise InvalidRequest(
            status_code=400,
            detail=f"Invalid pages specification for file index {file_index}: "
            "must be a string like '1-3, 5' or 'all'.",
        )
    s = pages_spec.strip()
    if not s:
        raise InvalidRequest(
            status_code=400,
            detail=f"Invalid pages specification for file index {file_index}: "
            "pages string must not be empty.",
        )
    if s.lower() == "all":
        return list(range(total_pages))
    pages: list[int] = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            if part.count("-") != 1:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            start_str, end_str = part.split("-", 1)
            start_str = start_str.strip()
            end_str = end_str.strip()
            if not start_str and not end_str:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            try:
                start = 1 if not start_str else int(start_str)
                end = total_pages if not end_str else int(end_str)
            except ValueError:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if start < 1 or end < 1:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: page numbers must be >= 1.",
                )
            if start > end:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: start page {start} exceeds end page {end} in range '{part}'.",
                )
            for p in range(start, end + 1):
                if p < 1 or p > total_pages:
                    raise InvalidRequest(
                        status_code=400,
                        detail=f"Page {p} out of range for file index {file_index}: "
                        f"file has {total_pages} pages.",
                    )
                pages.append(p - 1)
        else:
            try:
                p = int(part)
            except ValueError:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: could not parse '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if p < 1:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages_spec}' for file index "
                    f"{file_index}: page numbers must be >= 1.",
                )
            if p > total_pages:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Page {p} out of range for file index {file_index}: "
                    f"file has {total_pages} pages.",
                )
            pages.append(p - 1)
    if not pages:
        raise InvalidRequest(
            status_code=400,
            detail=f"Invalid pages specification '{pages_spec}' for file index "
            f"{file_index}: no pages selected. "
            "Expected formats like '1-3', '5', '3-' or 'all'.",
        )
    return pages

def _parse_watermark_pages(pages: str, total_pages: int) -> list[int]:
    """Parse a 1-based pages string into zero-based page indices.

    Supports ``all`` (case-insensitive), comma-separated numbers, closed
    ranges (``1-3``) and open-ended ranges (``3-`` means 3 to end).
    Raises ``InvalidRequest`` 400 for unparsable input, empty selection,
    or page numbers beyond ``total_pages``.
    """
    if not isinstance(pages, str):
        raise InvalidRequest(
            status_code=400,
            detail="Invalid pages specification: must be a string like '1-3, 5' or 'all'.",
        )
    s = pages.strip()
    if not s:
        raise InvalidRequest(
            status_code=400,
            detail="Invalid pages specification: no pages selected. "
            "Expected formats like '1-3', '5', '3-' or 'all'.",
        )
    if s.lower() == "all":
        return list(range(total_pages))
    result: list[int] = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            if part.count("-") != 1:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            start_str, end_str = part.split("-", 1)
            start_str = start_str.strip()
            end_str = end_str.strip()
            if not start_str and not end_str:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            try:
                start = 1 if not start_str else int(start_str)
                end = total_pages if not end_str else int(end_str)
            except ValueError:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse range '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if start < 1 or end < 1:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': page numbers must be >= 1.",
                )
            if start > end:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': start page {start} exceeds "
                    f"end page {end} in range '{part}'.",
                )
            for p in range(start, end + 1):
                if p < 1 or p > total_pages:
                    raise InvalidRequest(
                        status_code=400,
                        detail=f"Page {p} out of range: file has {total_pages} pages.",
                    )
                result.append(p - 1)
        else:
            try:
                p = int(part)
            except ValueError:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': could not parse '{part}'. "
                    "Expected formats like '1-3', '5', '3-' or 'all'.",
                )
            if p < 1:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Invalid pages specification '{pages}': page numbers must be >= 1.",
                )
            if p > total_pages:
                raise InvalidRequest(
                    status_code=400,
                    detail=f"Page {p} out of range: file has {total_pages} pages.",
                )
            result.append(p - 1)
    if not result:
        raise InvalidRequest(
            status_code=400,
            detail=f"Invalid pages specification '{pages}': no pages selected. "
            "Expected formats like '1-3', '5', '3-' or 'all'.",
        )
    return result
