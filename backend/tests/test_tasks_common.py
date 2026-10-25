"""Golden tests for task path helpers.

Pure path resolution, no mocks of the units under test,
no network, no Redis.
"""

import os

from app.tasks.common import BACKEND_ROOT, resolve_path, resolve_paths


def test_resolve_path_relative_stays_under_backend_root():
    resolved = resolve_path("tmp/foo.pdf")
    assert resolved == os.path.abspath(os.path.join(BACKEND_ROOT, "tmp/foo.pdf"))
    assert resolved.startswith(os.path.abspath(BACKEND_ROOT))


def test_resolve_path_normalizes_backslashes():
    assert resolve_path("tmp\\foo.pdf") == resolve_path("tmp/foo.pdf")


def test_resolve_path_absolute_returned_without_rebasing():
    absolute = os.path.abspath(os.path.join(BACKEND_ROOT, "tmp", "bar.pdf"))
    assert resolve_path(absolute) == absolute.replace("\\", "/")


def test_resolve_paths_handles_mixed_relative_and_absolute():
    absolute = os.path.abspath(os.path.join(BACKEND_ROOT, "static", "baz.pdf"))
    assert resolve_paths(["tmp/a.pdf", absolute]) == [
        resolve_path("tmp/a.pdf"),
        resolve_path(absolute),
    ]
