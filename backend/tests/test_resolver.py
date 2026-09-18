"""SPEC §4A / §7.3 — name resolver."""
from __future__ import annotations

import random

import pytest

from app.resolver import AliasEntry, ResolveResult, build_index, match_key, resolve
from helpers import load_fixture_aliases, load_fixture_graph

GRAPH = load_fixture_graph()
ALIASES = [AliasEntry(**a) for a in load_fixture_aliases()]
INDEX = build_index(GRAPH.keys(), ALIASES)


def resolved(name: str) -> ResolveResult:
    return ResolveResult(status="resolved", name=name, candidates=[])


def ambiguous(*names: str) -> ResolveResult:
    return ResolveResult(status="ambiguous", name=None, candidates=sorted(names))


UNRESOLVED = ResolveResult(status="unresolved", name=None, candidates=[])

# Inputs exercised by RES-18/RES-20 (and reused by API-20).
ALL_INPUTS = sorted(
    set(GRAPH)
    | {a.alias for a in ALIASES}
    | {"安倍　晋三", "  Shinzo   Abe  ", "shinzo abe", "Shinzo_Abe", "   ", "Nobody", "X2 ",
       "阮 攸", "ﾋﾞﾖﾝｾ", " A "}
)


@pytest.mark.spec("RES-01")
def test_exact_canonical():
    assert resolve(INDEX, "Shinzo Abe") == resolved("Shinzo Abe")


@pytest.mark.spec("RES-02")
def test_en_redirect():
    assert resolve(INDEX, "Abe Shinzo") == resolved("Shinzo Abe")


@pytest.mark.spec("RES-03")
def test_ja_title():
    assert resolve(INDEX, "安倍晋三") == resolved("Shinzo Abe")


@pytest.mark.spec("RES-04")
def test_ja_redirect():
    assert resolve(INDEX, "安倍 晋三") == resolved("Shinzo Abe")


@pytest.mark.spec("RES-05")
def test_ideographic_space_matches_via_match_key():
    assert match_key("安倍\u3000晋三") == "安倍 晋三"
    assert resolve(INDEX, "安倍\u3000晋三") == resolved("Shinzo Abe")


@pytest.mark.spec("RES-06")
def test_whitespace_is_not_removed():
    # Only "阮攸" (no space) exists as an alias.
    assert resolve(INDEX, "阮攸") == resolved("Nguyễn Du")
    assert resolve(INDEX, "阮 攸") == UNRESOLVED


@pytest.mark.spec("RES-07")
def test_half_width_katakana_nfkc():
    assert resolve(INDEX, "ﾋﾞﾖﾝｾ") == resolved("Beyoncé")


@pytest.mark.spec("RES-08")
def test_canonical_via_match_key():
    assert resolve(INDEX, "  Shinzo   Abe  ") == resolved("Shinzo Abe")


@pytest.mark.spec("RES-09")
def test_no_case_folding():
    assert resolve(INDEX, "shinzo abe") == UNRESOLVED


@pytest.mark.spec("RES-10")
def test_underscore_differs_from_space():
    assert resolve(INDEX, "Shinzo_Abe") == UNRESOLVED


@pytest.mark.spec("RES-11")
def test_conflicting_alias_is_ambiguous():
    assert resolve(INDEX, "Mr. Ambiguous") == ambiguous("Person One", "Person Two")


@pytest.mark.spec("RES-12")
def test_same_target_from_two_sources_is_not_ambiguous():
    sources = {a.source for a in ALIASES if a.alias == "Shinzō Abe"}
    assert len(sources) == 2  # fixture sanity
    assert resolve(INDEX, "Shinzō Abe") == resolved("Shinzo Abe")


@pytest.mark.spec("RES-13")
def test_canonical_beats_alias():
    # Alias "A" points to B, but "A" is also a canonical name.
    assert resolve(INDEX, "A") == resolved("A")      # step 1
    assert resolve(INDEX, " A ") == resolved("A")    # step 2 (canonical via match key)


@pytest.mark.spec("RES-14")
@pytest.mark.parametrize("text", ["   ", "\u3000", "\t\n"])
def test_whitespace_only(text):
    assert resolve(INDEX, text) == UNRESOLVED


@pytest.mark.spec("RES-15")
def test_unknown_name():
    assert resolve(INDEX, "Nobody") == UNRESOLVED


@pytest.mark.spec("RES-16")
def test_results_only_contain_graph_names():
    for text in ALL_INPUTS:
        r = resolve(INDEX, text)
        names = ([r.name] if r.name else []) + r.candidates
        assert all(n in GRAPH for n in names), text


@pytest.mark.spec("RES-17")
def test_canonical_resolves_to_itself_even_if_nfkc_changes_it():
    assert match_key("X²") != "X²"  # fixture sanity: NFKC changes this name
    for name in GRAPH:
        assert resolve(INDEX, name) == resolved(name)


@pytest.mark.spec("RES-18")
def test_deterministic():
    first = [resolve(INDEX, t) for t in ALL_INPUTS]
    for _ in range(3):
        assert [resolve(INDEX, t) for t in ALL_INPUTS] == first


@pytest.mark.spec("RES-19")
def test_canonical_match_key_collision():
    assert resolve(INDEX, "X2 ") == ambiguous("X2", "X²")
    assert resolve(INDEX, "X2 ").candidates == ["X2", "X²"]
    assert resolve(INDEX, "X²") == resolved("X²")
    assert resolve(INDEX, "X2") == resolved("X2")


@pytest.mark.spec("RES-20")
@pytest.mark.parametrize("seed", range(5))
def test_independent_of_input_order(seed):
    rng = random.Random(seed)
    names = list(GRAPH)
    aliases = list(ALIASES)
    rng.shuffle(names)
    rng.shuffle(aliases)
    shuffled = build_index(names, aliases)
    for text in ALL_INPUTS:
        assert resolve(shuffled, text) == resolve(INDEX, text), text


@pytest.mark.spec("RES-21")
def test_canonical_ambiguity_stops_before_alias():
    assert any(a.alias == "X2" and a.target == "Third Person" for a in ALIASES)  # fixture sanity
    r = resolve(INDEX, "X2 ")
    assert r == ambiguous("X2", "X²")
    assert "Third Person" not in r.candidates
