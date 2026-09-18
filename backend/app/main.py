"""Application factory (Phase 1: API only; no /share, no static files).

Run: DATA_DIR=./data uvicorn app.main:create_app --factory
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI

from app.api import router
from app.data import load_data


def create_app(data_dir: Path | str | None = None) -> FastAPI:
    """Load and validate data at startup; fail fast on any violation (SPEC §6.5)."""
    directory = Path(data_dir if data_dir is not None else os.environ.get("DATA_DIR", "./data"))
    app = FastAPI(title="Six Degrees of Wikipedia")
    app.state.data = load_data(directory)
    app.include_router(router)
    return app
