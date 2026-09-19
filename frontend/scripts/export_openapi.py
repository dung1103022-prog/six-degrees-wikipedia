"""Write the backend's OpenAPI document to the path given as argv[1].

This is exactly what ``GET /openapi.json`` serves (FastAPI builds it with ``app.openapi()``), produced
without starting a server or touching the network. The dataset is the backend's test fixture: the
schema does not depend on the data. Used by ``npm run gen:types`` (SPEC §3.5).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from app.main import create_app  # noqa: E402

app = create_app(BACKEND / "tests" / "fixtures" / "valid", enable_share=False)
Path(sys.argv[1]).write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
