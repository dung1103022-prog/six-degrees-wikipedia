"""SPEC §3.7, §5.2–5.3 / §7.6A — validate_path and GET /api/path (Phase 1: PTH-01..10)."""
from __future__ import annotations

import unicodedata
from urllib.parse import urlencode

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.paths import validate_path
from conftest import VALID_DIR
from helpers import load_fixture_graph

GRAPH = load_fixture_graph()
EDGES = {k: frozenset(v) for k, v in GRAPH.items()}
INVALID = {"valid": False, "path": []}


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(VALID_DIR, enable_share=False))


def get_path(client, names):
    # Same encoding as the frontend (URLSearchParams / application/x-www-form-urlencoded).
    query = urlencode([("p", n) for n in names])
    return client.get(f"/api/path?{query}" if query else "/api/path")


@pytest.mark.spec("PTH-01")
def test_valid_path(client):
    assert validate_path(["A", "E", "D"], EDGES) == ["A", "E", "D"]
    r = get_path(client, ["A", "E", "D"])
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert [p["name"] for p in body["path"]] == ["A", "E", "D"]
    assert set(body["path"][0]) == {"name", "thumbnail", "wiki_url", "description"}


@pytest.mark.spec("PTH-02")
def test_missing_edge(client):
    assert validate_path(["D", "A"], EDGES) is None
    r = get_path(client, ["D", "A"])
    assert (r.status_code, r.json()) == (200, INVALID)


@pytest.mark.spec("PTH-03")
def test_unknown_name(client):
    assert validate_path(["A", "Ghost"], EDGES) is None
    r = get_path(client, ["A", "Ghost"])
    assert (r.status_code, r.json()) == (200, INVALID)


@pytest.mark.spec("PTH-04")
@pytest.mark.parametrize(
    "names",
    [
        ["安倍晋三", "Earth, Wind & Fire"],     # ja_title alias; edge exists for canonical
        ["Abe Shinzo", "Earth, Wind & Fire"],   # en_redirect alias
        ["Shinzo_Abe", "Earth, Wind & Fire"],   # underscore
    ],
)
def test_alias_or_underscore_is_not_resolved(client, names):
    assert "Earth, Wind & Fire" in EDGES["Shinzo Abe"]  # fixture sanity
    assert validate_path(names, EDGES) is None
    r = get_path(client, names)
    assert (r.status_code, r.json()) == (200, INVALID)


@pytest.mark.spec("PTH-05")
def test_single_element(client):
    assert validate_path(["A"], EDGES) is None
    assert get_path(client, ["A"]).json() == INVALID


@pytest.mark.spec("PTH-06")
def test_eleven_elements(client):
    chain = ["Shinzo Abe", "Earth, Wind & Fire", "Florence + the Machine", "Prince (musician)",
             "Who? (band)", "AC/DC", "Beyoncé", "Nguyễn Du"]
    ten = ["A", "B", "C", "A", "B", "C", "A", "B", "C", "A"]  # edges A->B->C->A all exist
    assert validate_path(ten, EDGES) == ten                     # 10 is allowed
    eleven = ten + ["B"]
    assert validate_path(eleven, EDGES) is None
    r = get_path(client, eleven)
    assert (r.status_code, r.json()) == (200, INVALID)
    assert validate_path(chain, EDGES) == chain


@pytest.mark.spec("PTH-07")
def test_element_too_long(client):
    long_name = "x" * 256
    assert validate_path(["A", long_name], EDGES) is None
    r = get_path(client, ["A", long_name])
    assert (r.status_code, r.json()) == (200, INVALID)


@pytest.mark.spec("PTH-08")
def test_no_p(client):
    assert validate_path([], EDGES) is None
    r = client.get("/api/path")
    assert (r.status_code, r.json()) == (200, INVALID)


@pytest.mark.spec("PTH-09")
def test_nfd_input_is_normalized(client):
    nfd = unicodedata.normalize("NFD", "Nguyễn Du")
    assert nfd != "Nguyễn Du"
    assert validate_path(["Beyoncé", nfd], EDGES) == ["Beyoncé", "Nguyễn Du"]
    r = get_path(client, ["Beyoncé", nfd])
    assert r.json()["valid"] is True
    assert r.json()["path"][1]["name"] == "Nguyễn Du"


@pytest.mark.spec("PTH-10")
def test_special_characters_round_trip(client):
    names = ["Earth, Wind & Fire", "Florence + the Machine", "Prince (musician)", "Who? (band)",
             "AC/DC", "Beyoncé", "Nguyễn Du"]
    r = get_path(client, names)
    assert r.json()["valid"] is True
    assert [p["name"] for p in r.json()["path"]] == names
