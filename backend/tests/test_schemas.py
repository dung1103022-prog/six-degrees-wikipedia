"""SPEC §2 / §7.4 — schema and OpenAPI contract (Phase 1)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import SearchResponse
from conftest import VALID_DIR


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(VALID_DIR, enable_share=False))


@pytest.fixture(scope="module")
def openapi(client):
    return client.get("/openapi.json").json()


def resolve_ref(openapi, ref: str) -> dict:
    assert ref.startswith("#/components/schemas/")
    return openapi["components"]["schemas"][ref.rsplit("/", 1)[1]]


def response_schema_ref(openapi, path: str, status: str) -> str:
    return openapi["paths"][path]["get"]["responses"][status]["content"]["application/json"]["schema"]["$ref"]


@pytest.mark.spec("SCH-01")
def test_json_uses_from_key(client):
    body = client.get("/api/search", params={"from": "A", "to": "D"}).json()
    assert "from" in body and "from_" not in body
    dumped = SearchResponse(found=True, from_="A", to="A", length=0, nodes_explored=1, path=[], levels=[])
    assert '"from"' in dumped.model_dump_json(by_alias=True)


@pytest.mark.spec("SCH-02")
def test_openapi_search_response_has_from(openapi):
    props = openapi["components"]["schemas"]["SearchResponse"]["properties"]
    assert "from" in props and "from_" not in props


@pytest.mark.spec("SCH-03")
def test_construct_with_from_underscore():
    m = SearchResponse(found=False, from_="A", to="X", length=None, nodes_explored=1, path=[], levels=[])
    assert m.from_ == "A"


@pytest.mark.spec("SCH-04")
def test_openapi_search_declares_404(openapi):
    ref = response_schema_ref(openapi, "/api/search", "404")
    error_response = resolve_ref(openapi, ref)
    detail_ref = error_response["properties"]["detail"]["$ref"]
    detail = resolve_ref(openapi, detail_ref)
    assert sorted(detail["properties"]["code"]["enum"]) == ["AMBIGUOUS_NAME", "UNRESOLVED_NAME"]
    assert set(detail["properties"]) == {"code", "param", "input", "candidates"}
    assert resolve_ref(openapi, response_schema_ref(openapi, "/api/search", "200")) is \
        openapi["components"]["schemas"]["SearchResponse"]


@pytest.mark.spec("SCH-05")
def test_not_found_has_all_fields(client):
    body = client.get("/api/search", params={"from": "A", "to": "X"}).json()
    assert set(body) == {"found", "from", "to", "length", "nodes_explored", "path", "levels"}
    assert body["length"] is None and body["path"] == []


@pytest.mark.spec("SCH-06")
def test_openapi_resolve(openapi):
    ref = response_schema_ref(openapi, "/api/resolve", "200")
    assert ref.endswith("/ResolveResponse")


@pytest.mark.spec("SCH-07")
@pytest.mark.parametrize("q", ["安倍晋三", "Mr. Ambiguous", "Nobody"])
def test_resolve_and_error_all_fields(client, q):
    body = client.get("/api/resolve", params={"q": q}).json()
    assert set(body) == {"query", "status", "person", "candidates"}
    r = client.get("/api/search", params={"from": q, "to": "A"})
    if r.status_code == 404:
        assert set(r.json()["detail"]) == {"code", "param", "input", "candidates"}


@pytest.mark.spec("SCH-08")
def test_openapi_path(openapi):
    # SPEC v2.3: a framework-generated 422 entry MAY appear in OpenAPI; it is deliberately
    # not asserted either way, and OpenAPI is not customised to remove it. Runtime behaviour
    # (always 200 PathResponse) is covered by PTH-02..08.
    ref = response_schema_ref(openapi, "/api/path", "200")
    assert ref.endswith("/PathResponse")
