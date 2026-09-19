"""Application factory.

Phase 1: data loading + /api routes.
Phase 2: GET /share, registered together with its dist/index.html placeholder check.
Static mount of dist/ and the SPA catch-all (SPEC §3.4) belong to Phase 4.

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


def create_app(data_dir: Path | str | None = None, dist_dir: Path | str | None = None) -> FastAPI:
    """Load and validate data at startup; fail fast on any violation (SPEC §6.5).

    /share is registered when <DIST_DIR>/index.html exists; the placeholder check
    then runs and fails fast if it is missing (SPEC §5.5, §6.5). With no dist build
    present the app still starts and serves the Phase 1 API (SPEC §0.3).
    """
    directory = Path(data_dir if data_dir is not None else os.environ.get("DATA_DIR", "./data"))
    dist = Path(dist_dir if dist_dir is not None else os.environ.get("DIST_DIR", "./dist"))

    app = FastAPI(title="Six Degrees of Wikipedia")
    app.state.data = load_data(directory)
    app.include_router(api_router)

    if (dist / "index.html").exists():
        app.state.index_template = load_index_template(dist)
        app.include_router(share_router)
    return app
