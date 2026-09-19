"""Static files of ``DIST_DIR`` and the SPA fallback (SPEC §3.4, Q-18; Phase 4, SPA-01..SPA-05).

Registered only when ``enable_share=True`` (SPEC §0.3, Q-5, Q-10), and only AFTER the ``/api/*`` and
``/share`` routes, so that it can never shadow them. Behavior:

- a file that exists in ``DIST_DIR`` is served with its own content at the matching path;
- any other ``GET`` outside ``/api/`` returns ``index.html`` verbatim (200 ``text/html``): the
  ``<!--OG-->`` placeholder is left alone, only ``/share`` substitutes it (SPEC §5.4);
- a path under ``/api/`` that no route matched is a 404 with FastAPI's default JSON body, never
  ``index.html``.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse


def register_spa(app: FastAPI, dist_dir: Path | str) -> None:
    root = Path(dist_dir).resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404)  # same body as FastAPI's own 404: {"detail": "Not Found"}
        try:
            candidate = (root / path).resolve()
            if candidate.is_file() and candidate.is_relative_to(root):  # never a file outside DIST_DIR
                return FileResponse(candidate)
        except (OSError, ValueError):  # a path the filesystem refuses (NUL, reserved names, ...)
            pass
        return FileResponse(index, media_type="text/html")
