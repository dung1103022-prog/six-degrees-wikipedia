"""Application factory.

Phase 1: data loading + /api routes.
Phase 2: GET /share, switched by the explicit ``enable_share`` parameter (SPEC §0.3, Q-5).
Phase 4: static files of dist/ and the SPA fallback (SPEC §3.4, Q-18), registered last and only
when ``enable_share=True``.

Run: DATA_DIR=./data DIST_DIR=./dist uvicorn app.main:create_app --factory
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI

from app.api import router as api_router
from app.data import load_data
from app.share import load_index_template
from app.share import router as share_router
from app.static import register_spa


def create_app(
    data_dir: Path | str | None = None,
    dist_dir: Path | str | None = None,
    enable_share: bool = True,
) -> FastAPI:
    """Load and validate data at startup; fail fast on any violation (SPEC §6.5).

    ``enable_share`` is an explicit switch (SPEC §0.3 "Chế độ chạy của app", Q-5); it is
    never inferred from whether ``<DIST_DIR>/index.html`` exists.

    - ``enable_share=True`` (default; Phase 2+ / production): ``<DIST_DIR>/index.html`` must
      exist and hold exactly one ``<!--OG-->`` inside ``<head>``; otherwise startup fails
      (SPEC §5.5, Q-8). ``/share`` is then registered.
    - ``enable_share=False`` (Phase 1 / test mode): ``dist/`` is not looked at and ``/share``
      is not registered.

    The static mount of ``dist/`` and the SPA catch-all (SPEC §3.4, Q-18) follow the same switch:
    they are registered only with ``enable_share=True``, after ``/api/*`` and ``/share``.
    """
    directory = Path(data_dir if data_dir is not None else os.environ.get("DATA_DIR", "./data"))

    app = FastAPI(title="Six Degrees of Wikipedia")
    app.state.data = load_data(directory)
    app.include_router(api_router)

    if enable_share:
        dist = Path(dist_dir if dist_dir is not None else os.environ.get("DIST_DIR", "./dist"))
        app.state.index_template = load_index_template(dist)
        app.include_router(share_router)
        register_spa(app, dist)  # last: it must never shadow /api/* or /share (SPEC §3.4)
    return app
