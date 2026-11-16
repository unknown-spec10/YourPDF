"""Tests for the external-tool runner.

The point of `run_tool` over `subprocess.run` is that a timeout kills the whole tree, because
Ghostscript, LibreOffice and Tesseract all spawn grandchildren and at concurrency 1 one orphan
owns the instance's only vCPU. These tests cover the contract; the tree kill itself is verified
by the timeout case returning instead of hanging.
"""

from __future__ import annotations

import subprocess
import sys

import pytest

from app.tasks.common import run_tool


def test_captures_output_and_returns_zero():
    result = run_tool([sys.executable, "-c", "print('hello')"], timeout=30)

    assert result.returncode == 0
    assert "hello" in result.stdout


def test_nonzero_raises_when_checking():
    with pytest.raises(subprocess.CalledProcessError) as excinfo:
        run_tool([sys.executable, "-c", "raise SystemExit(3)"], timeout=30)

    assert excinfo.value.returncode == 3


def test_nonzero_is_returned_without_check():
    result = run_tool([sys.executable, "-c", "raise SystemExit(4)"], timeout=30, check=False)

    assert result.returncode == 4


def test_timeout_raises_instead_of_hanging():
    """A tool that ignores its deadline is killed and reported, not waited on."""
    with pytest.raises(subprocess.TimeoutExpired):
        run_tool([sys.executable, "-c", "import time; time.sleep(60)"], timeout=2)
