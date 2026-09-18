"""SPEC §3.1, §3.2, §3.6 / §7.5 — /api/people, /api/search, /api/resolve (Phase 1)."""
from __future__ import annotations

import socket
import unicodedata

import pytest
from fastapi.testclient import TestClient

from app.graph import shortest_path
from app.main import create_app
from conftest import VALID_DIR, NetworkBlockedError
from helpers import load_fixture_aliases, load_fixture_graph

GRAPH = load_fixture_graph()
ALIASES = load_fixture_aliases()


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(VALID_DIR))


def search(client, frm, to):
    return client.get("/api/search", params={"from": frm, "to": to})


@pytest.mark.spec("API-01")
def test_people(client):
    r = client.get("/api/people")
    assert r.status_code == 200
    assert r.json() == sorted(GRAPH)
    assert "安倍晋三" not in r.json() and "Abe Shinzo" not in r.json()


@pytest.mark.spec("API-02")
def test_search_found(client):
    body = search(client, "A", "D").json()
    assert body["found"] is True
    assert body["length"] == len(body["path"]) - 1 == 2
    bfs = shortest_path(GRAPH, "A", "D")
    assert [p["name"] for p in body["path"]] == bfs.path
    assert [lv["nodes"] for lv in body["levels"]] == bfs.levels
    assert [lv["level"] for lv in body["levels"]] == list(range(len(bfs.levels)))


@pytest.mark.spec("API-03")
def test_search_not_found(client):
    r = search(client, "A", "X")
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is False
    assert body["levels"]
    assert body["nodes_explored"] == sum(len(lv["nodes"]) for lv in body["levels"])


@pytest.mark.spec("API-04")
def test_search_same_node(client):
    body = search(client, "A", "A").json()
    assert body["found"] is True and body["length"] == 0
    assert [p["name"] for p in body["path"]] == ["A"]
    assert body["nodes_explored"] == 1


@pytest.mark.spec("API-05")
def test_from_unresolved(client):
    r = search(client, "Nobody", "A")
    assert r.status_code == 404
    assert r.json() == {"detail": {"code": "UNRESOLVED_NAME", "param": "from", "input": "Nobody", "candidates": []}}


@pytest.mark.spec("API-06")
def test_to_unresolved(client):
    r = search(client, "A", "Nobody")
    assert r.status_code == 404
    assert r.json()["detail"]["param"] == "to"
    assert r.json()["detail"]["input"] == "Nobody"


@pytest.mark.spec("API-07")
def test_both_unresolved_reports_from(client):
    r = search(client, "Nobody", "Nobody Else")
    assert r.status_code == 404
    assert r.json()["detail"]["param"] == "from"
    assert r.json()["detail"]["input"] == "Nobody"


@pytest.mark.spec("API-08")
@pytest.mark.parametrize(
    "params",
    [{"to": "A"}, {"from": "A"}, {"from": "", "to": "A"}, {"from": "A", "to": ""}],
)
def test_missing_or_empty_params(client, params):
    # The ">255 chars" part of API-08 depends on C-4 (not yet approved) and is not tested.
    assert client.get("/api/search", params=params).status_code == 422


@pytest.mark.spec("API-09")
def test_special_characters(client):
    body = search(client, "Earth, Wind & Fire", "Nguyễn Du").json()
    assert body["found"] is True
    assert body["from"] == "Earth, Wind & Fire" and body["to"] == "Nguyễn Du"
    assert [p["name"] for p in body["path"]] == [
        "Earth, Wind & Fire", "Florence + the Machine", "Prince (musician)",
        "Who? (band)", "AC/DC", "Beyoncé", "Nguyễn Du",
    ]


@pytest.mark.spec("API-10")
def test_nfd_input(client):
    nfd = unicodedata.normalize("NFD", "Nguyễn Du")
    assert nfd != "Nguyễn Du"
    body = search(client, "Beyoncé", nfd).json()
    assert body["found"] is True and body["to"] == "Nguyễn Du"


@pytest.mark.spec("API-11")
def test_null_fields_are_null(client):
    body = search(client, "A", "C").json()
    b = body["path"][1]
    assert b["name"] == "B"
    assert b["thumbnail"] is None and b["description"] is None


@pytest.mark.spec("API-12")
def test_underscore_is_unresolved(client):
    r = search(client, "Albert_Einstein", "A")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "UNRESOLVED_NAME"
    r = search(client, "Shinzo_Abe", "A")
    assert r.status_code == 404 and r.json()["detail"]["code"] == "UNRESOLVED_NAME"


@pytest.mark.spec("API-13")
def test_japanese_input(client):
    body = search(client, "安倍晋三", "Nguyễn Du").json()
    assert body["from"] == "Shinzo Abe"
    assert body["path"][0]["name"] == "Shinzo Abe"


@pytest.mark.spec("API-14")
def test_english_redirect_input(client):
    assert search(client, "Abe Shinzo", "Nguyễn Du").json()["from"] == "Shinzo Abe"


@pytest.mark.spec("API-15")
def test_two_aliases_same_person(client):
    body = search(client, "安倍晋三", "Abe Shinzo").json()
    assert body["found"] is True and body["length"] == 0
    assert body["from"] == body["to"] == "Shinzo Abe"


@pytest.mark.spec("API-16")
def test_ambiguous_alias(client):
    r = search(client, "Mr. Ambiguous", "A")
    assert r.status_code == 404
    d = r.json()["detail"]
    assert d["code"] == "AMBIGUOUS_NAME" and d["param"] == "from" and d["input"] == "Mr. Ambiguous"
    assert [c["name"] for c in d["candidates"]] == ["Person One", "Person Two"]
    for c in d["candidates"]:
        assert set(c) == {"name", "thumbnail", "wiki_url", "description"}
    assert d["candidates"][0]["thumbnail"] is None  # Person One fixture


@pytest.mark.spec("API-18")
def test_resolve_japanese(client):
    r = client.get("/api/resolve", params={"q": "安倍晋三"})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "安倍晋三"
    assert body["status"] == "resolved"
    assert body["person"]["name"] == "Shinzo Abe"
    assert body["candidates"] == []


@pytest.mark.spec("API-19")
def test_resolve_unresolved_and_ambiguous(client):
    r = client.get("/api/resolve", params={"q": "Nobody"})
    assert r.status_code == 200
    assert r.json() == {"query": "Nobody", "status": "unresolved", "person": None, "candidates": []}
    r = client.get("/api/resolve", params={"q": "Mr. Ambiguous"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ambiguous" and body["person"] is None
    assert [c["name"] for c in body["candidates"]] == ["Person One", "Person Two"]


# Inputs from §7.1. Whitespace-only inputs are excluded: their /api/search behaviour is C-3.
API20_INPUTS = sorted(
    set(GRAPH)
    | {a["alias"] for a in ALIASES}
    | {"安倍\u3000晋三", "  Shinzo   Abe  ", "shinzo abe", "Shinzo_Abe", "Nobody", "X2 ", "阮 攸", "ﾋﾞﾖﾝｾ"}
)


@pytest.mark.spec("API-20")
@pytest.mark.parametrize("text", API20_INPUTS)
def test_resolve_and_search_agree(client, text):
    res = client.get("/api/resolve", params={"q": text}).json()
    sr = search(client, text, "A")
    if res["status"] == "resolved":
        assert sr.status_code == 200
        assert sr.json()["from"] == res["person"]["name"]
    else:
        assert sr.status_code == 404
        d = sr.json()["detail"]
        expected_code = "AMBIGUOUS_NAME" if res["status"] == "ambiguous" else "UNRESOLVED_NAME"
        assert d["code"] == expected_code
        assert d["candidates"] == res["candidates"]


@pytest.mark.spec("API-20")
def test_network_is_blocked():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(NetworkBlockedError):
            s.connect(("192.0.2.1", 80))  # TEST-NET-1, never reachable anyway
    finally:
        s.close()
