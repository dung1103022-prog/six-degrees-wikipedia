"""SPEC §3.4 / §7.10 — static mount of DIST_DIR and SPA fallback
(Phase 4, backend side: SPA-01..SPA-05; SPEC v2.13, Q-18).

Registered only when ``enable_share=True`` (Q-5, Q-10). The fixture ``fixtures/dist/`` stands in
for a frontend build; the real build is never used by these tests (SPEC §0.2).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from conftest import FIXTURES, VALID_DIR

DIST = FIXTURES / "dist"
INDEX_BYTES = (DIST / "index.html").read_bytes()
PLACEHOLDER = b"<!--OG-->"


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(VALID_DIR, dist_dir=DIST))


@pytest.mark.spec("SPA-01")
def test_static_file_in_dist_dir_is_served_with_its_content(client):
    r = client.get("/assets/app.js")
    assert r.status_code == 200
    assert r.content == (DIST / "assets" / "app.js").read_bytes()
    # It is the file, not the SPA fallback page.
    assert r.content != INDEX_BYTES


@pytest.mark.spec("SPA-02")
@pytest.mark.parametrize("path", ["/", "/history", "/a/b/c"])
def test_unknown_non_api_path_returns_index_html_verbatim(client, path):
    r = client.get(path)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert r.content == INDEX_BYTES  # byte for byte
    assert PLACEHOLDER in r.content  # the fallback does not run the /share substitution


@pytest.mark.spec("SPA-03")
def test_static_mount_and_catch_all_do_not_shadow_registered_routes(client):
    people = client.get("/api/people")
    assert people.status_code == 200 and isinstance(people.json(), list)

    resolve = client.get("/api/resolve", params={"q": "A"})
    assert resolve.status_code == 200 and resolve.json()["status"] == "resolved"

    search = client.get("/api/search", params={"from": "A", "to": "B"})
    assert search.status_code == 200 and search.json()["found"] is True

    path = client.get("/api/path", params=[("p", "A"), ("p", "B")])
    assert path.status_code == 200 and path.json()["valid"] is True

    # /share is still handled by its own route: the placeholder is substituted (valid path -> OG meta,
    # invalid path -> empty string), so the body differs from index.html verbatim.
    for query in ("p=A&p=B", "p=Nobody&p=A"):
        r = client.get(f"/share?{query}")
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
        assert PLACEHOLDER not in r.content
        assert r.content != INDEX_BYTES
    assert b'property="og:title"' in client.get("/share?p=A&p=B").content


@pytest.mark.spec("SPA-04")
def test_unknown_api_path_is_404_json_not_index_html(client):
    r = client.get("/api/khong-ton-tai")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/json")
    assert r.content != INDEX_BYTES
    assert "<html" not in r.text.lower()
    r.json()  # a JSON body


@pytest.mark.spec("SPA-05")
def test_no_static_mount_and_no_catch_all_when_share_is_disabled(tmp_path):
    missing_dist = tmp_path / "no-dist-here"  # does not exist: must not be looked at
    app = create_app(VALID_DIR, dist_dir=missing_dist, enable_share=False)
    assert not missing_dist.exists()
    with TestClient(app) as c:
        assert c.get("/").status_code == 404
        assert c.get("/history").status_code == 404
        assert c.get("/assets/app.js").status_code == 404
        assert c.get("/api/people").status_code == 200  # the API is unaffected
