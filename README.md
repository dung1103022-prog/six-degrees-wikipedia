# Six Degrees of Wikipedia (Python)

Find the shortest chain of Wikipedia links between two people — in English or Japanese — with an
animated graph, shareable permalinks, and zero calls to Wikipedia at request time.

A from-scratch Python/TypeScript reimplementation of the idea behind
[`Rani-Codes/sixth_degree`](https://github.com/Rani-Codes/sixth_degree) (originally Go + React), built
against a written implementation spec ([`SPEC.md`](./SPEC.md)) rather than ad hoc.

## What it does

- BFS shortest path over a precomputed graph of people from English Wikipedia (`GET /api/search`).
- Accepts English **and** Japanese input — canonical titles, English redirects, and Japanese
  titles/redirects all resolve to the same person (`GET /api/resolve`).
- An animated graph (Sigma.js + Graphology) reveals the search level by level as it "completes".
- A share link (`/share?p=A&p=B&...`) re-validates the path server-side and injects Open Graph
  preview tags for chat apps that don't run JavaScript — no image generation, no database.
- Search history lives in the browser (`localStorage`), capped at 20 entries.

## Current status

Phases 1–4 of the spec are complete: data loader + BFS + resolver + API, `/share`, the fetcher, and
the React frontend with a Docker image that serves all of it from one container. Two post-release
maintenance items (a Windows-only test-network-guard fix and a dependency bump that silenced two
`TestClient` deprecation warnings) are also in, tagged `v1.0.1`.

| | |
|---|---|
| Official dataset | **9,997 people · 427,057 directed edges · 119,335 aliases** |
| Automated tests | **383** (280 backend `pytest` + 103 frontend `vitest`), all traced to a SPEC test ID |
| Backend | Python 3.12, FastAPI 0.141, Pydantic 2.13, no database |
| Frontend | React 19 + TypeScript + Vite, Sigma.js 3 + Graphology for the graph |
| Deploy | One `python:3.12-slim` container; dataset and frontend build baked in at image build time |

## Quick start

### Docker (closest to production)

```bash
docker build -t sixth-degree .
docker run --rm -p 8000:8000 sixth-degree
# open http://localhost:8000
```

The image bundles the official dataset and the built frontend; it never calls the network at
runtime (see [Architecture](#architecture)).

### Local development

```bash
# backend — from backend/
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -e ".[test]"
DATA_DIR=../data DIST_DIR=../frontend/dist uvicorn app.main:create_app --factory --reload

# frontend — from frontend/, in another shell
npm install
npm run dev
```

Running the fetcher yourself (`backend/fetcher.py`) is optional and only needed to regenerate the
dataset; it requires `WIKI_UA_CONTACT` to be set (see `SPEC.md` §6.4) and is never run by the app
or the Docker build.

## Architecture

```
Browser (React SPA, Sigma.js)
   │  HTTP: SPA · /api/* · /share
   ▼
FastAPI backend  ──serves──► dist/ (built SPA, static + SPA fallback)
   │
   ├── GET /api/search, /api/resolve, /api/path  (SPA calls only /api/search and /api/path)
   ├── GET /api/people, /share
   │
   ├── Resolver  (EN/JA input → canonical name, pure, in-RAM)
   ├── BFS / Graph  (shortest path, pure, in-RAM)
   │
   ▼
Dataset JSON, read-only, loaded into RAM
   graph.json · people.json · aliases.json
   ▲
   │  COPY at Docker build time (never at runtime)
data/*.json (repo)
   ▲
   │  writes only these files, offline
Fetcher (run by hand)  ──sequential, rate-limited──►  MediaWiki Action API
```

Browser also loads person thumbnails directly from the Wikimedia Image CDN — the only outbound
network call the *running* application ever makes (ADR-009). A full component-level diagram (built
with the `archify` tooling, not checked into this repo) covers this in more detail.

**Design constraints that shaped this** (see `SPEC.md` §1, ADR-001..014):

- **Stateless, no database.** History lives client-side; share links carry the whole path in the
  URL and get re-validated server-side (ADR-003, ADR-007).
- **Everything precomputed offline.** The fetcher is the *only* place that talks to MediaWiki. At
  runtime, `graph.json`/`people.json`/`aliases.json` are loaded once into RAM and never change
  until the process restarts (ADR-004, ADR-009).
- **One container.** A multi-stage Dockerfile builds the frontend with Node, then serves everything
  — API, `/share`, and the SPA — from a single `python:3.12-slim` process (ADR-012).
- **A single GET, not a WebSocket.** BFS over ~10k nodes finishes in milliseconds; the whole result
  goes back in one response and the frontend animates it client-side (ADR-005).

## Data pipeline

`backend/fetcher.py` is a ~690-line, single-purpose offline tool:

1. Resolve a seed list of names to canonical English Wikipedia titles.
2. Crawl outgoing links to build the directed graph (`redirects=1` so links to redirect pages still
   count).
3. Batch-fetch metadata (thumbnail, description, Wikipedia URL) and Japanese `langlinks`.
4. Fetch English redirects, then Japanese redirects for every Japanese title found — each becomes an
   alias entry with its source (`en_redirect` / `ja_title` / `ja_redirect`).
5. Validate all three output files together and swap them into `data/` only if every check passes
   (dataset-level transactional write — a partial or half-old/half-new `data/` is never left behind,
   even if the fetcher crashes partway through validation).

It runs strictly sequentially (one in-flight request at a time), paces itself at ≥0.32s between
requests (under Wikimedia's published rate limits, checked against their live policy pages before
the number was chosen), retries transport failures and `maxlag`/429/5xx with exponential backoff
capped at 5 retries, and refuses to start without an operator contact in its `User-Agent`.

## BFS and the name resolver

Two small, dependency-free modules carry all of the actual logic and are unit-tested without any
web framework in the loop:

- **`backend/app/graph.py`** — breadth-first search with a goal test on enqueue (stops the instant
  the target is discovered, not when it's dequeued), over a plain `dict[str, list[str]]` adjacency
  list. Determinism comes from the data (adjacency lists are pre-sorted, §6.1 G-5), not from the
  algorithm doing anything special.
- **`backend/app/resolver.py`** — turns free-text input (English, Japanese, a redirect, a title with
  full-width punctuation normalized by NFKC) into a canonical name, an `ambiguous` result with
  sorted candidates, or `unresolved`. Exact canonical match always wins; alias lookups only run if
  no canonical name matches; conflicting aliases are surfaced as ambiguity, never silently resolved
  to "whichever came first" (this took an explicit ADR — ADR-013 — plus 21 `RES-*` test cases to
  pin down every ordering edge case).

Both are pure functions over an in-RAM index built once at startup; no I/O, no network, no
framework dependency.

## Frontend / graph rendering

React + TypeScript + Vite, with Sigma.js (WebGL rendering) and Graphology (client-side graph
structure) drawing only what `SearchResponse` already contains — no extra endpoint or field exists
just to make the picture nicer. The graph:

- lays the found path out on concentric rings, one per BFS level, with the whole path on a single
  ray from the center;
- reveals one level at a time (`useLevelAnimation`, 400ms per level) as if the search were still
  running, even though the whole result already arrived in one response;
- fades unrelated explored nodes by distance from the start and staggers path labels onto three
  rows so a long path's names don't collide — both of which only surfaced in real Chrome + WebGL
  testing, since the unit tests mock Sigma out entirely (WebGL doesn't exist in the DOM test
  environment).

Sigma is explicitly kept out of the unit test suite (ADR-014): `graphData.test.ts` tests the pure
data transform, `graphView.test.tsx` tests what GraphView *asks* of a mocked Sigma, and everything
else mocks `GraphView` away completely.

## Testing

| | Tool | Count | Notes |
|---|---|---|---|
| Backend | `pytest` | 280 | Fixtures only, no real dataset, no network (a socket guard fails any test that tries) |
| Frontend | `vitest` + Testing Library | 103 | `fetch` unmocked in a test = test failure; no real Sigma/WebGL |

Every test that locks down a piece of the contract carries `@pytest.mark.spec("ID")` or a `@spec
ID` tag matching an ID defined in `SPEC.md` §7. A custom `conftest.py`/Vitest reporter reads the
*same* SPEC.md tables at test-collection time and fails the run if a required ID has no test, or if
a test references an ID that doesn't exist — so the spec and the test suite cannot silently drift
apart. There is no hand-maintained "list of tests to write" anywhere else in the repo.

Backend tests run against a small self-authored fixture graph, never the real ~10k-person dataset;
the fetcher's HTTP calls are mocked at the transport layer (`backend/tests/fakewiki.py`).

## Docker

Multi-stage build: `node:24-slim` builds the frontend (`npm run build`, which type-checks *and*
bundles), then everything needed at runtime — `backend/app`, the built `dist/`, and the three
dataset JSON files — is copied into a `python:3.12-slim` image. The `fetcher` and `test` dependency
extras (httpx, pytest, ...) are never installed into the runtime image; `python -c` reads
`pyproject.toml`'s own dependency list at build time so it can never drift from what's pinned there.
The container fails fast on startup if the dataset or frontend build is missing or invalid — there
is no code path that lets it limp along with partial data.

## Dataset

**9,997 people · 427,057 directed edges · 119,335 aliases** (98,578 English redirects, 12,347
Japanese redirects, 8,410 Japanese titles; 0 ambiguous match keys), generated from a 10,000-name
seed list (3 seeds merged because they were redirects of another seed).

## Technical challenges and how they were resolved

- **BFS over WebSocket streaming turned out to be solving a non-problem.** An earlier design
  streamed level-by-level BFS progress over a WebSocket to avoid a slow request. Once measured, BFS
  over ~10k nodes finishes in milliseconds — the WebSocket was pure complexity for a timing problem
  that didn't exist. Replaced with one `GET` and a client-side animation timer (ADR-005).
- **Multilingual name entry without a database or a runtime call to Wikipedia.** Users type English
  *or* Japanese names; the graph itself must stay pure English-Wikipedia data. Solved by
  precomputing every alias offline (English/Japanese redirects, Japanese `langlinks`) and resolving
  purely in RAM at request time — coverage is a property of what the fetcher already fetched, never
  a live lookup (ADR-013).
- **Ambiguous names must never be silently guessed.** Two people can share a redirect, or an alias
  can collide with someone else's canonical name. The resolver treats every such collision as
  `ambiguous` and returns *all* candidates, sorted, rather than picking "whichever came first" —
  verified by feeding every `(start, target)` pair in the test fixture through both the algorithm
  and a brute-force reference implementation (`RES-*`, `BFS-09`).
- **Fetcher output must never leave `data/` half-updated.** A crash or validation failure mid-fetch
  must not corrupt the dataset the running app depends on. Solved with a dataset-level transactional
  write: validate all three files together, stage them, and only then swap them into `data/`.
- **Wikimedia rate-limit policy isn't static.** Rather than hardcoding a number once, the SPEC
  records the actual policy pages checked and the date, with the fetcher's pacing (0.32s minimum
  between requests) derived from and staying safely under the *lower* of the documented limits —
  making a future policy change a one-line SPEC update, not an investigation.
- **A months-later dependency bump broke the test suite on Windows.** `conftest.py`'s network guard
  blocked all non-Unix-socket connections, which also blocked the loopback TCP pair Windows'
  `asyncio` needs internally — Windows CI had been running on an undocumented, out-of-repo shim.
  Fixed by allowing literal loopback addresses only (never resolving a hostname, since that would
  itself be network access) while keeping every other destination blocked; a fresh test file
  (`test_network_guard.py`) pins the fix down directly against the *installed* guard.
- **GraphView label overlap and clipping only showed up in a real browser.** Unit tests mock Sigma
  out entirely (by design — WebGL doesn't exist in jsdom), so a path whose labels collided, or whose
  last node's name got clipped by the canvas edge, passed every automated test while looking broken
  on screen. Found and fixed via manual Chrome + WebGL smoke testing at both desktop and mobile
  widths, then locked in with a label-staggering algorithm that adapts to how many rows are actually
  needed rather than a fixed two.

## Results

- All four implementation phases (data/BFS/resolver/API → `/share` → fetcher → frontend/Docker)
  shipped against a spec that was itself revised 15 times as real trade-offs surfaced during
  implementation, with every revision dated and attributed.
- 383 automated tests, 100% traced to a named requirement — no test exists that isn't pinned to a
  SPEC ID, and no required ID lacks a test.
- The official dataset (9,997 people, 427,057 edges, 119,335 aliases) was generated by the fetcher
  exactly as specified, with 0 ambiguous match keys.
- The whole application — API, share previews, static SPA — runs from a single Docker image with no
  database and no outbound network call other than the browser's own thumbnail requests.

## Remaining technical debt

- **Unapproved edge cases are intentionally unspecified**, not silently guessed at: whitespace-only
  search input (C-3), inputs over 255 characters (C-4), underscores in names (C-7) and one alias
  case (C-2) are documented as open decisions in `SPEC.md` §0.4/§9 rather than implemented on
  assumption — four test IDs (`API-17`, `API-08`, `DAT-10`, `DAT-15`) are deliberately excluded from
  required coverage until an owner decides.
- **`anyio` is pinned one release behind current** (4.14.2, not 4.15.x) purely to avoid a
  `TestClient`-only deprecation warning caused by `starlette` 1.6.0 not yet using anyio's new import
  path; worth revisiting once starlette catches up.
- **`SPEC.md`'s own "Nợ kỹ thuật còn lại" section still describes N-1/N-2 as unresolved** even
  though both were fixed in later maintenance commits (`8e88534`, `5e939f1`, tagged `v1.0.1`) — the
  SPEC changelog entry recording that hasn't been written yet.
- **Name resolution coverage is exactly what the fetcher fetched.** A name with no alias in the
  dataset simply doesn't resolve; there is no runtime fallback to Wikipedia by design (ADR-013), so
  widening coverage means re-running the fetcher, not shipping a code change.
- **Search history is per-browser** (`localStorage`, ADR-006) with no cross-device sync — an
  intentional scope cut (ADR-002/ADR-003), not an oversight.

## Documentation

- [`SPEC.md`](./SPEC.md) — the full implementation contract (Vietnamese): schemas, invariants,
  ADRs, every test ID. This repository's source of truth; code defers to it.
- [`docs/portfolio-en.md`](./docs/portfolio-en.md) / [`docs/portfolio-ja.md`](./docs/portfolio-ja.md)
  — portfolio write-ups of this project.

## Project structure

```
backend/
  app/           FastAPI app: api.py, data.py (loader/validation), graph.py (BFS),
                 resolver.py, schemas.py, share.py, static.py, main.py (factory)
  fetcher.py     offline MediaWiki crawler (run by hand, never in the Docker image)
  tests/         pytest, SPEC-ID-tagged, fixtures only
frontend/
  src/           React app: pages/, components/, graph/ (Sigma + Graphology), api/, lib/, ui/
  tests/         Vitest + Testing Library, @spec-tagged
data/            the official dataset (graph.json, people.json, aliases.json) — committed
SPEC.md          implementation contract / source of truth
Dockerfile       multi-stage build → single runtime image
```
