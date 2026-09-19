"""SPEC §6.5 (last paragraph): after validating, the loader logs the number of aliases per source and the number
of ambiguous match keys. Those INFO lines must actually be VISIBLE when the app starts.

The loader already emits them (see test_data_loader.py, DAT-16, which reads them through caplog). What was lost is
their visibility: under uvicorn (and so in the container) nobody configures the "app" loggers, the root logger has
no handler and a level of WARNING, so every INFO line of ``app.data`` was dropped. These tests start the app in a
fresh Python process, where no logging is configured, exactly like a plain ``uvicorn app.main:create_app --factory``.

No SPEC test ID: the SPEC has none for the log lines, and this changes no contract (v2.15).
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

from app.main import create_app
from conftest import VALID_DIR

BACKEND = Path(__file__).resolve().parents[1]

START_TWICE = (
    "import sys\n"
    "from pathlib import Path\n"
    "from app.main import create_app\n"
    "create_app(Path(sys.argv[1]), enable_share=False)\n"
    "create_app(Path(sys.argv[1]), enable_share=False)\n"
)


def start_in_a_fresh_process() -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONPATH": str(BACKEND), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8"}
    return subprocess.run(
        [sys.executable, "-c", START_TWICE, str(VALID_DIR)],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )


def test_loader_info_lines_are_visible_when_the_app_starts_with_no_logging_configured():
    done = start_in_a_fresh_process()
    assert done.returncode == 0, done.stderr
    output = done.stdout + done.stderr

    assert "aliases per source:" in output
    for source in ("en_redirect", "ja_title", "ja_redirect"):
        assert source in output  # the per-source counts, not only the sentence
    assert "ambiguous canonical match keys:" in output
    assert "ambiguous alias match keys:" in output


def test_starting_the_app_again_does_not_repeat_the_lines_of_the_first_start():
    output = (lambda done: done.stdout + done.stderr)(start_in_a_fresh_process())
    # the process above builds the app twice: one line per start, not a growing number of copies
    assert output.count("aliases per source:") == 2
    assert output.count("ambiguous alias match keys:") == 2


def test_when_the_host_already_configured_logging_the_app_adds_no_handler_of_its_own():
    # pytest has put its capture handlers on the root logger: the app must leave logging alone then.
    assert logging.getLogger().handlers
    create_app(VALID_DIR, enable_share=False)
    assert logging.getLogger("app").handlers == []
