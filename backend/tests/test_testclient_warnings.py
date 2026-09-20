"""SPEC §9, N-1 — importing ``fastapi.testclient`` and instantiating ``TestClient`` must not emit
any warning.

Root cause (confirmed by reading the installed packages' source, 2026-09-20):

1. ``starlette.testclient`` (starlette 1.6.0, the latest release) prefers the ``httpx2`` package
   over ``httpx`` for its transport; when only ``httpx`` is installed it falls back and emits
   ``StarletteDeprecationWarning("Using httpx with starlette.testclient is deprecated; install
   httpx2 instead.")``. Fix: install ``httpx2`` (a separate PyPI package, declared by starlette
   itself as ``httpx2>=2.0.0; extra == 'full'``) alongside ``httpx`` (still required by
   ``fetcher.py`` and its tests, which import ``httpx`` directly and never touch ``httpx2``).

2. Independently, ``starlette.testclient`` does ``import anyio.abc`` and then evaluates
   ``anyio.abc.BlockingPortal`` at module import time (``_PortalFactoryType = Callable[[],
   AbstractContextManager[anyio.abc.BlockingPortal]]`` is a plain assignment, not a string
   annotation, so it runs even under ``from __future__ import annotations``). anyio 4.15.0
   introduced a lazy-import layer (``anyio/_lazyimport.py``) that turns ``anyio.abc.BlockingPortal``
   into a deprecated alias for ``anyio.from_thread.BlockingPortal`` and warns on access; anyio
   4.14.2 (the release immediately before) still re-exports ``BlockingPortal`` as a plain name
   with no warning. starlette 1.6.0 is already the latest release and has not been updated for
   this, so the only fix available today is pinning ``anyio==4.14.2`` (still satisfies
   starlette's ``anyio<5,>=3.6.2`` and httpx2's ``anyio>=4.10``).

Both fixes are dependency-version changes only (SPEC.md `backend/pyproject.toml`); no application
code changed. No SPEC test ID: N-1 is test/dependency infrastructure, not an application contract
(same footing as ``test_startup_logging.py`` and ``test_network_guard.py``).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from conftest import VALID_DIR

BACKEND = Path(__file__).resolve().parents[1]

# Runs in a fresh process so nothing else has already imported (and warned once, non-repeatably)
# `fastapi.testclient` first. `-W error` turns any warning into an exception, so a clean exit
# with the printed marker is the only way this script can succeed.
IMPORT_AND_BUILD_TESTCLIENT = (
    "import warnings\n"
    "warnings.simplefilter('error')\n"
    "import sys\n"
    "from pathlib import Path\n"
    "from fastapi.testclient import TestClient\n"
    "from app.main import create_app\n"
    "TestClient(create_app(Path(sys.argv[1]), enable_share=False))\n"
    "print('NO_WARNINGS_RAISED')\n"
)


def _run_in_a_fresh_process() -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONPATH": str(BACKEND), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8"}
    return subprocess.run(
        [sys.executable, "-c", IMPORT_AND_BUILD_TESTCLIENT, str(VALID_DIR)],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )


def test_importing_testclient_and_building_one_raises_no_warning():
    # Runs in a fresh process (see module docstring) because every other test file in this suite
    # also imports fastapi.testclient, and warnings dedupe per (message, category, location): a
    # second import in the same process would silently not re-raise even on unfixed dependencies.
    done = _run_in_a_fresh_process()
    assert done.returncode == 0, done.stdout + done.stderr
    assert "NO_WARNINGS_RAISED" in done.stdout
