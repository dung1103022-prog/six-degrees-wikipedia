"""SPEC §6.5 / §7.7 — startup data validation (Phase 1 part)."""
from __future__ import annotations

import json
import logging
import shutil
import unicodedata
from pathlib import Path

import pytest

from app.data import DataValidationError, load_data
from conftest import VALID_DIR


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    target = tmp_path / "data"
    shutil.copytree(VALID_DIR, target)
    return target


def read(d: Path, name: str):
    return json.loads((d / name).read_text(encoding="utf-8"))


def write(d: Path, name: str, obj) -> None:
    (d / name).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def expect_fail(d: Path, needle: str) -> None:
    with pytest.raises(DataValidationError) as exc:
        load_data(d)
    assert needle in str(exc.value)


@pytest.mark.spec("DAT-01")
def test_edge_to_unknown_node(data_dir):
    g = read(data_dir, "graph.json")
    g["A"] = sorted(g["A"] + ["Ghost"])
    write(data_dir, "graph.json", g)
    expect_fail(data_dir, "G-2")


@pytest.mark.spec("DAT-02")
def test_self_loop(data_dir):
    g = read(data_dir, "graph.json")
    g["F"] = ["F"]
    write(data_dir, "graph.json", g)
    expect_fail(data_dir, "G-3")


@pytest.mark.spec("DAT-03")
def test_duplicate_in_adjacency(data_dir):
    g = read(data_dir, "graph.json")
    g["A"] = ["B", "B", "E"]
    write(data_dir, "graph.json", g)
    expect_fail(data_dir, "G-4")


@pytest.mark.spec("DAT-04")
def test_unsorted_adjacency(data_dir):
    g = read(data_dir, "graph.json")
    g["A"] = ["E", "B"]
    write(data_dir, "graph.json", g)
    expect_fail(data_dir, "G-5")


@pytest.mark.spec("DAT-05")
@pytest.mark.parametrize("mutation", ["extra", "missing"])
def test_people_keys_differ_from_graph(data_dir, mutation):
    p = read(data_dir, "people.json")
    if mutation == "extra":
        p["Ghost"] = {"thumbnail": None, "wiki_url": "https://en.wikipedia.org/wiki/Ghost", "description": None}
    else:
        del p["F"]
    write(data_dir, "people.json", p)
    expect_fail(data_dir, "P-1")


@pytest.mark.spec("DAT-06")
@pytest.mark.parametrize("where", ["graph_key", "alias"])
def test_non_nfc_name(data_dir, where):
    nfd = unicodedata.normalize("NFD", "Nguyễn Du")
    assert nfd != "Nguyễn Du"
    if where == "graph_key":
        g = read(data_dir, "graph.json")
        g[nfd] = g.pop("Nguyễn Du")
        g["Beyoncé"] = [nfd]
        write(data_dir, "graph.json", g)
        p = read(data_dir, "people.json")
        p[nfd] = p.pop("Nguyễn Du")
        write(data_dir, "people.json", p)
    else:
        a = read(data_dir, "aliases.json")
        a.append({"alias": unicodedata.normalize("NFD", "Nguyễn"), "target": "Nguyễn Du", "source": "en_redirect"})
        write(data_dir, "aliases.json", a)
    expect_fail(data_dir, "NFC")


@pytest.mark.spec("DAT-07")
@pytest.mark.parametrize("field", ["thumbnail", "description", "wiki_url"])
def test_empty_string_in_people(data_dir, field):
    p = read(data_dir, "people.json")
    p["A"][field] = ""
    write(data_dir, "people.json", p)
    expect_fail(data_dir, "P-2" if field == "wiki_url" else "P-3")


@pytest.mark.spec("DAT-09")
def test_valid_data_loads(data_dir):
    data = load_data(data_dir)
    assert set(data.graph) == set(read(data_dir, "graph.json"))
    assert data.people["B"].thumbnail is None
    assert "E" in data.edges["A"]


@pytest.mark.spec("DAT-11")
def test_alias_target_not_in_graph(data_dir):
    a = read(data_dir, "aliases.json")
    a.append({"alias": "Ghostly", "target": "Ghost", "source": "en_redirect"})
    write(data_dir, "aliases.json", a)
    expect_fail(data_dir, "A-1")


@pytest.mark.spec("DAT-12")
@pytest.mark.parametrize("alias", ["", "   ", "\u3000"])
def test_alias_empty_or_blank_match_key(data_dir, alias):
    a = read(data_dir, "aliases.json")
    a.append({"alias": alias, "target": "A", "source": "en_redirect"})
    write(data_dir, "aliases.json", a)
    expect_fail(data_dir, "A-2")


@pytest.mark.spec("DAT-13")
def test_alias_invalid_source(data_dir):
    a = read(data_dir, "aliases.json")
    a.append({"alias": "Some Alias", "target": "A", "source": "wikidata"})
    write(data_dir, "aliases.json", a)
    expect_fail(data_dir, "A-3")


@pytest.mark.spec("DAT-14")
def test_alias_exact_duplicate(data_dir):
    # Only the A-4 half of DAT-14. The A-5 half (alias == target) is C-8, not yet approved.
    a = read(data_dir, "aliases.json")
    a.append(dict(a[0]))
    write(data_dir, "aliases.json", a)
    expect_fail(data_dir, "A-4")


@pytest.mark.spec("DAT-16")
def test_conflicting_alias_loads_and_logs(data_dir, caplog):
    with caplog.at_level(logging.INFO, logger="app.data"):
        data = load_data(data_dir)
    assert data is not None
    text = caplog.text
    assert "ambiguous alias match keys: 1" in text
    assert "en_redirect" in text and "ja_title" in text and "ja_redirect" in text
