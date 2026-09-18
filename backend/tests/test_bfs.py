"""SPEC §4 / §7.2 — BFS."""
from __future__ import annotations

import pytest

from app.graph import BfsResult, shortest_path
from helpers import brute_force_distance, load_fixture_graph, reachable

GRAPH = load_fixture_graph()


def assert_common_invariants(graph, start, result: BfsResult) -> None:
    levels = result.levels
    assert levels[0] == [start]  # I-1
    flat = [n for level in levels for n in level]
    assert len(flat) == len(set(flat))  # I-2
    assert all(levels)  # I-3
    for k in range(1, len(levels)):  # I-4
        prev = set(levels[k - 1])
        for node in levels[k]:
            assert any(node in graph[p] for p in prev), (k, node)


def assert_found_invariants(graph, start, target, result: BfsResult) -> None:
    path = result.path
    assert result.found
    assert path and path[0] == start and path[-1] == target  # F-1
    length = len(path) - 1  # F-2 (length is derived from the path at API level)
    for a, b in zip(path, path[1:]):  # F-3
        assert b in graph[a]
    assert len(path) == len(set(path))  # F-4
    assert all(path[i] in result.levels[i] for i in range(len(path)))  # F-5
    assert len(result.levels) == length + 1  # F-5
    assert result.levels[-1][-1] == target  # F-6
    assert length == brute_force_distance(graph, start, target)  # F-7


@pytest.mark.spec("BFS-01")
def test_a_to_d_shortest_via_e():
    r = shortest_path(GRAPH, "A", "D")
    assert r.path == ["A", "E", "D"]
    assert_common_invariants(GRAPH, "A", r)
    assert_found_invariants(GRAPH, "A", "D", r)


@pytest.mark.spec("BFS-02")
def test_start_equals_target():
    r = shortest_path(GRAPH, "A", "A")
    assert r == BfsResult(found=True, path=["A"], levels=[["A"]])  # S-1


@pytest.mark.spec("BFS-03")
def test_start_without_out_edges():
    r = shortest_path(GRAPH, "F", "A")
    assert r == BfsResult(found=False, path=[], levels=[["F"]])  # S-2, N-1
    assert "A" not in [n for lv in r.levels for n in lv]  # N-3


@pytest.mark.spec("BFS-04")
def test_other_component_not_found():
    r = shortest_path(GRAPH, "A", "X")
    assert not r.found and r.path == []  # N-1
    flat = [n for lv in r.levels for n in lv]
    assert set(flat) == reachable(GRAPH, "A")  # N-2
    assert "X" not in flat  # N-3
    assert_common_invariants(GRAPH, "A", r)


@pytest.mark.spec("BFS-05")
def test_directed_edges():
    assert shortest_path(GRAPH, "D", "F").found
    assert not shortest_path(GRAPH, "F", "D").found  # S-3


@pytest.mark.spec("BFS-06")
def test_cycle_terminates():
    # A -> B -> C -> A is a cycle; searching for an unreachable node must terminate.
    r = shortest_path(GRAPH, "B", "X")
    assert not r.found
    assert_common_invariants(GRAPH, "B", r)  # I-2


@pytest.mark.spec("BFS-07")
def test_deterministic():
    results = [shortest_path(GRAPH, "A", "D") for _ in range(5)]
    assert all(r == results[0] for r in results)  # I-6
    assert results[0].levels == [["A"], ["B", "E"], ["C", "D"]]


@pytest.mark.spec("BFS-08")
def test_early_termination_on_enqueue():
    # Expanding level 1 in order: B discovers C, then E discovers D (target) -> stop.
    r = shortest_path(GRAPH, "A", "D")
    assert r.levels[-1] == ["C", "D"]
    assert r.levels[-1][-1] == "D"  # F-6
    # F is at depth 3 from A and must never be discovered.
    assert "F" not in [n for lv in r.levels for n in lv]


@pytest.mark.spec("BFS-09")
def test_all_pairs_invariants():
    for start in GRAPH:
        for target in GRAPH:
            r = shortest_path(GRAPH, start, target)
            assert_common_invariants(GRAPH, start, r)
            expected = brute_force_distance(GRAPH, start, target)
            if r.found:
                assert_found_invariants(GRAPH, start, target, r)
            else:
                assert expected is None
                assert set(n for lv in r.levels for n in lv) == reachable(GRAPH, start)


@pytest.mark.spec("BFS-10")
@pytest.mark.parametrize("start,target", [("Nobody", "A"), ("A", "Nobody")])
def test_unknown_node_raises(start, target):
    with pytest.raises(ValueError):
        shortest_path(GRAPH, start, target)
