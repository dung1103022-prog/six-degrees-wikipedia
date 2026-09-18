"""BFS shortest path (SPEC §4). Pure: no I/O, no FastAPI/Pydantic."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class BfsResult:
    found: bool
    path: list[str]
    levels: list[list[str]]


def shortest_path(graph: Mapping[str, Sequence[str]], start: str, target: str) -> BfsResult:
    """Breadth-first search from ``start`` to ``target`` on a directed graph.

    levels[k] contains nodes discovered at BFS depth k.
    The final level may be incomplete because BFS terminates immediately
    when the target is discovered (goal test on enqueue, not on dequeue).

    Preconditions: ``start`` and ``target`` are keys of ``graph`` (canonical names
    that already went through the resolver). Raises ``ValueError`` otherwise.
    """
    if start not in graph:
        raise ValueError(f"start node not in graph: {start!r}")
    if target not in graph:
        raise ValueError(f"target node not in graph: {target!r}")

    if start == target:
        return BfsResult(found=True, path=[start], levels=[[start]])

    parent: dict[str, str] = {}
    discovered = {start}
    levels: list[list[str]] = [[start]]
    frontier = [start]

    while frontier:
        next_level: list[str] = []
        for node in frontier:
            for neighbor in graph[node]:
                if neighbor in discovered:
                    continue
                discovered.add(neighbor)
                parent[neighbor] = node
                next_level.append(neighbor)
                if neighbor == target:
                    levels.append(next_level)
                    return BfsResult(found=True, path=_rebuild(parent, start, target), levels=levels)
        if not next_level:
            break
        levels.append(next_level)
        frontier = next_level

    return BfsResult(found=False, path=[], levels=levels)


def _rebuild(parent: Mapping[str, str], start: str, target: str) -> list[str]:
    path = [target]
    while path[-1] != start:
        path.append(parent[path[-1]])
    path.reverse()
    return path
