"""Single answer to "where do uploads and outputs live?".

That question used to have four answers — ``uploads.py``, ``tasks/common.py``, ``main.py`` and
``web/serve.py`` each resolved ``YOURPDF_TMP`` themselves, and one of them resolved the cleanup
path against the *backend root* instead, so a failed multi-file upload leaked files whenever a
custom tmp dir was configured (which is always, in the container).
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def tmp_root() -> str:
    """Directory for uploads and outputs: ``YOURPDF_TMP`` when set, else ``backend/tmp``."""
    return os.environ.get("YOURPDF_TMP") or str(BACKEND_ROOT / "tmp")


def ensure_tmp_dir() -> str:
    root = tmp_root()
    os.makedirs(root, exist_ok=True)
    return root
