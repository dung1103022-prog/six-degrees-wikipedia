"""SPEC §5.4, §5.5 / §7.6, §7.6A, §7.7 — GET /share
(Phase 2: SHR-01..14, PTH-11, DAT-08, DAT-17, DAT-18).

Q-2 (chốt ở v2.4): /share luôn trả 200 text/html. Path hợp lệ -> <!--OG--> được thay
bằng OG meta dựng từ canonical path đã validate; path không hợp lệ -> <!--OG--> được
thay bằng chuỗi rỗng và các meta tĩnh của dist/index.html giữ nguyên.

v2.5: /share is switched by the explicit ``enable_share`` parameter (default True), never
by whether dist/index.html exists (Q-5); og:url uses the request base URL (Q-6); the
placeholder must occur exactly once, inside <head> (Q-8).
"""
from __future__ import annotations

import html as html_mod
import json
import unicodedata
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import pytest
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app import paths
from app.data import DataValidationError
from app.main import create_app
from conftest import FIXTURES, VALID_DIR

DIST = FIXTURES / "dist"

# Static meta that lives in dist/index.html and must survive both branches (SPEC §5.4).
STATIC_META = '<meta property="og:site_name" content="Six Degrees">'
PLACEHOLDER = "<!--OG-->"
GENERATED_TAGS = ("og:title", "og:description", "og:image", "og:url", "twitter:card")

CHAIN = [
    "Shinzo Abe",
    "Earth, Wind & Fire",
    "Florence + the Machine",
    "Prince (musician)",
    "Who? (band)",
    "AC/DC",
    "Beyoncé",
    "Nguyễn Du",
]


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(VALID_DIR, dist_dir=DIST))


def q(names) -> str:
    return urlencode({"p": list(names)}, doseq=True)


def share(client, names, extra: str = ""):
    query = q(names)
    if extra:
        query = f"{query}&{extra}" if query else extra
    r = client.get(f"/share?{query}" if query else "/share")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    return r.text


def meta_content(text: str, key: str) -> str | None:
    """Value of the meta tag with this og:/twitter: key, unescaped."""
    needle = f'"{key}" content="'
    i = text.find(needle)
    if i == -1:
        return None
    start = i + len(needle)
    return html_mod.unescape(text[start : text.index('"', start)])


def assert_default_og(text: str) -> None:
    """SPEC §5.4 (v2.4): placeholder -> "" ; no server-generated OG; static meta intact."""
    assert PLACEHOLDER not in text
    for tag in GENERATED_TAGS:
        assert tag not in text, tag
    assert STATIC_META in text


# --------------------------------------------------------------------- SHR-01..02


@pytest.mark.spec("SHR-01")
def test_valid_path_injects_og(client):
    text = share(client, ["A", "E", "D"])
    assert PLACEHOLDER not in text
    assert STATIC_META in text
    assert meta_content(text, "og:title") == "A → D: 2 bước"
    assert meta_content(text, "og:description") == "A → E → D"
    assert meta_content(text, "twitter:card") == "summary"
    url = meta_content(text, "og:url")
    assert urlparse(url).path == "/share"
    assert parse_qs(urlparse(url).query) == {"p": ["A", "E", "D"]}


@pytest.mark.spec("SHR-02")
def test_first_person_without_thumbnail_has_no_og_image(client):
    people = json.loads((VALID_DIR / "people.json").read_text(encoding="utf-8"))
    assert people["B"]["thumbnail"] is None  # fixture sanity
    assert people["A"]["thumbnail"] is not None
    text = share(client, ["B", "C"])
    assert meta_content(text, "og:title") == "B → C: 1 bước"
    assert "og:image" not in text
    # ... while a path whose first person has a thumbnail does emit og:image
    assert meta_content(share(client, ["A", "E", "D"]), "og:image") == people["A"]["thumbnail"]


# --------------------------------------------------------------- SHR-03..07, 13


@pytest.mark.spec("SHR-03")
def test_missing_edge_gets_default_og(client):
    # D -> A is not an edge in the fixture graph.
    assert_default_og(share(client, ["D", "A"]))


@pytest.mark.spec("SHR-04")
def test_unknown_name_gets_default_og(client):
    assert_default_og(share(client, ["A", "Ghost"]))


@pytest.mark.spec("SHR-05")
def test_single_element_gets_default_og(client):
    assert_default_og(share(client, ["A"]))


@pytest.mark.spec("SHR-06")
def test_eleven_elements_get_default_og(client):
    ten = ["A", "B", "C", "A", "B", "C", "A", "B", "C", "A"]
    assert meta_content(share(client, ten), "og:title") is not None  # 10 is allowed
    assert_default_og(share(client, ten + ["B"]))


@pytest.mark.spec("SHR-07")
def test_element_too_long_gets_default_og(client):
    assert_default_og(share(client, ["A", "x" * 256]))


@pytest.mark.spec("SHR-13")
def test_no_p_gets_default_og_not_422(client):
    r = client.get("/share")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert_default_og(r.text)


# --------------------------------------------------------------------- SHR-08..10


@pytest.mark.spec("SHR-08")
def test_hostile_names_are_escaped(tmp_path: Path):
    hostile = 'Q & "R" <script>alert(1)</script>'
    graph = {hostile: ["Z"], "Z": []}
    people = {
        n: {
            "thumbnail": None,
            "wiki_url": f"https://en.wikipedia.org/wiki/{i}",
            "description": None,
        }
        for i, n in enumerate(graph)
    }
    data = tmp_path / "data"
    data.mkdir()
    (data / "graph.json").write_text(json.dumps(graph, ensure_ascii=False), encoding="utf-8")
    (data / "people.json").write_text(json.dumps(people, ensure_ascii=False), encoding="utf-8")
    (data / "aliases.json").write_text("[]", encoding="utf-8")

    with TestClient(create_app(data, dist_dir=DIST)) as c:
        text = share(c, [hostile, "Z"])
    assert "<script>" not in text
    assert "&lt;script&gt;" in text
    assert "&amp;" in text and "&quot;" in text
    # Attributes are not broken: the values decode back to exactly what went in.
    assert meta_content(text, "og:title") == f"{hostile} → Z: 1 bước"
    assert meta_content(text, "og:description") == f"{hostile} → Z"


@pytest.mark.spec("SHR-08")
def test_thumbnail_url_is_kept_verbatim_and_only_html_escaped(tmp_path: Path):
    # Q-11 (v2.12): MediaWiki thumbnail URLs carry utm_* query parameters; they are stored and
    # served as they are, and only html.escape touches them in og:image.
    url = (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Albert_Einstein_Head_cleaned.jpg/"
        "250px-Albert_Einstein_Head_cleaned.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail"
    )
    graph = {"P": ["Q"], "Q": []}
    people = {
        "P": {"thumbnail": url, "wiki_url": "https://en.wikipedia.org/wiki/P", "description": None},
        "Q": {"thumbnail": None, "wiki_url": "https://en.wikipedia.org/wiki/Q", "description": None},
    }
    data = tmp_path / "data"
    data.mkdir()
    (data / "graph.json").write_text(json.dumps(graph), encoding="utf-8")
    (data / "people.json").write_text(json.dumps(people), encoding="utf-8")
    (data / "aliases.json").write_text("[]", encoding="utf-8")

    with TestClient(create_app(data, dist_dir=DIST)) as c:
        text = share(c, ["P", "Q"])
    assert meta_content(text, "og:image") == url  # decodes back to exactly what the API returned
    assert "utm_source=en.wikipedia.org&amp;utm_campaign=api&amp;utm_content=thumbnail" in text


@pytest.mark.spec("SHR-09")
def test_special_characters_round_trip(client):
    text = share(client, CHAIN)
    assert meta_content(text, "og:description") == " → ".join(CHAIN)
    url = meta_content(text, "og:url")
    assert parse_qs(urlparse(url).query) == {"p": CHAIN}


@pytest.mark.spec("SHR-10")
def test_og_url_is_rebuilt_and_drops_foreign_params(client):
    text = share(client, ["A", "E", "D"], extra="utm_source=line&q=hack&p2=x")
    url = meta_content(text, "og:url")
    assert parse_qs(urlparse(url).query) == {"p": ["A", "E", "D"]}
    assert "utm_source" not in url and "p2" not in url


@pytest.mark.spec("SHR-14")
@pytest.mark.parametrize(
    "base_url, root_path, expected_prefix",
    [
        ("http://one.test", "", "http://one.test/share?"),
        ("https://two.test:8443", "", "https://two.test:8443/share?"),
        ("http://one.test", "/sub", "http://one.test/sub/share?"),
    ],
)
def test_og_url_uses_request_base_url(base_url, root_path, expected_prefix):
    app = create_app(VALID_DIR, dist_dir=DIST)
    with TestClient(app, base_url=base_url, root_path=root_path) as c:
        text = share(c, ["A", "E", "D"])
    url = meta_content(text, "og:url")
    assert url.startswith(expected_prefix), url
    assert parse_qs(urlparse(url).query) == {"p": ["A", "E", "D"]}


@pytest.mark.spec("SHR-14")
def test_og_url_scheme_from_trusted_proxy_header():
    """Production terminates TLS in front of uvicorn (a reverse proxy), so the connection
    uvicorn itself sees is plain HTTP; only a trusted proxy's X-Forwarded-Proto tells it the
    request was really HTTPS. uvicorn's ProxyHeadersMiddleware is what applies that header in
    the real deployment; TestClient's ASGI transport bypasses uvicorn entirely, so the
    middleware is added explicitly here to exercise the same code path Q-6 relies on.
    """
    app = create_app(VALID_DIR, dist_dir=DIST)
    proxied = ProxyHeadersMiddleware(app, trusted_hosts="testclient")  # TestClient's scope client
    with TestClient(proxied, base_url="http://one.test") as c:
        r = c.get(f"/share?{q(['A', 'E', 'D'])}", headers={"X-Forwarded-Proto": "https"})
    assert r.status_code == 200
    url = meta_content(r.text, "og:url")
    assert url.startswith("https://one.test/share?"), url
    assert parse_qs(urlparse(url).query) == {"p": ["A", "E", "D"]}


# --------------------------------------------------------------------- SHR-11..12


@pytest.mark.spec("SHR-11")
def test_share_url_from_search_response_is_canonical_only(client):
    r = client.get("/api/search", params={"from": "安倍晋三", "to": "Nguyễn Du"})
    assert r.status_code == 200 and r.json()["found"] is True
    names = [p["name"] for p in r.json()["path"]]
    assert names == CHAIN
    url = q(names)
    assert "p=Shinzo+Abe" in url
    assert all(ord(ch) < 0x3000 for ch in url)  # no Japanese characters survive
    assert meta_content(share(client, names), "og:title") == "Shinzo Abe → Nguyễn Du: 7 bước"


@pytest.mark.spec("SHR-12")
@pytest.mark.parametrize("first", ["安倍晋三", "Abe Shinzo", "Shinzo_Abe"])
def test_alias_in_p_is_invalid(client, first):
    assert_default_og(share(client, [first, "Earth, Wind & Fire"]))


# ------------------------------------------------------------------------ PTH-11

SHARED_INPUTS = [
    ("valid A-E-D", ["A", "E", "D"]),
    ("valid B-C (no thumbnail)", ["B", "C"]),
    ("valid chain", CHAIN),
    ("valid NFD", ["Beyoncé", unicodedata.normalize("NFD", "Nguyễn Du")]),
    ("missing edge", ["D", "A"]),
    ("unknown name", ["A", "Ghost"]),
    ("alias ja_title", ["安倍晋三", "Earth, Wind & Fire"]),
    ("alias en_redirect", ["Abe Shinzo", "Earth, Wind & Fire"]),
    ("underscore", ["Shinzo_Abe", "Earth, Wind & Fire"]),
    ("one element", ["A"]),
    ("eleven elements", ["A", "B", "C", "A", "B", "C", "A", "B", "C", "A", "B"]),
    ("too long", ["A", "x" * 256]),
    ("no p", []),
]


@pytest.mark.spec("PTH-11")
def test_share_and_api_path_share_one_verdict(client, monkeypatch):
    real = paths.validate_path
    calls: list[list[str]] = []

    def spy(names, edges):
        calls.append(list(names))
        return real(names, edges)

    monkeypatch.setattr(paths, "validate_path", spy)

    for label, names in SHARED_INPUTS:
        calls.clear()
        query = q(names)
        api = client.get(f"/api/path?{query}" if query else "/api/path")
        assert api.status_code == 200
        api_valid = api.json()["valid"]
        assert len(calls) == 1, f"{label}: /api/path must call validate_path once"

        text = share(client, names)
        share_valid = "og:title" in text
        assert len(calls) == 2, f"{label}: /share must call validate_path once"

        assert api_valid is share_valid, label
        if not share_valid:
            assert_default_og(text)


# ------------------------------------------------------------------------ DAT-08

GOOD_HTML = (DIST / "index.html").read_text(encoding="utf-8")
assert GOOD_HTML.count(PLACEHOLDER) == 1  # fixture sanity: one placeholder, inside <head>


def _without_placeholder() -> str:
    return GOOD_HTML.replace(PLACEHOLDER, "")


def _write_dist(tmp_path: Path, html: str) -> Path:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text(html, encoding="utf-8")
    return dist


#: SPEC §5.5 (Q-8): missing, duplicate, or outside <head> -> the app must not start.
INVALID_INDEX_HTML = {
    # missing
    "missing": _without_placeholder(),
    # duplicate
    "duplicate both in head": GOOD_HTML.replace(PLACEHOLDER, PLACEHOLDER * 2),
    "duplicate one in body": GOOD_HTML.replace("</body>", PLACEHOLDER + "</body>"),
    # outside <head>
    "in body": _without_placeholder().replace("</body>", PLACEHOLDER + "</body>"),
    "after </head>": _without_placeholder().replace("</head>", "</head>" + PLACEHOLDER),
    "before <head>": _without_placeholder().replace("<head>", PLACEHOLDER + "<head>"),
    "no closing </head>": _without_placeholder().replace("</head>", "").replace(
        "<title>", PLACEHOLDER + "<title>"
    ),
    "no <head> element at all": f"<!doctype html><html><body>{PLACEHOLDER}</body></html>",
    # <header> is not <head>
    "only a <header> element": f"<html><header>{PLACEHOLDER}</header><body></body></html>",
}


@pytest.mark.spec("DAT-08")
@pytest.mark.parametrize("html", INVALID_INDEX_HTML.values(), ids=INVALID_INDEX_HTML.keys())
def test_invalid_placeholder_fails_startup(tmp_path: Path, html: str):
    dist = _write_dist(tmp_path, html)
    with pytest.raises(DataValidationError) as exc:
        create_app(VALID_DIR, dist_dir=dist)
    message = str(exc.value)
    assert "OG" in message
    assert str(dist / "index.html") in message  # SPEC §5.5: the error names the file


@pytest.mark.spec("DAT-08")
def test_head_detection_ignores_tag_case_and_accepts_attributes(tmp_path: Path):
    html = GOOD_HTML.replace("<head>", '<HEAD lang="en" data-x="1">').replace("</head>", "</HEAD>")
    assert "<HEAD" in html and "</HEAD>" in html  # fixture sanity
    dist = _write_dist(tmp_path, html)
    with TestClient(create_app(VALID_DIR, dist_dir=dist)) as c:
        text = share(c, ["A", "E", "D"])
    assert meta_content(text, "og:title") == "A → D: 2 bước"


# ------------------------------------------------------------------------ DAT-17


@pytest.mark.spec("DAT-17")
@pytest.mark.parametrize("dist_state", ["directory missing", "directory without index.html"])
def test_share_enabled_without_index_html_fails_startup(tmp_path: Path, dist_state: str):
    dist = tmp_path / "dist"
    if dist_state == "directory without index.html":
        dist.mkdir()
    with pytest.raises(DataValidationError) as exc:  # enable_share defaults to True
        create_app(VALID_DIR, dist_dir=dist)
    assert str(dist / "index.html") in str(exc.value)


@pytest.mark.spec("DAT-17")
def test_share_enabled_by_default_fails_fast_via_env_and_default_dir(tmp_path: Path, monkeypatch):
    # DIST_DIR pointing nowhere.
    monkeypatch.setenv("DIST_DIR", str(tmp_path / "nowhere"))
    with pytest.raises(DataValidationError):
        create_app(VALID_DIR)
    # No DIST_DIR: the default ./dist of the working directory is missing.
    monkeypatch.delenv("DIST_DIR")
    monkeypatch.chdir(tmp_path)
    with pytest.raises(DataValidationError):
        create_app(VALID_DIR)


# ------------------------------------------------------------------------ DAT-18


@pytest.mark.spec("DAT-18")
def test_share_disabled_needs_no_dist_and_registers_no_route(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # no ./dist here
    monkeypatch.delenv("DIST_DIR", raising=False)
    c = TestClient(create_app(VALID_DIR, enable_share=False))
    assert c.get("/api/people").status_code == 200
    assert c.get("/share").status_code == 404
    assert c.get("/share?p=A&p=E&p=D").status_code == 404
    assert "/share" not in c.get("/openapi.json").json()["paths"]


@pytest.mark.spec("DAT-18")
def test_share_disabled_is_not_inferred_from_dist_existing(tmp_path: Path, monkeypatch):
    # A perfectly valid dist/index.html exists, yet enable_share=False registers no route.
    monkeypatch.setenv("DIST_DIR", str(DIST))
    c = TestClient(create_app(VALID_DIR, enable_share=False))
    assert c.get("/share?p=A&p=E&p=D").status_code == 404

    # An invalid dist/index.html is not even looked at.
    bad = _write_dist(tmp_path, _without_placeholder())
    c = TestClient(create_app(VALID_DIR, dist_dir=bad, enable_share=False))
    assert c.get("/api/people").status_code == 200
    assert c.get("/share").status_code == 404
