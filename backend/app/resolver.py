"""Name resolver (SPEC §4A). Pure: no I/O, no network, no FastAPI/Pydantic."""
from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal

AliasSource = Literal["en_redirect", "ja_title", "ja_redirect"]
ALIAS_SOURCES: frozenset[str] = frozenset({"en_redirect", "ja_title", "ja_redirect"})


@dataclass(frozen=True)
class AliasEntry:
    alias: str
    target: str
    source: str


@dataclass(frozen=True)
class ResolveResult:
    status: Literal["resolved", "ambiguous", "unresolved"]
    name: str | None
    candidates: list[str]


@dataclass(frozen=True)
class ResolverIndex:
    canonical: frozenset[str]
    canonical_by_key: Mapping[str, frozenset[str]]
    alias_targets_by_key: Mapping[str, frozenset[str]]


def match_key(s: str) -> str:
    """NFKC -> collapse any Unicode whitespace run to one ASCII space -> trim (SPEC §4A.2).

    No case folding, no whitespace removal, no '_' -> ' ' conversion.
    Used only for lookup; never changes identity.
    """
    return " ".join(unicodedata.normalize("NFKC", s).split())


def build_index(canonical_names: Iterable[str], aliases: Iterable[AliasEntry]) -> ResolverIndex:
    """Build the immutable lookup index. Stores *sets* of candidates per key (R-7)."""
    canonical = frozenset(canonical_names)
    by_key: dict[str, set[str]] = {}
    for name in canonical:
        by_key.setdefault(match_key(name), set()).add(name)
    alias_by_key: dict[str, set[str]] = {}
    for entry in aliases:
        alias_by_key.setdefault(match_key(entry.alias), set()).add(entry.target)
    return ResolverIndex(
        canonical=canonical,
        canonical_by_key=MappingProxyType({k: frozenset(v) for k, v in by_key.items()}),
        alias_targets_by_key=MappingProxyType({k: frozenset(v) for k, v in alias_by_key.items()}),
    )


_UNRESOLVED = ResolveResult(status="unresolved", name=None, candidates=[])


def _from_candidates(candidates: frozenset[str]) -> ResolveResult:
    if len(candidates) == 1:
        (name,) = candidates
        return ResolveResult(status="resolved", name=name, candidates=[])
    return ResolveResult(status="ambiguous", name=None, candidates=sorted(candidates))


def resolve(index: ResolverIndex, text: str) -> ResolveResult:
    """Resolve NFC input text to a canonical name (SPEC §4A.3)."""
    # 1. exact canonical
    if text in index.canonical:
        return ResolveResult(status="resolved", name=text, candidates=[])
    # 2. canonical via match key
    key = match_key(text)
    if key == "":
        return _UNRESOLVED
    canonical = index.canonical_by_key.get(key)
    if canonical:
        return _from_candidates(canonical)
    # 3. alias via match key
    targets = index.alias_targets_by_key.get(key)
    if targets:
        return _from_candidates(targets)
    # 5. unresolved
    return _UNRESOLVED
