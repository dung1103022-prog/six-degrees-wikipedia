"""Data loading and startup validation (SPEC §6, §6.5).

Phase 1 scope: G-1..G-5, P-1..P-3, A-1..A-4, NFC.
Not implemented (decision status "Chưa duyệt" in SPEC §0.4): G-6, A-6 (C-7), A-5, A-7 (C-8).
The <!--OG--> placeholder check belongs to Phase 2 (SPEC §6.5).
"""
from __future__ import annotations

import json
import logging
import unicodedata
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType

from app.resolver import ALIAS_SOURCES, AliasEntry, ResolverIndex, build_index, match_key

logger = logging.getLogger(__name__)


class DataValidationError(Exception):
    """Raised when data files violate SPEC §6 invariants. The app must not start."""


@dataclass(frozen=True)
class Person:
    thumbnail: str | None
    wiki_url: str
    description: str | None


@dataclass(frozen=True)
class AppData:
    graph: Mapping[str, tuple[str, ...]]
    edges: Mapping[str, frozenset[str]]
    people: Mapping[str, Person]
    resolver: ResolverIndex


def _fail(rule: str, message: str) -> None:
    raise DataValidationError(f"[{rule}] {message}")


def _is_nfc(s: str) -> bool:
    return unicodedata.is_normalized("NFC", s)


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        _fail("FILE", f"missing data file: {path}")
    except json.JSONDecodeError as exc:
        _fail("FILE", f"invalid JSON in {path}: {exc}")


def _validate_graph(raw) -> dict[str, tuple[str, ...]]:
    if not isinstance(raw, dict):
        _fail("G", "graph.json must be a JSON object")
    graph: dict[str, tuple[str, ...]] = {}
    for name, adj in raw.items():
        if not isinstance(adj, list) or not all(isinstance(x, str) for x in adj):
            _fail("G", f"adjacency of {name!r} must be a list of strings")
        if not _is_nfc(name):
            _fail("NFC", f"graph key is not NFC: {name!r}")
        graph[name] = tuple(adj)
    for name, adj in graph.items():
        for target in adj:
            if target not in graph:
                _fail("G-2", f"{name!r} links to {target!r}, which is not a graph key")
        if name in adj:
            _fail("G-3", f"self-loop on {name!r}")
        if len(set(adj)) != len(adj):
            _fail("G-4", f"duplicate entries in adjacency of {name!r}")
        if list(adj) != sorted(adj):
            _fail("G-5", f"adjacency of {name!r} is not sorted")
    return graph


def _validate_people(raw, graph: Mapping[str, tuple[str, ...]]) -> dict[str, Person]:
    if not isinstance(raw, dict):
        _fail("P", "people.json must be a JSON object")
    if set(raw) != set(graph):
        extra = sorted(set(raw) - set(graph))
        missing = sorted(set(graph) - set(raw))
        _fail("P-1", f"people.json keys differ from graph.json keys (extra={extra}, missing={missing})")
    people: dict[str, Person] = {}
    for name, meta in raw.items():
        if not isinstance(meta, dict) or set(meta) != {"thumbnail", "wiki_url", "description"}:
            _fail("P", f"people entry {name!r} must have exactly thumbnail, wiki_url, description")
        wiki_url = meta["wiki_url"]
        if not isinstance(wiki_url, str) or wiki_url == "":
            _fail("P-2", f"wiki_url of {name!r} must be a non-empty string")
        for field in ("thumbnail", "description"):
            value = meta[field]
            if value is not None and (not isinstance(value, str) or value == ""):
                _fail("P-3", f"{field} of {name!r} must be a non-empty string or null")
        people[name] = Person(meta["thumbnail"], wiki_url, meta["description"])
    return people


def _validate_aliases(raw, graph: Mapping[str, tuple[str, ...]]) -> list[AliasEntry]:
    if not isinstance(raw, list):
        _fail("A", "aliases.json must be a JSON array")
    entries: list[AliasEntry] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or set(item) != {"alias", "target", "source"} or not all(
            isinstance(v, str) for v in item.values()
        ):
            _fail("A", f"aliases[{i}] must be an object with string alias, target, source")
        entry = AliasEntry(**item)
        if entry.target not in graph:
            _fail("A-1", f"aliases[{i}] target {entry.target!r} is not a graph key")
        if entry.alias == "" or match_key(entry.alias) == "":
            _fail("A-2", f"aliases[{i}] alias is empty or has an empty match key")
        if not _is_nfc(entry.alias):
            _fail("NFC", f"aliases[{i}] alias is not NFC: {entry.alias!r}")
        if entry.source not in ALIAS_SOURCES:
            _fail("A-3", f"aliases[{i}] has invalid source {entry.source!r}")
        entries.append(entry)
    duplicates = [e for e, n in Counter(entries).items() if n > 1]
    if duplicates:
        _fail("A-4", f"duplicate alias entries: {duplicates[:3]}")
    return entries


def load_data(data_dir: Path) -> AppData:
    """Load and validate graph.json, people.json, aliases.json; build the resolver index."""
    data_dir = Path(data_dir)
    graph = _validate_graph(_read_json(data_dir / "graph.json"))
    people = _validate_people(_read_json(data_dir / "people.json"), graph)
    aliases = _validate_aliases(_read_json(data_dir / "aliases.json"), graph)

    index = build_index(graph.keys(), aliases)

    per_source = Counter(e.source for e in aliases)
    logger.info("aliases per source: %s", {s: per_source.get(s, 0) for s in sorted(ALIAS_SOURCES)})
    logger.info(
        "ambiguous canonical match keys: %d",
        sum(1 for v in index.canonical_by_key.values() if len(v) > 1),
    )
    logger.info(
        "ambiguous alias match keys: %d",
        sum(1 for v in index.alias_targets_by_key.values() if len(v) > 1),
    )

    return AppData(
        graph=MappingProxyType(graph),
        edges=MappingProxyType({k: frozenset(v) for k, v in graph.items()}),
        people=MappingProxyType(people),
        resolver=index,
    )
