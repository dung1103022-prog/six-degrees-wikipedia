"""Phase 3 fetcher (SPEC §6.4). Run by hand on the operator's machine, never on the server.

This is the only place in the project that calls the MediaWiki Action API. It reads
``<DATA_DIR>/seed_names.txt`` and writes ``graph.json``, ``people.json`` and ``aliases.json``
(SPEC §6.1–6.3) in five steps:

1. resolve the seeds to canonical English titles (enwiki)
2. outgoing links of every person (enwiki)
3. metadata and the ``ja`` langlink (enwiki)
4. English redirects (enwiki)
5. Japanese redirects and the resolution of the ja titles (jawiki)

Requests are strictly sequential (one ``httpx.Client`` in a plain loop, no asyncio), throttled,
identified by a User-Agent that carries the operator's contact (``WIKI_UA_CONTACT``), and retried
according to SPEC §6.4 (C-10, C-11, C-13; C-15: a dropped connection or a timeout is retried like a
429/5xx, within the same cap of 5 retries). The output is transactional at the level of the three
files (C-9, SPEC v2.8): it is validated against SPEC §6.5 in a staging directory first, and the
current dataset is only replaced once all three files were written and validated; a failure while
writing or replacing rolls back to the old dataset.

Run: ``WIKI_UA_CONTACT=you@example.org DATA_DIR=./data python fetcher.py``
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import sys
import tempfile
import time
import unicodedata
from collections.abc import Iterable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.data import DataValidationError, load_data
from app.resolver import AliasEntry

log = logging.getLogger("fetcher")

NAME = "SixDegreesPy"
VERSION = "0.1"
API_URL = "https://{lang}.wikipedia.org/w/api.php"
CONTACT_ENV = "WIKI_UA_CONTACT"

MAX_TITLES_PER_REQUEST = 50  # SPEC §6.4
MAXLAG = 5  # SPEC §6.4
TIMEOUT_SECONDS = 30.0  # C-10
MAX_RETRIES = 5  # C-10
BACKOFF_BASE_SECONDS = 5.0  # C-10: wait before retry n = max(Retry-After, 5 * 2^(n-1))
#: C-15 (v2.14): transport errors that are retried like a 429/5xx: the connection was dropped or could
#: not be made, or the request timed out (TimeoutException covers the 30 s timeout). The list is
#: explicit on purpose: any other HTTPError (LocalProtocolError, UnsupportedProtocol, DecodingError,
#: TooManyRedirects, and also CloseError, ProxyError, ...) is not retried. There is no response, so no
#: Retry-After: the wait is the plain backoff. They share the retry cap with every other cause.
RETRIED_TRANSPORT_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.ConnectError,
    httpx.TimeoutException,
)
#: C-10 (v2.10, v2.11): gap between two request starts. 0.32 s is both the default and the smallest
#: value accepted: at most 187.5 requests a minute, under the 200 requests/minute Wikimedia allows
#: unauthenticated clients with a compliant User-Agent. Anything smaller is rejected at start-up.
MIN_ALLOWED_INTERVAL = 0.32
DEFAULT_MIN_INTERVAL = 0.32

FILES = ("graph.json", "people.json", "aliases.json")


class FetchError(Exception):
    """The run must stop; nothing was written (or everything was rolled back)."""


class ConfigError(FetchError):
    """Invalid fetcher configuration; detected before any request."""


class MissingContactError(ConfigError):
    """``WIKI_UA_CONTACT`` is not set (C-13)."""


@dataclass(frozen=True)
class FetcherConfig:
    min_interval: float = DEFAULT_MIN_INTERVAL

    def __post_init__(self) -> None:
        if not self.min_interval >= MIN_ALLOWED_INTERVAL:  # also rejects NaN
            raise ConfigError(
                f"min interval between requests must be at least {MIN_ALLOWED_INTERVAL} s "
                f"(got {self.min_interval}); Wikimedia allows 200 requests/minute"
            )


class SystemClock:
    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def require_contact(environ: Mapping[str, str]) -> str:
    contact = (environ.get(CONTACT_ENV) or "").strip()
    if not contact:
        raise MissingContactError(
            f"{CONTACT_ENV} is not set: set it to the operator's e-mail or URL; "
            "no request was sent (SPEC §6.4, C-13)"
        )
    return contact


def user_agent(contact: str) -> str:
    return f"{NAME}/{VERSION} ({contact}) httpx/{httpx.__version__}"


def build_client(contact: str, *, transport: httpx.BaseTransport | None = None) -> httpx.Client:
    """One synchronous client: GET only, no authentication, gzip is httpx's default."""
    return httpx.Client(
        headers={"User-Agent": user_agent(contact)},
        timeout=TIMEOUT_SECONDS,
        transport=transport,
    )


# ------------------------------------------------------------------------- API access


def _retry_after(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    try:
        return max(0.0, float(raw)) if raw is not None else None
    except ValueError:
        log.warning("ignoring a Retry-After that is not a number of seconds: %r", raw)
        return None


def _merge_query(acc: dict, chunk: Mapping) -> None:
    """Fold one continuation response into the accumulated ``query`` object."""
    pages: dict[str, dict] = acc["pages"]
    for page in chunk.get("pages", []):
        target = pages.setdefault(page["title"], {})
        for key, value in page.items():
            if isinstance(value, list) and isinstance(target.get(key), list):
                target[key].extend(value)
            else:
                target[key] = value
    for key in ("normalized", "redirects"):
        known = acc[key]
        known.extend(item for item in chunk.get(key, []) if item not in known)


class MediaWikiApi:
    """Sequential, throttled, retrying access to the Action API (SPEC §6.4)."""

    def __init__(self, client: httpx.Client, config: FetcherConfig, clock) -> None:
        self._client = client
        self._config = config
        self._clock = clock
        self._last_start: float | None = None
        # Counters for the pilot measurements (requests are counted per attempt, retries included).
        self.step = 0
        self.requests = 0
        self.retries = 0
        self.requests_by_step: dict[int, int] = {}

    def _throttle(self) -> None:
        now = self._clock.monotonic()
        if self._last_start is not None:
            wait = self._last_start + self._config.min_interval - now
            if wait > 0:
                self._clock.sleep(wait)
                now = self._clock.monotonic()
        self._last_start = now

    @staticmethod
    def _judge(lang: str, response: httpx.Response) -> tuple[dict | None, str]:
        """``(body, "")`` for a success, ``(None, reason)`` for a response that is retried, and a
        ``FetchError`` for one that is not."""
        status = response.status_code
        if status == 429 or 500 <= status < 600:
            return None, f"HTTP {status}"
        if status != 200:
            raise FetchError(f"HTTP {status} from {lang}.wikipedia.org; not retried")
        try:
            body = response.json()
        except ValueError as exc:
            raise FetchError(f"{lang}.wikipedia.org sent a body that is not JSON") from exc
        if not isinstance(body, dict):
            raise FetchError(f"{lang}.wikipedia.org sent a JSON body that is not an object")
        error = body.get("error")
        if error is None:
            if body.get("warnings"):
                log.warning("API warnings from %s.wikipedia.org: %s", lang, body["warnings"])
            return body, ""
        if not (isinstance(error, dict) and error.get("code") == "maxlag"):
            raise FetchError(f"API error from {lang}.wikipedia.org: {error}; not retried")
        return None, "maxlag"

    def request(self, lang: str, params: Mapping[str, str]) -> dict:
        """One API call with retries. Every response, HTTP 200 included, is checked for an
        ``error`` object before it counts as a success. A retry sends the very same request
        (same URL and parameters, so the same ``continue`` object) and every cause of retry
        (429, 5xx, maxlag, transport error) draws on one cap of ``MAX_RETRIES``."""
        url = API_URL.format(lang=lang)
        full = {"format": "json", "formatversion": "2", "maxlag": str(MAXLAG), **params}
        retries = 0
        while True:
            self._throttle()
            self.requests += 1
            self.requests_by_step[self.step] = self.requests_by_step.get(self.step, 0) + 1
            response: httpx.Response | None = None
            try:
                response = self._client.get(url, params=full)
            except RETRIED_TRANSPORT_ERRORS as exc:  # C-15: no response, so no Retry-After
                reason = f"transport error {type(exc).__name__}: {exc}"
            except httpx.HTTPError as exc:
                raise FetchError(f"request to {lang}.wikipedia.org failed: {exc!r}") from exc
            else:
                body, reason = self._judge(lang, response)
                if body is not None:
                    return body
            retries += 1
            if retries > MAX_RETRIES:
                raise FetchError(f"giving up after {MAX_RETRIES} retries ({reason})")
            self.retries += 1
            retry_after = _retry_after(response) if response is not None else None
            wait = max(retry_after or 0.0, BACKOFF_BASE_SECONDS * 2 ** (retries - 1))
            log.warning("%s from %s.wikipedia.org; retry %d/%d in %.1f s", reason, lang, retries, MAX_RETRIES, wait)
            self._clock.sleep(wait)

    def query(self, lang: str, params: Mapping[str, str]) -> dict:
        """Follow ``continue`` until it is gone, sending back the *whole* continue object, and
        merge the pieces. Returns ``{"pages": {title: page}, "normalized": [...], "redirects": [...]}``."""
        merged: dict = {"pages": {}, "normalized": [], "redirects": []}
        cont: dict[str, str] = {}
        seen: set[tuple] = set()
        while True:
            body = self.request(lang, {**params, **cont})
            _merge_query(merged, body.get("query") or {})
            following = body.get("continue")
            if not following:
                return merged
            cont = {key: str(value) for key, value in following.items()}
            marker = tuple(sorted(cont.items()))
            if marker in seen:
                raise FetchError(f"continuation did not advance: {cont}")
            seen.add(marker)


def _batches(titles: Sequence[str]) -> Iterator[list[str]]:
    for start in range(0, len(titles), MAX_TITLES_PER_REQUEST):
        yield list(titles[start : start + MAX_TITLES_PER_REQUEST])


# ------------------------------------------------------------------------------ data


@dataclass(frozen=True)
class Metadata:
    thumbnail: str | None
    wiki_url: str
    description: str | None
    ja_langlink: str | None


def read_seed_names(path: Path) -> list[str]:
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        raise FetchError(f"seed file not found: {path}") from None
    seen: set[str] = set()
    names: list[str] = []
    for line in text.splitlines():
        name = nfc(line.strip())
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    if not names:
        raise FetchError(f"seed file has no names: {path}")
    return names


def build_graph(
    canonical: Iterable[str],
    links: Mapping[str, Sequence[str]],
    redirect_targets: Mapping[str, str],
) -> dict[str, list[str]]:
    """Directed, closed graph over the canonical set (G-1..G-5). A link to a redirect page counts
    as a link to the redirect's target; links outside the set and self-loops are dropped."""
    names = set(canonical)
    graph: dict[str, list[str]] = {}
    for source in sorted(names):
        targets: set[str] = set()
        for title in links.get(source, ()):
            target = title if title in names else redirect_targets.get(title)
            if target in names and target != source:
                targets.add(target)
        graph[source] = sorted(targets)
    return graph


def build_ja_aliases(langlinks: Mapping[str, str], query: Mapping) -> list[AliasEntry]:
    """SPEC §6.4 step 5. ``langlinks`` maps target -> the ja title found on enwiki; ``query`` is
    the jawiki answer for those titles (``redirects=1`` + ``prop=redirects``).

    - langlink title missing on jawiki: dropped and logged;
    - langlink title is itself a redirect (C-6): ``ja_title`` is the destination article and the
      original title becomes a ``ja_redirect``;
    - every redirect of the resolved article becomes a ``ja_redirect`` of *each* target that has
      it as ``ja_title`` (conflicts are kept, not resolved).
    """
    normalized = {nfc(n["from"]): nfc(n["to"]) for n in query.get("normalized", [])}
    redirects = {nfc(r["from"]): nfc(r["to"]) for r in query.get("redirects", [])}
    pages = {nfc(title): page for title, page in query.get("pages", {}).items()}
    entries: set[AliasEntry] = set()
    for target, raw in sorted(langlinks.items()):
        title = normalized.get(nfc(raw), nfc(raw))
        resolved = redirects.get(title, title)
        page = pages.get(resolved)
        if page is None or page.get("missing") or page.get("invalid"):
            log.warning("ja langlink dropped: %r of %r does not exist on jawiki", raw, target)
            continue
        entries.add(AliasEntry(resolved, target, "ja_title"))
        if title != resolved:
            entries.add(AliasEntry(title, target, "ja_redirect"))
        for redirect in page.get("redirects", []):
            entries.add(AliasEntry(nfc(redirect["title"]), target, "ja_redirect"))
    return sorted(entries, key=_alias_key)


def _alias_key(entry: AliasEntry) -> tuple[str, str, str]:
    return (entry.alias, entry.target, entry.source)


def build_aliases(
    en_redirects: Mapping[str, Sequence[str]], ja_aliases: Iterable[AliasEntry]
) -> tuple[list[AliasEntry], int]:
    """All alias entries of the dataset, sorted, and how many were dropped.

    C-8 (SPEC v2.12): an entry whose alias equals its target (exactly, after NFC) is not a data
    error; it is simply not written. The canonical identity is unchanged. Real case: jawiki has a
    redirect named ``Albert Einstein`` that points at Einstein's article."""
    entries = {AliasEntry(nfc(alias), nfc(target), "en_redirect") for target, names in en_redirects.items() for alias in names}
    entries.update(AliasEntry(nfc(e.alias), nfc(e.target), e.source) for e in ja_aliases)
    kept = {entry for entry in entries if entry.alias != entry.target}
    return sorted(kept, key=_alias_key), len(entries) - len(kept)


@dataclass(frozen=True)
class RunStats:
    """What a run did and cost; the measurements of the pilot (SPEC v2.12)."""

    people: int
    links: int
    raw_links: int
    aliases: int
    aliases_dropped_as_self: int
    requests: int
    retries: int
    requests_by_step: Mapping[int, int]
    seconds: float
    seconds_by_step: Mapping[int, float]
    file_bytes: Mapping[str, int]

    @property
    def total_bytes(self) -> int:
        return sum(self.file_bytes.values())


def format_stats(stats: RunStats) -> str:
    people = max(stats.people, 1)
    steps = range(1, 6)
    by_step_requests = ", ".join(f"step {n} {stats.requests_by_step.get(n, 0)}" for n in steps)
    by_step_seconds = ", ".join(f"step {n} {stats.seconds_by_step.get(n, 0.0):.1f}s" for n in steps)
    sizes = ", ".join(f"{name} {size} bytes" for name, size in stats.file_bytes.items())
    return "\n".join(
        [
            "fetch summary",
            f"  people {stats.people}, links {stats.links} ({stats.links / people:.1f} per person) "
            f"out of {stats.raw_links} raw links ({stats.raw_links / people:.1f} per person, "
            f"{stats.links / max(stats.raw_links, 1):.1%} inside the seed set)",
            f"  aliases {stats.aliases} ({stats.aliases / people:.1f} aliases per person), "
            f"dropped as alias == target {stats.aliases_dropped_as_self}",
            f"  requests {stats.requests} ({stats.requests / people:.2f} per person, retries {stats.retries}): {by_step_requests}",
            f"  seconds {stats.seconds:.1f} total ({stats.seconds / people:.2f} seconds per person): {by_step_seconds}",
            f"  size {sizes}; total {stats.total_bytes} bytes ({stats.total_bytes / people:.0f} bytes per person)",
        ]
    )


# --------------------------------------------------------------------------- output


def _dump(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _render_object(items: Iterable[tuple[str, object]]) -> str:
    """One key per line, so that a diff of the committed file stays readable."""
    lines = [f"{_dump(key)}:{_dump(value)}" for key, value in items]
    return "{\n" + ",\n".join(lines) + "\n}\n" if lines else "{}\n"


def render_graph(graph: Mapping[str, Sequence[str]]) -> str:
    return _render_object((name, list(adj)) for name, adj in sorted(graph.items()))


def render_people(people: Mapping[str, Metadata]) -> str:
    return _render_object(
        (name, {"thumbnail": m.thumbnail, "wiki_url": m.wiki_url, "description": m.description})
        for name, m in sorted(people.items())
    )


def render_aliases(aliases: Sequence[AliasEntry]) -> str:
    lines = [_dump({"alias": a.alias, "target": a.target, "source": a.source}) for a in aliases]
    return "[\n" + ",\n".join(lines) + "\n]\n" if lines else "[]\n"


def _write_file(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")


def _replace_file(src: Path, dst: Path) -> None:
    os.replace(src, dst)


def commit_dataset(data_dir: Path, texts: Mapping[str, str]) -> None:
    """C-9 (SPEC v2.8): stage, validate, then replace the whole dataset or leave the old one.

    Not covered by the guarantee: a crash or power loss exactly in the middle of the
    replacement of the three files."""
    staging = Path(tempfile.mkdtemp(prefix=".fetch-staging-", dir=data_dir))
    try:
        new, old = staging / "new", staging / "old"
        new.mkdir()
        old.mkdir()
        for name in FILES:
            _write_file(new / name, texts[name])
        try:
            load_data(new)  # the checks of SPEC §6.5
        except DataValidationError as exc:
            raise FetchError(f"output failed the validation of SPEC §6.5, nothing written: {exc}") from exc
        _install(new, old, data_dir)
    except OSError as exc:
        raise FetchError(f"could not stage the new dataset, nothing written: {exc}") from exc
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def _install(new: Path, old: Path, data_dir: Path) -> None:
    existing = [name for name in FILES if (data_dir / name).exists()]
    for name in existing:  # a copy of the current dataset; production is not touched yet
        shutil.copy2(data_dir / name, old / name)
    touched: list[str] = []
    try:
        for name in FILES:
            touched.append(name)
            _replace_file(new / name, data_dir / name)
    except BaseException as exc:  # also Ctrl-C while the fetcher is running normally
        _rollback(data_dir, old, existing, touched)
        if isinstance(exc, OSError):
            raise FetchError(f"could not install the new dataset, rolled back: {exc}") from exc
        raise


def _rollback(data_dir: Path, old: Path, existing: Sequence[str], touched: Sequence[str]) -> None:
    problems: list[str] = []
    for name in reversed(touched):
        target = data_dir / name
        try:
            if name in existing:
                os.replace(old / name, target)
            elif target.exists():
                target.unlink()
        except OSError as exc:
            problems.append(f"{name}: {exc}")
    if problems:
        raise FetchError("ROLLBACK FAILED, data/ may be inconsistent: " + "; ".join(problems))


# ------------------------------------------------------------------------------ run


class Fetcher:
    def __init__(self, data_dir: Path | str, client: httpx.Client, config: FetcherConfig, clock=None) -> None:
        self.data_dir = Path(data_dir)
        self._clock = clock if clock is not None else SystemClock()
        self._api = MediaWikiApi(client, config, self._clock)
        self._seconds_by_step: dict[int, float] = {}

    @contextmanager
    def _step(self, number: int) -> Iterator[None]:
        self._api.step = number
        began = self._clock.monotonic()
        try:
            yield
        finally:
            self._seconds_by_step[number] = self._clock.monotonic() - began

    def run(self) -> RunStats:
        began = self._clock.monotonic()
        seeds = read_seed_names(self.data_dir / "seed_names.txt")
        with self._step(1):
            canonical = self.resolve_seeds(seeds)
        if not canonical:
            raise FetchError("none of the seeds resolved to an article; refusing to replace the dataset")
        with self._step(2):
            links = self.fetch_links(canonical)
        with self._step(3):
            metadata = self.fetch_metadata(canonical)
        with self._step(4):
            redirects = self.fetch_en_redirects(canonical)
        with self._step(5):
            ja_aliases = self.fetch_ja_aliases(
                {name: m.ja_langlink for name, m in metadata.items() if m.ja_langlink}
            )

        redirect_targets = {alias: target for target, aliases in redirects.items() for alias in aliases}
        graph = build_graph(canonical, links, redirect_targets)
        aliases, dropped = build_aliases(redirects, ja_aliases)
        texts = {
            "graph.json": render_graph(graph),
            "people.json": render_people(metadata),
            "aliases.json": render_aliases(aliases),
        }
        commit_dataset(self.data_dir, texts)
        stats = RunStats(
            people=len(graph),
            links=sum(len(adj) for adj in graph.values()),
            raw_links=sum(len(titles) for titles in links.values()),
            aliases=len(aliases),
            aliases_dropped_as_self=dropped,
            requests=self._api.requests,
            retries=self._api.retries,
            requests_by_step=dict(self._api.requests_by_step),
            seconds=self._clock.monotonic() - began,
            seconds_by_step=dict(self._seconds_by_step),
            file_bytes={name: len(text.encode("utf-8")) for name, text in texts.items()},
        )
        log.info("%s", format_stats(stats))
        return stats

    # Step 1 ------------------------------------------------------------------------
    def resolve_seeds(self, seeds: Sequence[str]) -> list[str]:
        canonical: set[str] = set()
        for batch in _batches(seeds):
            result = self._api.query("en", {"action": "query", "titles": "|".join(batch), "redirects": "1"})
            for title, page in result["pages"].items():
                if page.get("missing") or page.get("invalid") or page.get("special"):
                    log.warning("seed dropped, no such article: %r", title)
                else:
                    canonical.add(nfc(title))
        return sorted(canonical)

    # Step 2 ------------------------------------------------------------------------
    def fetch_links(self, canonical: Sequence[str]) -> dict[str, list[str]]:
        links: dict[str, list[str]] = {name: [] for name in canonical}
        for batch in _batches(canonical):
            result = self._api.query(
                "en",
                {
                    "action": "query",
                    "prop": "links",
                    "titles": "|".join(batch),
                    "pllimit": "max",
                    "redirects": "1",
                },
            )
            for title, page in result["pages"].items():
                if nfc(title) in links:
                    links[nfc(title)].extend(nfc(link["title"]) for link in page.get("links", []))
        return links

    # Step 3 ------------------------------------------------------------------------
    def fetch_metadata(self, canonical: Sequence[str]) -> dict[str, Metadata]:
        metadata: dict[str, Metadata] = {}
        for batch in _batches(canonical):
            result = self._api.query(
                "en",
                {
                    "action": "query",
                    "prop": "pageimages|info|description|langlinks",
                    "titles": "|".join(batch),
                    "pithumbsize": "200",
                    "inprop": "url",
                    "lllang": "ja",
                    "lllimit": "max",
                },
            )
            for title, page in result["pages"].items():
                if page.get("missing"):
                    raise FetchError(f"article disappeared while fetching metadata: {title!r}")
                url = page.get("canonicalurl") or page.get("fullurl")
                if not url:
                    raise FetchError(f"the API returned no URL (inprop=url) for {title!r}")
                ja = next((ll["title"] for ll in page.get("langlinks", []) if ll.get("lang") == "ja"), None)
                metadata[nfc(title)] = Metadata(
                    thumbnail=(page.get("thumbnail") or {}).get("source") or None,
                    wiki_url=url,
                    description=page.get("description") or None,
                    ja_langlink=nfc(ja) if ja else None,
                )
        return metadata

    # Step 4 ------------------------------------------------------------------------
    def fetch_en_redirects(self, canonical: Sequence[str]) -> dict[str, list[str]]:
        redirects: dict[str, list[str]] = {}
        for batch in _batches(canonical):
            result = self._api.query(
                "en",
                {
                    "action": "query",
                    "prop": "redirects",
                    "titles": "|".join(batch),
                    "rdnamespace": "0",
                    "rdlimit": "max",
                },
            )
            for title, page in result["pages"].items():
                redirects[nfc(title)] = [nfc(r["title"]) for r in page.get("redirects", [])]
        return redirects

    # Step 5 ------------------------------------------------------------------------
    def fetch_ja_aliases(self, langlinks: Mapping[str, str]) -> list[AliasEntry]:
        if not langlinks:
            return []
        titles = sorted(set(langlinks.values()))
        merged: dict = {"pages": {}, "normalized": [], "redirects": []}
        for batch in _batches(titles):
            result = self._api.query(
                "ja",
                {
                    "action": "query",
                    "prop": "redirects",
                    "titles": "|".join(batch),
                    "redirects": "1",
                    "rdnamespace": "0",
                    "rdlimit": "max",
                },
            )
            merged["pages"].update(result["pages"])  # titles are unique across batches
            for key in ("normalized", "redirects"):
                merged[key].extend(item for item in result[key] if item not in merged[key])
        return build_ja_aliases(langlinks, merged)


# ------------------------------------------------------------------------------ CLI


def main(argv: Sequence[str] | None = None, *, environ: Mapping[str, str] | None = None, transport=None, clock=None) -> int:
    environ = os.environ if environ is None else environ
    parser = argparse.ArgumentParser(description="Fetch graph.json, people.json and aliases.json (SPEC §6.4).")
    parser.add_argument("--data-dir", help="defaults to $DATA_DIR, then ./data")
    parser.add_argument(
        "--min-interval",
        type=float,
        default=DEFAULT_MIN_INTERVAL,
        help=f"seconds between two request starts; at least {MIN_ALLOWED_INTERVAL} (the default)",
    )
    args = parser.parse_args(argv)
    try:
        config = FetcherConfig(min_interval=args.min_interval)
        contact = require_contact(environ)
        data_dir = Path(args.data_dir or environ.get("DATA_DIR") or "./data")
        with build_client(contact, transport=transport) as client:
            Fetcher(data_dir, client, config, clock).run()
    except FetchError as exc:
        log.error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(main())
