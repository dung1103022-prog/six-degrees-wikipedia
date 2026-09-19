"""SPEC §6.4, §7.8 — the Phase 3 fetcher (FET-01..FET-21). No network: every request goes
to ``FakeWiki`` through ``httpx.MockTransport``; time is a fake clock (nothing really sleeps).

Written before ``backend/fetcher.py`` (SPEC §0.2). FET-21 and the transport-error cases of
FET-06/FET-15 (C-15, SPEC v2.14) were written before the fetcher retried transport errors.
"""
from __future__ import annotations

import json
import logging
import re
import shutil
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

import fetcher
from app.data import DataValidationError, load_data
from app.resolver import AliasEntry
from conftest import VALID_DIR
from fakewiki import FakeClock, FakeWiki, load_wiki

CONTACT = "ops@example.org"
FILES = ("graph.json", "people.json", "aliases.json")

SEEDS = ["Albert Einstein", "Einstein", "Isaac_Newton", "Niels Bohr", "Marie Curie", "Nonexistent Person"]

EXPECTED_GRAPH = {
    "Albert Einstein": ["Isaac Newton", "Niels Bohr"],
    "Isaac Newton": ["Albert Einstein"],
    "Marie Curie": ["Albert Einstein"],
    "Niels Bohr": ["Albert Einstein"],
}

EXPECTED_ALIASES = {
    # step 4: en redirects
    ("A. Einstein", "Albert Einstein", "en_redirect"),
    ("Einstein", "Albert Einstein", "en_redirect"),
    ("Sir Isaac Newton", "Isaac Newton", "en_redirect"),
    ("Bohr", "Niels Bohr", "en_redirect"),
    # step 3 + 5: Einstein's ja langlink is itself a jawiki redirect (C-6)
    ("アルベルト・アインシュタイン", "Albert Einstein", "ja_title"),
    ("アインシュタイン", "Albert Einstein", "ja_redirect"),
    ("A・アインシュタイン", "Albert Einstein", "ja_redirect"),
    # Newton's langlink is an article
    ("アイザック・ニュートン", "Isaac Newton", "ja_title"),
    ("ニュートン", "Isaac Newton", "ja_redirect"),
    # Bohr's langlink does not exist on jawiki (dropped); Curie has no ja langlink
}


# ------------------------------------------------------------------------------ helpers


@dataclass
class Attempt:
    """One attempt that reached the transport (a retry is a new attempt)."""

    n: int  # 1-based, over the whole run
    lang: str
    params: dict[str, str]
    failures: int  # how many attempts before this one were failed by the Flaky wrapper
    started: float  # fake clock, when the attempt started


def _remote_protocol_error(request: httpx.Request) -> Exception:
    return httpx.RemoteProtocolError("Server disconnected without sending a response.", request=request)


class Flaky:
    """Transport wrapper around ``FakeWiki`` (C-15): an attempt for which ``fail_when(attempt)`` is
    true raises ``error(request)`` and never reaches the fake; every other attempt is served by it
    (so ``FakeWiki.scripted`` answers and ``FakeWiki.requests`` only see the attempts that got through)."""

    def __init__(self, fail_when: Callable[[Attempt], bool], error: Callable[[httpx.Request], Exception] = _remote_protocol_error):
        self.fail_when = fail_when
        self.error = error
        self.attempts: list[Attempt] = []
        self.failed_at: list[int] = []  # indexes into ``attempts`` of the attempts it failed
        self._inner: httpx.MockTransport | None = None
        self._clock: FakeClock | None = None

    def bind(self, wiki: FakeWiki) -> httpx.MockTransport:
        self._inner, self._clock = wiki.transport(), wiki.clock
        return httpx.MockTransport(self._handle)

    @property
    def failures(self) -> int:
        return len(self.failed_at)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        assert self._inner is not None and self._clock is not None
        attempt = Attempt(
            n=len(self.attempts) + 1,
            lang=request.url.host.split(".")[0],
            params=dict(request.url.params.items()),
            failures=self.failures,
            started=self._clock.monotonic(),
        )
        self.attempts.append(attempt)
        if self.fail_when(attempt):
            self.failed_at.append(len(self.attempts) - 1)
            raise self.error(request)
        return self._inner.handle_request(request)


def make_env(
    tmp_path: Path,
    *,
    wiki_name: str = "tiny_wiki",
    wiki_data: dict | None = None,
    seeds: list[str] | None = SEEDS,
    page_size: int = 0,
    multi_continue: bool = False,
    min_interval: float | None = None,  # None: the fetcher's own default (C-10)
    flaky: Flaky | None = None,  # fail chosen attempts at the transport (C-15)
) -> SimpleNamespace:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    if seeds is not None:
        (data_dir / "seed_names.txt").write_text("\n".join(seeds) + "\n", encoding="utf-8")
    clock = FakeClock()
    wiki = FakeWiki(
        wiki_data if wiki_data is not None else load_wiki(wiki_name),
        clock,
        page_size=page_size,
        multi_continue=multi_continue,
    )
    config = fetcher.FetcherConfig() if min_interval is None else fetcher.FetcherConfig(min_interval=min_interval)
    transport = wiki.transport() if flaky is None else flaky.bind(wiki)
    client = fetcher.build_client(CONTACT, transport=transport)
    env = SimpleNamespace(
        data_dir=data_dir,
        clock=clock,
        wiki=wiki,
        flaky=flaky,
        fetcher=fetcher.Fetcher(data_dir, client, config, clock),
    )
    env.run = env.fetcher.run
    return env


def read_out(data_dir: Path):
    graph, people, aliases = (json.loads((data_dir / n).read_text(encoding="utf-8")) for n in FILES)
    return graph, people, {(a["alias"], a["target"], a["source"]) for a in aliases}


def install_old_dataset(data_dir: Path) -> None:
    for name in FILES:
        shutil.copy2(VALID_DIR / name, data_dir / name)


def snapshot(data_dir: Path) -> dict[str, bytes]:
    return {n: (data_dir / n).read_bytes() for n in FILES if (data_dir / n).exists()}


def listing(data_dir: Path) -> list[str]:
    return sorted(p.name for p in data_dir.iterdir())


def respond(status: int, body: dict | bytes | None = None, headers: dict | None = None):
    def make(request: httpx.Request) -> httpx.Response:
        if isinstance(body, dict):
            return httpx.Response(status, json=body, headers=headers)
        return httpx.Response(status, content=body or b"", headers=headers)

    return make


def starts(env) -> list[float]:
    return [r.started for r in env.wiki.requests]


# ------------------------------------------------------------------------- happy path


@pytest.mark.spec("FET-07")
def test_output_satisfies_section_6_5_invariants(tmp_path):
    env = make_env(tmp_path)
    env.run()
    graph, people, aliases = read_out(env.data_dir)

    assert graph == EXPECTED_GRAPH
    assert list(graph) == sorted(graph)  # stable file layout
    # G-1..G-5
    assert all(t in graph for adj in graph.values() for t in adj)  # G-2 closed
    assert all(n not in adj for n, adj in graph.items())  # G-3
    assert all(len(set(adj)) == len(adj) and adj == sorted(adj) for adj in graph.values())  # G-4, G-5
    # P-1..P-3
    assert set(people) == set(graph)
    assert all(set(meta) == {"thumbnail", "wiki_url", "description"} for meta in people.values())
    assert all(meta["wiki_url"].startswith("https://en.wikipedia.org/wiki/") for meta in people.values())
    assert all(v != "" for meta in people.values() for v in meta.values())
    # A-1..A-4
    assert all(target in graph for _, target, _ in aliases)
    assert {source for *_, source in aliases} <= {"en_redirect", "ja_title", "ja_redirect"}
    # the runtime loader (SPEC 6.5) accepts what the fetcher wrote
    load_data(env.data_dir)
    # UTF-8 with ensure_ascii=False (SPEC 6)
    raw = (env.data_dir / "aliases.json").read_text(encoding="utf-8")
    assert "アルベルト・アインシュタイン" in raw and "\\u" not in raw
    assert env.wiki.violations == []


@pytest.mark.spec("FET-07")
def test_aliases_are_written_sorted_by_alias_target_source(tmp_path):
    env = make_env(tmp_path)
    env.run()
    written = json.loads((env.data_dir / "aliases.json").read_text(encoding="utf-8"))
    keys = [(a["alias"], a["target"], a["source"]) for a in written]
    assert len(keys) > 5 and keys == sorted(keys)  # A-7 (C-14), in file order, not as a set
    load_data(env.data_dir)  # and the loader's A-7 check accepts it


@pytest.mark.spec("FET-07")
def test_build_aliases_sorts_by_the_whole_alias_target_source_triple():
    # Many entries that tie on the alias alone, in an order that is not the sorted one: only the
    # full (alias, target, source) key gives the order the SPEC asks for (C-14, A-7).
    targets = [f"Person {n}" for n in range(9, 0, -1)]
    redirects = {target: ["Same"] for target in targets}
    ja = [AliasEntry("Same", target, "ja_redirect") for target in targets]
    ja += [AliasEntry("Same", target, "ja_title") for target in targets]
    entries, dropped = fetcher.build_aliases(redirects, ja)
    keys = [(e.alias, e.target, e.source) for e in entries]
    assert dropped == 0 and len(keys) == 27
    assert keys == sorted(keys)
    assert keys[:3] == [
        ("Same", "Person 1", "en_redirect"),
        ("Same", "Person 1", "ja_redirect"),
        ("Same", "Person 1", "ja_title"),
    ]


@pytest.mark.spec("FET-07")
@pytest.mark.parametrize("variant", ["page_size_1", "page_size_2", "seeds_reversed", "conflict_wiki"])
def test_output_is_byte_for_byte_stable(tmp_path, variant):
    """C-14: the same API data gives the same bytes, whatever the paging or the seed order."""
    if variant == "conflict_wiki":
        seeds = ["Foo (actor)", "Foo (singer)"]
        first = make_env(tmp_path / "a", wiki_name="conflict_wiki", seeds=seeds)
        second = make_env(tmp_path / "b", wiki_name="conflict_wiki", seeds=list(reversed(seeds)), page_size=1)
    else:
        first = make_env(tmp_path / "a")
        second = make_env(
            tmp_path / "b",
            page_size={"page_size_1": 1, "page_size_2": 2}.get(variant, 0),
            seeds=list(reversed(SEEDS)) if variant == "seeds_reversed" else SEEDS,
        )
    first.run()
    second.run()
    assert snapshot(first.data_dir) == snapshot(second.data_dir)
    assert set(snapshot(first.data_dir)) == set(FILES)


@pytest.mark.spec("FET-07")
def test_titles_are_nfc_normalised_before_they_are_written(tmp_path):
    data = {
        "en": {
            "pages": {
                "Beyoncé": {
                    "pageid": 1,
                    "url": "https://en.wikipedia.org/wiki/Beyonc%C3%A9",
                    "links": ["Beyoncé"],
                    "langlinks": {"ja": "ビヨンセ"},
                }
            },
            "redirects": {"Queen Bey": "Beyoncé"},
        },
        "ja": {"pages": {"ビヨンセ": {"pageid": 2}}, "redirects": {}},
    }
    seeds = [unicodedata.normalize("NFD", "Beyoncé")]
    env = make_env(tmp_path, wiki_data=data, seeds=seeds)
    env.wiki.emit_nfd = True  # every title in every answer arrives decomposed
    env.run()
    graph, people, aliases = read_out(env.data_dir)
    assert list(graph) == ["Beyoncé"] and set(people) == {"Beyoncé"}
    assert aliases == {
        ("Queen Bey", "Beyoncé", "en_redirect"),
        ("ビヨンセ", "Beyoncé", "ja_title"),
    }
    for name in FILES:
        raw = (env.data_dir / name).read_text(encoding="utf-8")
        assert unicodedata.is_normalized("NFC", raw)
    load_data(env.data_dir)


def test_main_runs_end_to_end(tmp_path):
    env = make_env(tmp_path)
    code = fetcher.main(
        ["--data-dir", str(env.data_dir)],
        environ={"WIKI_UA_CONTACT": CONTACT},
        transport=env.wiki.transport(),
        clock=env.clock,
    )
    assert code == 0
    assert read_out(env.data_dir)[0] == EXPECTED_GRAPH
    gaps = [b - a for a, b in zip(starts(env), starts(env)[1:])]
    assert min(gaps) >= 0.32 - 1e-9  # the command line uses the same default spacing


# --------------------------------------------------------------------- steps 1 and 2


@pytest.mark.spec("FET-01")
def test_continuation_merges_links_from_many_pages(tmp_path):
    env = make_env(tmp_path, page_size=2)
    env.run()
    assert read_out(env.data_dir)[0] == EXPECTED_GRAPH
    link_requests = [r for r in env.wiki.requests if r.params.get("prop") == "links"]
    assert len(link_requests) > 1
    assert any("plcontinue" in r.params for r in link_requests)
    assert env.wiki.violations == []


@pytest.mark.spec("FET-02")
def test_links_to_redirect_pages_resolve_to_canonical_names(tmp_path):
    env = make_env(tmp_path)
    env.run()
    graph = read_out(env.data_dir)[0]
    # These two edges exist only through redirect pages: the fixture's Bohr article links to the
    # redirect "Einstein" (never to "Albert Einstein") and Einstein links to the redirect "Bohr".
    assert "Albert Einstein" in graph["Niels Bohr"]
    assert "Niels Bohr" in graph["Albert Einstein"]
    assert "Einstein" not in graph and "Bohr" not in graph
    assert all("Einstein" != t and "Bohr" != t for adj in graph.values() for t in adj)
    step2 = [r for r in env.wiki.requests if r.params.get("prop") == "links"]
    assert step2 and all(r.params.get("redirects") == "1" for r in step2)


@pytest.mark.spec("FET-03")
def test_seed_redirects_resolve_and_duplicate_seeds_merge(tmp_path):
    seeds = ["Albert Einstein", "Albert_Einstein", "Einstein", "A. Einstein", "Isaac Newton"]
    env = make_env(tmp_path, seeds=seeds)
    env.run()
    graph, people, _ = read_out(env.data_dir)
    assert set(graph) == {"Albert Einstein", "Isaac Newton"}
    assert set(people) == set(graph)
    # links to canonical names outside the seed set are filtered out (closed graph, G-2)
    assert graph["Albert Einstein"] == ["Isaac Newton"]


@pytest.mark.spec("FET-04")
def test_missing_seed_is_dropped_and_logged(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="fetcher")
    env = make_env(tmp_path)
    env.run()
    assert "Nonexistent Person" not in read_out(env.data_dir)[0]
    assert any("Nonexistent Person" in r.getMessage() for r in caplog.records)


def test_refuses_to_overwrite_when_no_seed_resolves(tmp_path):
    env = make_env(tmp_path, seeds=["Nonexistent Person"])
    install_old_dataset(env.data_dir)
    before = snapshot(env.data_dir)
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert snapshot(env.data_dir) == before


def test_missing_seed_file_stops_before_any_request(tmp_path):
    env = make_env(tmp_path, seeds=None)
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert env.wiki.requests == []


# ------------------------------------------------------------------ steps 3, 4 and 5


@pytest.mark.spec("FET-05")
def test_pages_without_image_or_description_get_null(tmp_path):
    env = make_env(tmp_path)
    env.run()
    people = read_out(env.data_dir)[1]
    assert people["Niels Bohr"] == {
        "thumbnail": None,
        "wiki_url": "https://en.wikipedia.org/wiki/Niels_Bohr",
        "description": None,
    }
    assert people["Isaac Newton"]["thumbnail"] is None
    assert people["Isaac Newton"]["description"] == "English polymath (1643–1727)"
    assert people["Albert Einstein"]["thumbnail"] == load_wiki("tiny_wiki")["en"]["pages"]["Albert Einstein"]["thumbnail"]
    metadata = [r for r in env.wiki.requests if r.params.get("prop") == "pageimages|info|description|langlinks"]
    assert metadata
    assert all(
        r.params["pithumbsize"] == "200" and r.params["inprop"] == "url" and r.params["lllang"] == "ja"
        for r in metadata
    )


@pytest.mark.spec("FET-08")
def test_ja_langlinks_make_ja_title_aliases(tmp_path):
    env = make_env(tmp_path)
    env.run()
    aliases = read_out(env.data_dir)[2]
    ja_titles = {(a, t) for a, t, s in aliases if s == "ja_title"}
    assert ja_titles == {
        ("アルベルト・アインシュタイン", "Albert Einstein"),
        ("アイザック・ニュートン", "Isaac Newton"),
    }
    # Marie Curie has no ja langlink: no ja alias of any kind
    assert not [a for a in aliases if a[1] == "Marie Curie"]


@pytest.mark.spec("FET-09")
def test_continuation_resends_the_whole_continue_object(tmp_path):
    env = make_env(tmp_path, multi_continue=True)
    env.run()
    assert env.wiki.violations == []  # FakeWiki flags any continue key that is not echoed back
    metadata = [r for r in env.wiki.requests if r.params.get("prop") == "pageimages|info|description|langlinks"]
    assert len(metadata) == 2
    second = metadata[1].params
    assert (second["llcontinue"], second["picontinue"], second["continue"]) == ("0", "9", "||info|description")
    # the langlinks that arrived with the second response were merged into the pages
    assert ("アイザック・ニュートン", "Isaac Newton", "ja_title") in read_out(env.data_dir)[2]


@pytest.mark.spec("FET-10")
def test_en_redirects_become_en_redirect_aliases(tmp_path):
    env = make_env(tmp_path, page_size=1)  # also forces rdcontinue paging
    env.run()
    aliases = read_out(env.data_dir)[2]
    assert {a for a in aliases if a[2] == "en_redirect"} == {a for a in EXPECTED_ALIASES if a[2] == "en_redirect"}
    step4 = [r for r in env.wiki.requests if r.params.get("prop") == "redirects" and r.lang == "en"]
    assert step4 and all(r.params["rdnamespace"] == "0" and r.params["rdlimit"] == "max" for r in step4)
    assert env.wiki.violations == []


@pytest.mark.spec("FET-11")
def test_langlink_that_is_a_jawiki_redirect(tmp_path):
    env = make_env(tmp_path)
    env.run()
    aliases = read_out(env.data_dir)[2]
    einstein = {(a, s) for a, t, s in aliases if t == "Albert Einstein" and s.startswith("ja_")}
    # ja_title is the destination article; the original langlink title is a ja_redirect (C-6)
    assert ("アルベルト・アインシュタイン", "ja_title") in einstein
    assert ("アインシュタイン", "ja_redirect") in einstein
    assert ("アインシュタイン", "ja_title") not in einstein
    assert aliases >= EXPECTED_ALIASES
    ja_requests = [r for r in env.wiki.requests if r.lang == "ja"]
    assert ja_requests and all(r.params.get("redirects") == "1" for r in ja_requests)


@pytest.mark.spec("FET-11")
def test_original_langlink_title_is_kept_even_if_the_redirect_list_omits_it():
    """C-6 on its own: the answer maps the langlink title to the article (query.redirects) but the
    article's redirect list does not mention it, e.g. because of a namespace filter or paging."""
    query = {
        "normalized": [],
        "redirects": [{"from": "旧題", "to": "新題"}],
        "pages": {"新題": {"title": "新題", "redirects": []}},
    }
    entries = {(e.alias, e.target, e.source) for e in fetcher.build_ja_aliases({"Some Person": "旧題"}, query)}
    assert entries == {("新題", "Some Person", "ja_title"), ("旧題", "Some Person", "ja_redirect")}


@pytest.mark.spec("FET-12")
def test_langlink_to_a_missing_jawiki_page_is_dropped_and_logged(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="fetcher")
    env = make_env(tmp_path)
    env.run()
    aliases = read_out(env.data_dir)[2]
    assert not [a for a in aliases if a[1] == "Niels Bohr" and a[2].startswith("ja_")]
    assert any("ニールス・ボーア" in r.getMessage() for r in caplog.records)


@pytest.mark.spec("FET-13")
def test_two_targets_with_the_same_ja_title_keep_the_conflict(tmp_path):
    seeds = ["Foo (actor)", "Foo (singer)"]
    env = make_env(tmp_path, wiki_name="conflict_wiki", seeds=seeds)
    env.run()
    aliases = read_out(env.data_dir)[2]
    assert aliases == {
        ("フー", "Foo (actor)", "ja_title"),
        ("フー", "Foo (singer)", "ja_title"),
        ("フー氏", "Foo (actor)", "ja_redirect"),
        ("フー氏", "Foo (singer)", "ja_redirect"),
    }


@pytest.mark.spec("FET-05")
def test_thumbnail_url_is_written_exactly_as_the_api_returned_it(tmp_path):
    # Q-11 (v2.12): no stripping of utm_* and no rewriting of the size, although 200 was requested.
    env = make_env(tmp_path)
    env.run()
    thumbnail = read_out(env.data_dir)[1]["Albert Einstein"]["thumbnail"]
    assert thumbnail == load_wiki("tiny_wiki")["en"]["pages"]["Albert Einstein"]["thumbnail"]
    assert "utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail" in thumbnail
    assert "/250px-" in thumbnail
    raw = (env.data_dir / "people.json").read_text(encoding="utf-8")
    assert "&utm_campaign=api" in raw  # neither HTML-escaped nor percent-encoded in the file


@pytest.mark.spec("FET-20")
def test_alias_equal_to_target_is_dropped_from_the_output(tmp_path):
    # C-8 (v2.12): jawiki has a redirect named "Albert Einstein" to Einstein's article.
    env = make_env(tmp_path)
    env.run()
    graph, people, aliases = read_out(env.data_dir)
    assert not [a for a in aliases if a[0] == a[1]]
    assert ("Albert Einstein", "Albert Einstein", "ja_redirect") not in aliases
    assert aliases >= EXPECTED_ALIASES  # everything else about Einstein is still there
    assert set(graph) == set(EXPECTED_GRAPH) and set(people) == set(graph)  # identity unchanged
    load_data(env.data_dir)


@pytest.mark.spec("FET-20")
def test_build_aliases_drops_only_exact_matches_after_nfc():
    nfc_name = "Beyoncé"
    nfd_name = unicodedata.normalize("NFD", nfc_name)
    redirects = {
        "Foo": ["Foo", "foo", "Foo  Bar", "F. Foo"],  # only the first is exactly the target
        nfc_name: [nfd_name, "Queen Bey"],  # the same name in another normalisation form
    }
    ja = [AliasEntry("Foo", "Foo", "ja_title"), AliasEntry("フー", "Foo", "ja_title")]
    entries, dropped = fetcher.build_aliases(redirects, ja)
    assert dropped == 3
    assert {(e.alias, e.target, e.source) for e in entries} == {
        ("foo", "Foo", "en_redirect"),
        ("Foo  Bar", "Foo", "en_redirect"),
        ("F. Foo", "Foo", "en_redirect"),
        ("Queen Bey", nfc_name, "en_redirect"),
        ("フー", "Foo", "ja_title"),
    }
    keys = [(e.alias, e.target, e.source) for e in entries]
    assert keys == sorted(keys)


# ------------------------------------------------------------------ pilot measurements


def test_run_reports_what_a_pilot_needs_to_measure(tmp_path):
    env = make_env(tmp_path, page_size=1)
    env.wiki.scripted = [respond(503)]  # one retry
    started = env.clock.now
    stats = env.run()
    sizes = {name: (env.data_dir / name).stat().st_size for name in FILES}

    assert stats.people == len(EXPECTED_GRAPH)
    assert stats.links == sum(len(adj) for adj in EXPECTED_GRAPH.values())
    tiny = load_wiki("tiny_wiki")["en"]["pages"]
    assert stats.raw_links == sum(len(page.get("links", [])) for page in tiny.values())  # before filtering
    assert stats.aliases == len(EXPECTED_ALIASES)
    assert stats.aliases_dropped_as_self == 1
    assert stats.requests == len(env.wiki.requests) and stats.retries == 1
    assert set(stats.requests_by_step) == {1, 2, 3, 4, 5}
    assert sum(stats.requests_by_step.values()) == stats.requests
    assert stats.file_bytes == sizes and stats.total_bytes == sum(sizes.values())
    assert stats.seconds == pytest.approx(env.clock.now - started)
    assert set(stats.seconds_by_step) == {1, 2, 3, 4, 5}
    assert sum(stats.seconds_by_step.values()) == pytest.approx(stats.seconds)


def test_summary_is_logged_with_per_person_figures(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="fetcher")
    env = make_env(tmp_path)
    code = fetcher.main(
        ["--data-dir", str(env.data_dir)],
        environ={"WIKI_UA_CONTACT": CONTACT},
        transport=env.wiki.transport(),
        clock=env.clock,
    )
    assert code == 0
    text = caplog.text
    for needle in ("requests", "raw links", "aliases per person", "graph.json", "people.json", "aliases.json", "total", "seconds"):
        assert needle in text, needle


# -------------------------------------------------------- errors, retry, request policy


@pytest.mark.spec("FET-06")
@pytest.mark.parametrize(
    "answer",
    [
        respond(429, headers={"Retry-After": "1"}),
        respond(503),
        respond(500),
        respond(
            200,
            {"error": {"code": "maxlag", "info": "Waiting for a database server: 7 seconds lagged", "lag": 7}},
            headers={"Retry-After": "5"},
        ),
    ],
    ids=["429", "503", "500", "maxlag-in-HTTP-200"],
)
def test_retryable_errors_are_retried(tmp_path, answer):
    env = make_env(tmp_path)
    env.wiki.scripted = [answer]
    env.run()
    first, second = env.wiki.requests[0], env.wiki.requests[1]
    assert first.params == second.params  # the very same request is retried
    assert read_out(env.data_dir)[0] == EXPECTED_GRAPH


@pytest.mark.spec("FET-06")
@pytest.mark.parametrize(
    "answer",
    [
        respond(404),
        respond(403),
        respond(200, {"error": {"code": "badtitle", "info": "bad title"}}),
        respond(200, b"<html>not json</html>"),
    ],
    ids=["404", "403", "other-error-body", "not-json"],
)
def test_other_errors_are_not_retried_and_write_nothing(tmp_path, answer):
    env = make_env(tmp_path)
    env.wiki.scripted = [answer]
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert len(env.wiki.requests) == 1
    assert listing(env.data_dir) == ["seed_names.txt"]


@pytest.mark.spec("FET-06")
def test_after_five_retries_the_fetcher_stops_and_writes_nothing(tmp_path):
    env = make_env(tmp_path)
    install_old_dataset(env.data_dir)
    before = snapshot(env.data_dir)
    env.wiki.scripted = [respond(503)] * 8
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert len(env.wiki.requests) == 6  # the request plus five retries
    assert snapshot(env.data_dir) == before


@pytest.mark.spec("FET-06")
def test_body_warnings_are_logged(tmp_path, caplog):
    caplog.set_level(logging.INFO, logger="fetcher")
    env = make_env(tmp_path)
    env.wiki.warnings = {"main": {"warnings": "Unrecognized parameter: frobnicate."}}
    env.run()
    assert any("Unrecognized parameter: frobnicate." in r.getMessage() for r in caplog.records)


@pytest.mark.spec("FET-14")
def test_every_request_follows_the_request_policy(tmp_path):
    env = make_env(tmp_path)
    env.run()
    assert env.wiki.requests
    assert env.wiki.violations == []  # GET, /w/api.php, format=json, formatversion=2, maxlag=5, <= 50 titles
    for rec in env.wiki.requests:
        assert rec.method == "GET"
        assert rec.params["format"] == "json" and rec.params["formatversion"] == "2"
        assert rec.params["maxlag"] == "5"
        agent = rec.headers["user-agent"]
        assert re.fullmatch(r"SixDegreesPy/\S+ \(.+\) httpx/\S+", agent), agent
        assert CONTACT in agent
        assert "gzip" in rec.headers["accept-encoding"]
        assert "authorization" not in rec.headers
        assert set(rec.timeout.values()) == {30.0}
    assert {r.lang for r in env.wiki.requests} == {"en", "ja"}
    load_data(env.data_dir)  # A-1..A-4 (and the rest of 6.5) hold for what was written


@pytest.mark.spec("FET-14")
def test_validator_failure_writes_no_file_and_keeps_the_old_dataset(tmp_path, monkeypatch):
    env = make_env(tmp_path)
    install_old_dataset(env.data_dir)
    before, names = snapshot(env.data_dir), listing(env.data_dir)

    def failing(_directory):
        raise DataValidationError("[A-1] boom")

    monkeypatch.setattr(fetcher, "load_data", failing)
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert snapshot(env.data_dir) == before
    assert listing(env.data_dir) == names  # no staging leftovers, no partial output


@pytest.mark.spec("FET-15")
def test_wait_before_retry_is_max_of_retry_after_and_backoff(tmp_path):
    env = make_env(tmp_path)
    env.wiki.scripted = [
        respond(429, headers={"Retry-After": "90"}),  # larger than the backoff: honoured
        respond(503, headers={"Retry-After": "1"}),  # smaller than 5 * 2^1: backoff wins
        respond(503),  # no header: backoff 5 * 2^2
    ]
    env.run()
    first_attempts = starts(env)[:4]
    gaps = [b - a for a, b in zip(first_attempts, first_attempts[1:])]
    assert gaps == [90.0, 10.0, 20.0]


@pytest.mark.spec("FET-15")
def test_backoff_doubles_for_each_retry_of_a_request(tmp_path):
    env = make_env(tmp_path)
    env.wiki.scripted = [respond(503)] * 5
    env.run()
    attempts = starts(env)[:6]
    assert [b - a for a, b in zip(attempts, attempts[1:])] == [5.0, 10.0, 20.0, 40.0, 80.0]


@pytest.mark.spec("FET-16")
def test_requests_are_sequential_and_paced_under_200_per_minute(tmp_path):
    env = make_env(tmp_path, page_size=1)  # many requests, default configuration
    env.wiki.scripted = [respond(503)]  # retries obey the spacing too
    env.run()
    assert len(env.wiki.requests) > 10
    assert env.wiki.max_in_flight == 1
    gaps = [b - a for a, b in zip(starts(env), starts(env)[1:])]
    assert min(gaps) >= 0.32 - 1e-9
    assert 60 / min(gaps) <= 187.5 + 1e-6  # at most 187.5 requests a minute, under Wikimedia's 200
    assert 0.32 in [round(s, 9) for s in env.clock.sleeps]  # the throttle really waited


@pytest.mark.spec("FET-16")
def test_default_interval_is_032_seconds():
    assert fetcher.DEFAULT_MIN_INTERVAL == 0.32
    assert fetcher.FetcherConfig().min_interval == 0.32
    assert 60 / fetcher.FetcherConfig().min_interval < 200


@pytest.mark.spec("FET-17")
@pytest.mark.parametrize("interval", [0.319, 0.31, 0.3, 0.25, 0.2, 0.1, 0.0, -1.0])
def test_min_interval_below_032_seconds_is_rejected(tmp_path, interval):
    with pytest.raises(fetcher.ConfigError):
        fetcher.FetcherConfig(min_interval=interval)
    env = make_env(tmp_path)
    code = fetcher.main(
        ["--data-dir", str(env.data_dir), "--min-interval", str(interval)],
        environ={"WIKI_UA_CONTACT": CONTACT},
        transport=env.wiki.transport(),
        clock=env.clock,
    )
    assert code != 0
    assert env.wiki.requests == []  # rejected at start-up, before any request
    assert listing(env.data_dir) == ["seed_names.txt"]


@pytest.mark.spec("FET-17")
@pytest.mark.parametrize("interval", [0.32, 0.33, 0.5, 1.0])
def test_min_interval_of_032_seconds_or_more_is_accepted(tmp_path, interval):
    assert fetcher.FetcherConfig(min_interval=interval).min_interval == interval
    env = make_env(tmp_path)
    code = fetcher.main(
        ["--data-dir", str(env.data_dir), "--min-interval", str(interval)],
        environ={"WIKI_UA_CONTACT": CONTACT},
        transport=env.wiki.transport(),
        clock=env.clock,
    )
    assert code == 0  # exactly 0.32 s is allowed
    gaps = [b - a for a, b in zip(starts(env), starts(env)[1:])]
    assert min(gaps) >= interval - 1e-9  # and the configured spacing is what is used


@pytest.mark.spec("FET-17")
def test_default_and_minimum_interval_are_both_032_seconds():
    assert fetcher.DEFAULT_MIN_INTERVAL == 0.32
    assert fetcher.MIN_ALLOWED_INTERVAL == 0.32
    assert fetcher.FetcherConfig().min_interval == fetcher.MIN_ALLOWED_INTERVAL
    assert 60 / fetcher.MIN_ALLOWED_INTERVAL == 187.5  # under Wikimedia's 200 requests a minute


@pytest.mark.spec("FET-18")
@pytest.mark.parametrize("environ", [{}, {"WIKI_UA_CONTACT": ""}, {"WIKI_UA_CONTACT": "   "}])
def test_missing_contact_stops_before_the_first_request(tmp_path, environ, caplog):
    env = make_env(tmp_path)
    code = fetcher.main(
        ["--data-dir", str(env.data_dir)],
        environ=environ,
        transport=env.wiki.transport(),
        clock=env.clock,
    )
    assert code != 0
    assert env.wiki.requests == []
    assert "WIKI_UA_CONTACT" in caplog.text
    assert listing(env.data_dir) == ["seed_names.txt"]


# ------------------------------------------------------- C-9: transactional output (v2.8)


@pytest.mark.spec("FET-19")
@pytest.mark.parametrize("with_old_dataset", [True, False], ids=["old-dataset", "first-run"])
def test_write_failure_on_the_second_file_leaves_no_new_dataset(tmp_path, monkeypatch, with_old_dataset):
    env = make_env(tmp_path)
    if with_old_dataset:
        install_old_dataset(env.data_dir)
    before, names = snapshot(env.data_dir), listing(env.data_dir)

    real, calls = fetcher._write_file, []

    def flaky(path, text):
        calls.append(path.name)
        if len(calls) == 2:
            raise OSError("disk full")
        real(path, text)

    monkeypatch.setattr(fetcher, "_write_file", flaky)
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert len(calls) == 2
    assert snapshot(env.data_dir) == before  # old dataset intact / still absent
    assert listing(env.data_dir) == names  # no partial output, no staging left behind


@pytest.mark.spec("FET-19")
@pytest.mark.parametrize("with_old_dataset", [True, False], ids=["old-dataset", "first-run"])
def test_replace_failure_on_the_second_file_rolls_back(tmp_path, monkeypatch, with_old_dataset):
    env = make_env(tmp_path)
    if with_old_dataset:
        install_old_dataset(env.data_dir)
    before, names = snapshot(env.data_dir), listing(env.data_dir)

    real, calls, first_target_at_failure = fetcher._replace_file, [], []

    def flaky(src, dst):
        calls.append(dst.name)
        if len(calls) == 2:
            first = env.data_dir / calls[0]
            first_target_at_failure.append(first.read_bytes() if first.exists() else None)
            raise OSError("access denied")
        real(src, dst)

    monkeypatch.setattr(fetcher, "_replace_file", flaky)
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert len(calls) == 2
    # the first file really was replaced when the second one failed ...
    assert first_target_at_failure[0] is not None
    assert first_target_at_failure[0] != before.get(calls[0])
    # ... and everything was rolled back afterwards
    assert snapshot(env.data_dir) == before
    assert listing(env.data_dir) == names


@pytest.mark.spec("FET-19")
def test_a_completed_run_replaces_the_whole_dataset(tmp_path):
    env = make_env(tmp_path)
    install_old_dataset(env.data_dir)
    old = snapshot(env.data_dir)
    env.run()
    new = snapshot(env.data_dir)
    assert set(new) == set(FILES) and all(new[n] != old[n] for n in FILES)
    assert listing(env.data_dir) == sorted([*FILES, "seed_names.txt"])


# -------------------------------------------- C-15: transport errors are retried (v2.14)

#: The transport errors that are retried (SPEC §6.4, C-15): RemoteProtocolError, ReadError, WriteError,
#: ConnectError and every TimeoutException (the 30 s timeout included).
RETRIED_ERRORS = [
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.ConnectError,
    httpx.TimeoutException,
    httpx.ReadTimeout,
    httpx.ConnectTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
]

#: HTTPErrors NOT in that list: one attempt, then the fetcher stops. CloseError and ProxyError are
#: transport errors too, so this also proves the list is explicit and not "every TransportError".
NOT_RETRIED_ERRORS = [
    httpx.LocalProtocolError,
    httpx.UnsupportedProtocol,
    httpx.DecodingError,
    httpx.TooManyRedirects,
    httpx.CloseError,
    httpx.ProxyError,
]


def raising(cls) -> Callable[[httpx.Request], Exception]:
    return lambda request: cls(f"simulated {cls.__name__}", request=request)


def gaps_between(attempts: list[Attempt]) -> list[float]:
    return [b.started - a.started for a, b in zip(attempts, attempts[1:])]


@pytest.mark.spec("FET-21")
@pytest.mark.spec("FET-16")
@pytest.mark.parametrize(
    "token",
    ["plcontinue", "llcontinue"],
    ids=["links-continuation", "three-key-continue-object"],
)
def test_transport_error_on_a_continuation_page_is_retried_and_pagination_continues(tmp_path, token):
    options = {"page_size": 1, "multi_continue": True}
    baseline = make_env(tmp_path / "baseline", **options)
    baseline.run()
    expected_files = snapshot(baseline.data_dir)
    expected_requests = [(r.lang, r.params) for r in baseline.wiki.requests]
    assert any(token in params for _, params in expected_requests)  # the scenario has that continuation

    flaky = Flaky(lambda a: a.failures == 0 and token in a.params)  # the first request carrying it
    env = make_env(tmp_path / "flaky", flaky=flaky, **options)
    env.run()  # the fetcher recovers and finishes

    assert flaky.failures == 1
    (index,) = flaky.failed_at
    failed, retried = flaky.attempts[index], flaky.attempts[index + 1]
    assert (retried.lang, retried.params) == (failed.lang, failed.params)  # the very same request ...
    assert token in retried.params and "continue" in retried.params  # ... including its continue object
    assert retried.started - failed.started == 5.0  # no response, so no Retry-After: the plain backoff
    # the wiki saw exactly the requests of the undisturbed run: no page skipped, none repeated
    assert [(r.lang, r.params) for r in env.wiki.requests] == expected_requests
    assert env.wiki.violations == []  # continue objects echoed back in full
    assert snapshot(env.data_dir) == expected_files  # byte for byte the same dataset
    assert all(gap >= 0.32 - 1e-9 for gap in gaps_between(flaky.attempts))  # C-10 spacing holds for retries


@pytest.mark.spec("FET-21")
@pytest.mark.spec("FET-15")
def test_persistent_transport_error_gives_up_after_six_attempts_and_keeps_the_old_dataset(tmp_path):
    flaky = Flaky(lambda a: "plcontinue" in a.params)  # every attempt at the first continuation page
    env = make_env(tmp_path, page_size=1, flaky=flaky)
    install_old_dataset(env.data_dir)
    before, names = snapshot(env.data_dir), listing(env.data_dir)

    with pytest.raises(fetcher.FetchError):
        env.run()

    failing = [a for a in flaky.attempts if "plcontinue" in a.params]
    assert len(failing) == 6  # the request plus five retries
    assert all(a.params == failing[0].params for a in failing)  # always the same request
    assert gaps_between(failing) == [5.0, 10.0, 20.0, 40.0, 80.0]
    assert snapshot(env.data_dir) == before  # old dataset intact
    assert listing(env.data_dir) == names  # no partial output, no staging left behind (C-9)


@pytest.mark.spec("FET-06")
@pytest.mark.parametrize("error", RETRIED_ERRORS, ids=lambda cls: cls.__name__)
def test_each_retried_transport_error_is_retried_with_the_same_request(tmp_path, error):
    flaky = Flaky(lambda a: a.failures == 0, error=raising(error))  # only the very first attempt fails
    env = make_env(tmp_path, flaky=flaky)
    env.run()

    assert flaky.failures == 1 and flaky.failed_at == [0]
    first, second = flaky.attempts[0], flaky.attempts[1]
    assert (second.lang, second.params) == (first.lang, first.params)
    assert second.started - first.started == 5.0
    assert read_out(env.data_dir)[0] == EXPECTED_GRAPH


@pytest.mark.spec("FET-06")
@pytest.mark.parametrize("error", NOT_RETRIED_ERRORS, ids=lambda cls: cls.__name__)
def test_other_http_errors_are_not_retried_and_write_nothing(tmp_path, error):
    flaky = Flaky(lambda a: True, error=raising(error))
    env = make_env(tmp_path, flaky=flaky)
    install_old_dataset(env.data_dir)
    before, names = snapshot(env.data_dir), listing(env.data_dir)

    with pytest.raises(fetcher.FetchError):
        env.run()

    assert len(flaky.attempts) == 1  # one attempt, then stop
    assert env.clock.sleeps == []  # and no backoff wait
    assert snapshot(env.data_dir) == before and listing(env.data_dir) == names


@pytest.mark.spec("FET-15")
def test_the_retry_cap_is_shared_by_every_cause_of_retry(tmp_path):
    # 503, 503, then three disconnects: five retries in all, so the sixth attempt is still allowed.
    flaky = Flaky(lambda a: a.n in {3, 4, 5})
    env = make_env(tmp_path / "five", flaky=flaky)
    env.wiki.scripted = [respond(503), respond(503)]
    env.run()
    assert gaps_between(flaky.attempts[:6]) == [5.0, 10.0, 20.0, 40.0, 80.0]
    assert read_out(env.data_dir)[0] == EXPECTED_GRAPH

    # 503 x3, then three disconnects: the sixth retry does not exist, the fetcher stops after 6 attempts.
    flaky = Flaky(lambda a: a.n in {4, 5, 6})
    env = make_env(tmp_path / "six", flaky=flaky)
    env.wiki.scripted = [respond(503)] * 3
    with pytest.raises(fetcher.FetchError):
        env.run()
    assert len(flaky.attempts) == 6
    assert listing(env.data_dir) == ["seed_names.txt"]
