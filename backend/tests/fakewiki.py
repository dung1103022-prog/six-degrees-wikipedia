"""In-memory stand-in for the MediaWiki Action API, for the fetcher tests (SPEC §7.8, §0.2).

No sockets: it is served through ``httpx.MockTransport``. It renders the hand-authored fixtures in
``fixtures/mediawiki/*.json`` as ``formatversion=2`` responses, records every request, records a
*violation* whenever a request breaks a rule of SPEC §6.4 (method, ``format``/``formatversion``/
``maxlag``, more than 50 titles, a ``continue`` object that is not echoed back in full, the
per-step parameters), and can page its answers to force continuation.
"""
from __future__ import annotations

import json
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import httpx

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "mediawiki"

#: The continue object the fake returns for the multi-prop metadata request (FET-09).
METADATA_CONTINUE = {"llcontinue": "0", "picontinue": "9", "continue": "||info|description"}


def _decompose(value):
    """NFD every string of a JSON-like value (used to feed the fetcher un-normalised titles)."""
    if isinstance(value, str):
        return unicodedata.normalize("NFD", value)
    if isinstance(value, list):
        return [_decompose(v) for v in value]
    if isinstance(value, dict):
        return {_decompose(k): _decompose(v) for k, v in value.items()}
    return value


def load_wiki(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


class FakeClock:
    """Deterministic clock: ``sleep`` only advances time, nothing really waits."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@dataclass
class Recorded:
    lang: str
    method: str
    path: str
    params: dict[str, str]
    headers: httpx.Headers
    timeout: dict
    started: float


class FakeWiki:
    def __init__(
        self,
        data: dict,
        clock: FakeClock,
        *,
        page_size: int = 0,
        multi_continue: bool = False,
    ) -> None:
        """``page_size`` > 0 pages links/redirects answers; ``multi_continue`` splits the
        metadata answer in two responses with a three-key ``continue`` object."""
        self.data = data
        self.clock = clock
        self.page_size = page_size
        self.multi_continue = multi_continue
        self.requests: list[Recorded] = []
        self.violations: list[str] = []
        #: Pre-programmed answers, consumed one per request before normal handling.
        self.scripted: list[Callable[[httpx.Request], httpx.Response]] = []
        #: Added to every normal answer as the API's ``warnings`` object, when set.
        self.warnings: dict | None = None
        #: Serve every string of the answers in NFD, although lookups are by NFC title.
        self.emit_nfd = False
        self.max_in_flight = 0
        self._in_flight = 0

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self._handle)

    # ------------------------------------------------------------------ plumbing

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self._in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self._in_flight)
        try:
            rec = Recorded(
                lang=request.url.host.split(".")[0],
                method=request.method,
                path=request.url.path,
                params=dict(request.url.params.items()),
                headers=request.headers,
                timeout=dict(request.extensions.get("timeout", {})),
                started=self.clock.monotonic(),
            )
            self.requests.append(rec)
            self._check(rec)
            if self.scripted:
                return self.scripted.pop(0)(request)
            body = self._answer(rec)
            return httpx.Response(200, json=_decompose(body) if self.emit_nfd else body)
        finally:
            self._in_flight -= 1

    def _check(self, rec: Recorded) -> None:
        p = rec.params
        if rec.method != "GET":
            self.violations.append(f"method {rec.method}")
        if rec.path != "/w/api.php":
            self.violations.append(f"path {rec.path}")
        for key, want in (("format", "json"), ("formatversion", "2"), ("maxlag", "5")):
            if p.get(key) != want:
                self.violations.append(f"{key}={p.get(key)!r}, want {want!r}")
        if len([t for t in p.get("titles", "").split("|") if t]) > 50:
            self.violations.append("more than 50 titles in one request")

    def _require(self, rec: Recorded, **wanted: str) -> None:
        for key, want in wanted.items():
            if rec.params.get(key) != want:
                self.violations.append(f"{rec.params.get('prop')}: {key}={rec.params.get(key)!r}, want {want!r}")

    # -------------------------------------------------------------------- answers

    def _answer(self, rec: Recorded) -> dict:
        wiki = self.data[rec.lang]
        p = rec.params
        titles = [t for t in p.get("titles", "").split("|") if t]
        follow = p.get("redirects") == "1"
        normalized: list[dict] = []
        redirects: list[dict] = []
        ordered: list[str] = []
        for raw in titles:
            title = raw.replace("_", " ")
            if title != raw and {"from": raw, "to": title} not in normalized:
                normalized.append({"from": raw, "to": title})
            final = title
            if follow and title in wiki["redirects"]:
                final = wiki["redirects"][title]
                if {"from": title, "to": final} not in redirects:
                    redirects.append({"from": title, "to": final})
            if final not in ordered:
                ordered.append(final)

        existing = [t for t in ordered if t in wiki["pages"]]
        pages = {t: self._base(wiki, t) for t in ordered}
        props = set(p["prop"].split("|")) if p.get("prop") else set()
        cont: dict | None = None
        if props == {"links"}:
            self._require(rec, redirects="1")
            entries = [(t, link) for t in existing for link in wiki["pages"][t].get("links", [])]
            pages, cont = self._paged(entries, "plcontinue", p, pages, "links", lambda x: {"ns": 0, "title": x})
        elif props == {"redirects"}:
            self._require(rec, rdnamespace="0", rdlimit="max")
            if rec.lang == "ja":
                self._require(rec, redirects="1")
            entries = [
                (t, r)
                for t in existing
                for r in sorted(r for r, target in wiki["redirects"].items() if target == t)
            ]
            pages, cont = self._paged(
                entries, "rdcontinue", p, pages, "redirects", lambda x: {"pageid": 0, "ns": 0, "title": x}
            )
        elif props == {"pageimages", "info", "description", "langlinks"}:
            self._require(rec, pithumbsize="200", inprop="url", lllang="ja")
            pages, cont = self._metadata(wiki, p, pages, existing)
        elif props:
            self.violations.append(f"unexpected prop {sorted(props)}")

        query: dict = {}
        if normalized:
            query["normalized"] = normalized
        if redirects:
            query["redirects"] = redirects
        query["pages"] = list(pages.values())
        body: dict = {"batchcomplete": cont is None, "query": query}
        if cont:
            body["continue"] = cont
        if self.warnings:
            body["warnings"] = self.warnings
        return body

    @staticmethod
    def _base(wiki: dict, title: str) -> dict:
        info = wiki["pages"].get(title)
        if info is None:
            return {"ns": 0, "title": title, "missing": True}
        return {"pageid": info["pageid"], "ns": 0, "title": title}

    def _paged(self, entries, token_key, params, pages, page_key, make):
        offset = 0
        if token_key in params:
            offset = int(params[token_key])
            if params.get("continue") != "||":
                self.violations.append(f"{token_key} sent without the rest of the continue object")
        chunk = entries[offset : offset + self.page_size] if self.page_size else entries[offset:]
        nxt = offset + len(chunk)
        touched = set()
        for title, item in chunk:
            pages[title].setdefault(page_key, []).append(make(item))
            touched.add(title)
        if offset > 0:  # later responses only mention pages they add something to
            pages = {t: pg for t, pg in pages.items() if t in touched}
        cont = {token_key: str(nxt), "continue": "||"} if self.page_size and nxt < len(entries) else None
        return pages, cont

    def _metadata(self, wiki, params, pages, existing):
        lang = params.get("lllang")

        def langlinks(title: str) -> list[dict]:
            found = wiki["pages"][title].get("langlinks", {})
            return [{"lang": lang, "title": found[lang]}] if lang in found else []

        if "llcontinue" in params:  # second response of the multi-prop request
            for key, want in METADATA_CONTINUE.items():
                if params.get(key) != want:
                    self.violations.append(f"continue param {key} not echoed back: {params.get(key)!r}")
            out = {}
            for title in existing:
                if langlinks(title):
                    out[title] = {**self._base(wiki, title), "langlinks": langlinks(title)}
            return out, None

        for title in existing:
            info = wiki["pages"][title]
            page = pages[title]
            page["fullurl"] = page["canonicalurl"] = info["url"]
            if info.get("thumbnail"):
                page["thumbnail"] = {"source": info["thumbnail"], "width": 200, "height": 250}
            if info.get("description"):
                page["description"] = info["description"]
            if not self.multi_continue and langlinks(title):
                page["langlinks"] = langlinks(title)
        return pages, (dict(METADATA_CONTINUE) if self.multi_continue else None)
