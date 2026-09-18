"""Shared path validation (SPEC §5.2–5.3). Pure: no I/O, no FastAPI.

Used by GET /api/path (Phase 1) and, later, GET /share (Phase 2). No route may
validate a path on its own.
"""
from __future__ import annotations

import unicodedata
from collections.abc import Mapping, Sequence

MIN_NODES = 2
MAX_NODES = 10
MAX_NAME_LENGTH = 255


def validate_path(names: Sequence[str], edges: Mapping[str, frozenset[str]]) -> list[str] | None:
    """Return the NFC-normalised names if they form a valid path, else ``None``.

    Valid iff: 2..10 names, each at most 255 characters, each an exact graph key
    after NFC (no resolver, no alias), and every consecutive pair is a directed edge.
    """
    if not MIN_NODES <= len(names) <= MAX_NODES:
        return None
    normalized = [unicodedata.normalize("NFC", n) for n in names]
    if any(len(n) > MAX_NAME_LENGTH for n in normalized):
        return None
    if any(n not in edges for n in normalized):
        return None
    if any(b not in edges[a] for a, b in zip(normalized, normalized[1:])):
        return None
    return normalized
