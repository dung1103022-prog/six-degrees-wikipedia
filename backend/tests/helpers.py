"""Shared helpers for tests (no production logic)."""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from conftest import VALID_DIR


def load_fixture_graph(directory: Path = VALID_DIR) -> dict[str, list[str]]:
    return json.loads((directory / "graph.json").read_text(encoding="utf-8"))


def load_fixture_aliases(directory: Path = VALID_DIR) -> list[dict]:
    return json.loads((directory / "aliases.json").read_text(encoding="utf-8"))


def brute_force_distance(graph: dict[str, list[str]], start: str, target: str) -> int | None:
    """Independent reference implementation (plain BFS distances, no early exit)."""
    dist = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        for nxt in graph[node]:
            if nxt not in dist:
                dist[nxt] = dist[node] + 1
                queue.append(nxt)
    return dist.get(target)


def reachable(graph: dict[str, list[str]], start: str) -> set[str]:
    seen = {start}
    queue = deque([start])
    while queue:
        for nxt in graph[queue.popleft()]:
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen
