# Project Portfolio: Six Degrees of Wikipedia (Python)

**Role:** Solo project — I designed the architecture and data model, wrote and revised the
implementation spec through 15 versions, made every trade-off decision recorded in it, and directed
implementation against that spec using an AI coding agent (Claude Code) under test-first,
spec-traced discipline. No team; every architecture decision, ADR, and scope cut below is mine.

**Repository:** [github.com/dung1103022-prog/six-degrees-wikipedia](https://github.com/dung1103022-prog/six-degrees-wikipedia).
**Stack:** Python 3.12 / FastAPI, React 19 / TypeScript / `3d-force-graph` (Three.js), Docker.
**Status:** all four planned phases shipped; 415 automated tests passing (281 backend + 134
frontend); official dataset generated and committed. Last tagged release is `v1.0.3`; an English UI
switch, a Sigma.js→3d-force-graph rewrite, and Vercel deployment support have shipped since that
tag — this document describes current `HEAD`, not the tag.

---

## 1. Overview and goal

Six Degrees of Wikipedia answers one question: what's the shortest chain of Wikipedia links from
person A to person B? I rebuilt this from scratch (the idea comes from a reference project,
`Rani-Codes/sixth_degree`, in Go) as a Python/TypeScript system, with two goals I cared about more
than the graph puzzle itself:

1. **Practice spec-driven engineering end to end** — write a contract precise enough that
   implementation decisions stop being guesses, and keep it honest as reality (rate-limit policy,
   library deprecations, real-browser rendering) pushed back on my assumptions.
2. **Ship something that costs nothing to run.** No database, no background workers, no scheduled
   jobs, one small container — because this is a personal/learning-scope project (documented
   explicitly as ADR-002), not a production service with a budget.

The result also had to work for **both English and Japanese name input**, since that's the audience
I wanted to be able to use it.

## 2. The core technical problem

Three things pulled against each other from the start:

- Users type names casually — "Abe Shinzo", "安倍晋三", "安倍 晋三" — but the graph has to stay pure
  English-Wikipedia data, or every downstream algorithm gets more complicated.
- I explicitly ruled out a database or a cache server (cost/complexity, ADR-002/ADR-003) *and* ruled
  out calling Wikipedia at request time (rate limits, latency, a production dependency on a service
  I don't control, ADR-009).
- The search still had to feel instant, with a UI that shows its work rather than just a spinner.

That combination is what drove the two biggest design decisions: **precompute everything offline,
resolve purely in RAM**, and **one HTTP response instead of a WebSocket** (details below).

## 3. Architecture

```
Browser (React SPA, 3d-force-graph/Three.js)
   │  HTTP: SPA · /api/* · /share
   ▼
FastAPI backend ──serves──► dist/ (built SPA: static files + SPA fallback)
   │
   ├─ GET /api/search, /api/path   (the search + share flow the SPA actually calls)
   ├─ GET /api/people               (PersonCombobox autocomplete only — one call, client-cached)
   ├─ GET /api/resolve, /share      (public API / share-preview)
   │
   ├─ Resolver (pure, in-RAM)   EN/JA text → canonical name
   ├─ BFS / Graph (pure, in-RAM)  shortest path
   ▼
Dataset JSON, read-only, loaded once into RAM
   graph.json · people.json · aliases.json
   ▲  COPY'd in at Docker build time — never touched at runtime
data/*.json (repo)
   ▲  written only by the offline fetcher
Fetcher (run by hand, sequential, rate-limited) → MediaWiki Action API

Deployment: one Dockerfile (multi-stage, digest-pinned). `Dockerfile.vercel` is a git symlink to
it, so Vercel's Fluid Compute builds and runs the exact same image (listens on $PORT).
```

The browser also fetches person thumbnails directly from Wikimedia's image CDN — by design, the
*only* outbound network call the running application ever makes (ADR-009). Everything else in the
diagram above is a single Python process serving one container, deployed both as a self-hosted
Docker container and on Vercel.

I chose this shape for three reasons I'd stand behind again:

- **Statelessness kills a whole category of ops work.** No database means no migrations, no backup
  strategy, no connection pool tuning — for a project I run and pay for personally, that's not a
  minor convenience, it's the difference between "I can leave this running" and "I have to babysit
  it."
- **One container, one deploy.** A multi-stage Dockerfile builds the frontend with Node and throws
  Node away; the runtime image is `python:3.12-slim` plus the built static files plus three JSON
  files. There's exactly one thing to deploy and one thing that can be down.
- **Fail fast, not fail weird.** If the dataset or the frontend build is missing or invalid at
  startup, the process refuses to start. I'd rather get a crash-loop I can see in `docker logs` than
  a container that's "up" and quietly serving broken pages.

## 4. Data pipeline

`backend/fetcher.py` (~690 lines) is the only part of the system that ever talks to Wikipedia, and
it never runs in production — it's a tool I run by hand on my own machine when I want to regenerate
the dataset. It:

1. resolves a seed list of names to canonical English titles (handling redirects and Wikipedia's own
   title normalization);
2. crawls outbound links (with `redirects=1`, so a link to a redirect page still counts) to build the
   directed graph;
3. batch-fetches metadata — thumbnail, description, canonical URL, Japanese `langlinks` — 50 titles
   per request instead of one-at-a-time;
4. fetches English redirects, then Japanese redirects for every Japanese title it found, tagging each
   alias with where it came from (`en_redirect` / `ja_title` / `ja_redirect`);
5. validates all three output files as a set and only replaces `data/` if every check passes.

The parts I spent the most care on weren't the happy path — they were the failure modes:

- **Pacing derived from an actual policy check, not a guess.** I read Wikimedia's Robot policy and
  rate-limit pages, recorded the date I checked them and what they said in the spec, and picked
  0.32s between requests specifically because it sits under *both* documented limits with margin.
  When Wikimedia's policy changes, that's a one-line spec update with a clear paper trail, not an
  archaeology exercise six months later.
- **Every response gets checked for a hidden error, not just the HTTP status.** MediaWiki can return
  HTTP 200 with a `maxlag` error buried in the JSON body. Missing that would make the fetcher think
  a failed request succeeded.
- **Transport failures get retried; protocol failures don't.** A dropped connection is worth retrying
  with backoff; a malformed request or unsupported protocol isn't going to fix itself on retry 2. I
  enumerated exactly which `httpx` exceptions fall into each bucket rather than doing a blanket
  `except Exception: retry`.
- **The output is transactional at the dataset level.** All three files get validated together and
  staged before anything touches the real `data/` directory. If validation fails, or the process
  dies partway through, the dataset the running app depends on is never left half old / half new.

## 5. BFS and the name resolver

Both live in small, dependency-free modules I could unit-test without spinning up FastAPI, a
database, or any I/O — pure functions over plain Python data structures.

**BFS (`backend/app/graph.py`)** — nothing exotic: breadth-first search over a
`dict[str, list[str]]` adjacency list, with a goal test on *enqueue* rather than dequeue, so it stops
the instant the target is found instead of finishing the whole frontier first. Determinism doesn't
come from special-casing the algorithm; it comes from the data being pre-sorted before it ever
reaches BFS, which turned out to be a cleaner invariant to hold than trying to make traversal order
itself deterministic under all conditions.

**Resolver (`backend/app/resolver.py`)** is where most of the actual design thinking went, because
"just look it up in a dict" breaks the moment two different things can legitimately claim the same
input:

- Exact canonical match always wins, full stop — before any alias is even considered.
- If an input's normalized form matches more than one canonical name, or more than one alias target,
  that's `ambiguous`, and the response includes *every* candidate, sorted — never "whichever the
  dict iteration order happened to return first." I explicitly wrote tests that feed the same input
  through the resolver multiple times, and across different data-construction orders, to make sure
  dict-ordering nondeterminism could never leak into the answer.
- An alias belonging to person X that happens to normalize the same as person Y's canonical name
  resolves to Y — canonical identity always outranks an alias, even when the alias has an
  unambiguous target of its own. I picked this rule specifically because the opposite (alias wins)
  would let an unofficial redirect silently shadow someone's actual page title.

This is also where I hit the trickiest real bug of the project: Unicode normalization. Japanese
full-width spaces, NFKC-equivalent characters (`²` vs `2`), and the distinction between a name with
`_` versus a real space all needed an explicit, written rule (`match_key`), because "just compare
strings" gives different answers depending on which Unicode form happened to arrive first. I locked
the exact normalization algorithm into the spec as a one-line formula and tested it against the
specific inputs that had bitten me during manual testing, rather than leaving it as "whatever
`.lower()` happens to do."

## 6. Frontend and the graph view

React 19 + TypeScript + Vite. The display UI was originally Japanese; I switched it to English
(SPEC v2.16, after the `v1.0.3` tag) — the one exception is `og:title` from `/share`, which stays in
its original Japanese format on purpose, since that change was scoped to on-screen UI only.

The graph-rendering library changed too: at the `v1.0.3` tag it was Sigma.js (2D, WebGL canvas) +
Graphology; SPEC v2.17 replaced it with **`3d-force-graph`** (Three.js, WebGL) — a rotatable, zoomable
3D sphere. In both versions, the only data drawn is whatever `GET /api/search` already returned
(`levels`, `path`) — I deliberately didn't add a field or endpoint just to make the drawing nicer,
because that would mean the visualization could show something the API contract doesn't actually
promise.

The current graph:

- gives every node (path or explored) a fixed position on its BFS level's spherical shell — only the
  start node sits at the exact center (SPEC v2.18). The path is no longer a separate straight-ray
  layout, just a color/size distinction, so tracing it zigzags across the shells in BFS order;
- shows a hover tooltip with the person's name on any node (`3d-force-graph`'s own `nodeLabel`);
- supports drag-to-rotate and scroll/pinch-to-zoom (`OrbitControls`), plus arrow-key/WASD panning and
  a "Reset view" button that flies the camera back to its initial framing (SPEC v2.18);
- reveals one level at a time on a fixed timer, animating a result that actually arrived in a single
  HTTP response — the "streaming" feeling without an actual stream;
- mounts the "Network Visualization" panel even before a search runs, as an empty scene (SPEC v2.17)
  — it used to only mount after a result existed;
- turns each name in a found path into a link to that person's Wikipedia page (SPEC v2.17).

Two more UI pieces shipped after `v1.0.3` worth naming directly:

- **`PersonCombobox`** — client-only autocomplete on the Start/End fields, backed by one
  `GET /api/people` call (already existed, cached in the browser) filtered entirely client-side; no
  new backend route, per the explicit scope SPEC v2.16 allows.
- **The Search Log panel** — a client-side replay of the same `SearchResponse` the graph already has,
  timed to the same per-level reveal. Its "Connected"/"Disconnected" label means "a search is in
  flight or done," not an actual live connection — there is no socket behind it.

I kept WebGL out of the automated test suite on purpose in both eras (it doesn't exist in a DOM test
environment): the pure data-transform that builds the graph is unit-tested directly, the component
that wires it to the rendering library is tested against a hand-written fake class that records what
it was asked to draw, and every other test just mocks `GraphView` away entirely. That trade-off had a
real cost I had to pay for directly, described in the next section.

## 7. Testing

| | Tool | Count |
|---|---|---|
| Backend | `pytest` | 281 |
| Frontend | `vitest` + Testing Library | 134 |
| **Total** | | **415** |

The part I'm most satisfied with isn't the count — it's that every one of those tests is tied to a
named requirement, and the tie is enforced by tooling, not convention. Each test carries an ID
(`@pytest.mark.spec("BFS-04")` or a `@spec FE-03` tag) that has to match a row in a table inside
`SPEC.md` itself; a small piece of test infrastructure reads that table at collection time and fails
the run if a required ID has no test *or* if a test references an ID that doesn't exist. I built this
specifically so the spec and the test suite can't quietly drift apart the way a comment and the code
next to it usually do.

Two things I'd call out as genuinely useful decisions rather than just "wrote tests":

- **A socket-level network guard** fails any backend test that tries to reach out to a real network,
  not just the ones I remembered to mock. When I later hit a Windows-specific `asyncio` internal that
  needed loopback TCP, I fixed the guard to allow *only* literal loopback addresses (never resolving
  a hostname, since that would itself be a network call) instead of weakening it broadly — and wrote
  a dedicated test file that exercises the *installed* guard directly, so a regression here fails
  loudly.
- **GraphView bugs that never showed up in `vitest`, by construction** — WebGL is mocked out
  everywhere except one file, and that file mocks the rendering library too (just not `GraphView`).
  In the Sigma.js era I found real label-overlap and label-clipping bugs this way, at both a
  1440×900 and a 390×844 viewport. After the switch to `3d-force-graph`, the same blind spot let a
  black-screen crash through: the library defaults to `"trackball"` controls, which have no
  `.listenToKeyEvents`, so the WASD-pan feature threw the moment it mounted. Both times I found and
  verified the fix by loading the real app in Chrome with real WebGL — screenshots and console-error
  checks, not just "the unit tests still pass" — and locked the second one in with a regression test
  asserting `controlType: "orbit"` is actually passed.

## 8. Docker

One multi-stage `Dockerfile`: `node:24-slim` builds the frontend (`npm run build`, which
type-checks *and* bundles in one step), then a `python:3.12-slim` runtime image gets exactly
`backend/app`, the built `dist/`, and the three dataset JSON files copied in — nothing else. The
runtime image's Python dependencies are read straight out of `pyproject.toml`'s own dependency list
at build time, so the Dockerfile physically cannot drift from what's actually pinned for the app;
the `fetcher` and `test` extras (httpx, pytest) never make it into the runtime image at all. Changing
the dataset means rebuilding the image — there's no volume mount, no "hot reload the data" path, on
purpose.

Both base images (`node:24-slim`, `python:3.12-slim`) are pinned by digest, not just tag, so a
build today and a build next year use the exact same base layers. Behind a reverse proxy, `og:url`
still needs the request's real (HTTPS) scheme rather than the plain-HTTP connection uvicorn sees
from the proxy; uvicorn's own `FORWARDED_ALLOW_IPS` setting handles that, so an operator can name
the proxy's trusted IP/CIDR without any code change.

Since the `v1.0.3` tag, this also deploys to **Vercel's Fluid Compute**. Vercel detects containers
through a specifically-named `Dockerfile.vercel`, so rather than maintain a second Dockerfile I made
it a git symlink to the real `Dockerfile` — same build, same image, one extra deploy target, zero
duplicated logic.

## 9. Dataset

**9,997 people · 427,057 directed edges · 119,335 aliases** — 98,578 English redirects, 12,347
Japanese redirects, 8,410 Japanese titles — generated from a 10,000-name seed list (3 seeds merged
because they turned out to be redirects of another seed already in the list), with **0 ambiguous
match keys** in the final data. This is the dataset the fetcher I wrote actually produced, not a
sample or a mock.

## 10. Technical challenges and how I solved them

- **A WebSocket that was solving a problem I hadn't actually measured.** The original design idea
  streamed BFS progress over a WebSocket. Once I measured it, BFS over ~10k nodes takes single-digit
  milliseconds — the WebSocket was pure incidental complexity. I replaced it with one `GET` request
  and moved the "watch it search" feeling into a client-side animation timer instead. Cutting scope
  based on a measurement, not an assumption, is the decision I'd most want a reviewer to notice.
- **Multilingual input without a database or a live Wikipedia call.** Solved by moving all the
  expensive/uncertain work (finding every alias) into the offline fetcher, so the runtime resolver is
  just a pure in-RAM lookup. The trade-off I accepted explicitly: coverage is exactly what the
  fetcher found, with no live fallback — which I wrote down as a rejected alternative in the spec
  rather than leaving unstated.
- **Never letting the resolver guess.** Ambiguous names return every candidate, sorted, instead of
  silently picking one — verified by running every `(start, target)` pair in my test fixture through
  both the real algorithm and a brute-force reference implementation and comparing.
- **Dataset writes that can't half-corrupt a running system.** The fetcher validates and stages all
  three output files before touching `data/`, so a crash or a bad fetch can't leave the app reading
  an inconsistent graph.
- **A rate-limit number that could go stale silently.** I recorded the actual policy pages and the
  date I checked them directly in the spec next to the number derived from them, so a future policy
  change is a documented, one-line fix instead of a mystery "why is 0.32 the number" six months
  later.
- **A dependency upgrade months later broke tests on a platform I hadn't tested on.** Windows'
  `asyncio` needs a loopback TCP pair internally that my test suite's network guard was blocking
  outright, which had been silently papered over with an undocumented local shim. I fixed the guard
  itself — allow literal loopback only, still block everything else, no hostname resolution — and
  added a regression test that exercises the installed guard directly rather than a copy of it.
- **A bug class my own test suite structurally couldn't catch.** WebGL renderers need WebGL, so
  they're mocked out of every automated test by design (ADR-014) — which also means real-renderer-only
  bugs are invisible to `vitest` no matter how many tests I added. In the Sigma.js era that was label
  overlap and edge-clipping; after switching to `3d-force-graph`, it was a black-screen crash from the
  library's default `"trackball"` controls lacking the method the new WASD-pan feature called. I caught
  and fixed both classes by manually driving a real Chrome instance against the running app and
  checking the rendered pixels and console, not just the test output.
- **A graph-library swap and a UI-language switch, done without touching the HTTP contract.** After
  the `v1.0.3` tag, I moved the display UI from Japanese to English and replaced Sigma.js + Graphology
  with `3d-force-graph` (Three.js) for a rotatable 3D view — both scoped explicitly in the spec as
  implementation/visual decisions ADR-014 already left open, so neither one touched `/api/*` or
  `/share`'s actual contract.

## 11. Results

- All four planned phases shipped against a spec that's since gone through 18 revisions (currently
  `SPEC.md` v2.18) as real constraints (a rate-limit policy, a Unicode edge case, a library
  deprecation, rendering bugs only visible in a real browser, and — after `v1.0.3` — a UI-language
  switch and a full graph-library swap) pushed back on my assumptions — every revision dated and
  reasoned about in the spec's own changelog, not lost in commit messages.
- 415 automated tests (281 backend, 134 frontend), each traced to a named requirement, with tooling
  that fails the build if that traceability ever breaks in either direction.
- Deployed and verified in production on Vercel's Fluid Compute (`Dockerfile.vercel`, a git symlink
  to the same `Dockerfile`), in addition to self-hosted Docker.
- The fetcher I wrote produced the real, official dataset — 9,997 people, 427,057 edges, 119,335
  aliases, 0 ambiguous match keys — not a fixture or a sample.
- The entire system — API, share previews with server-rendered OG tags, and the SPA — runs from one
  Docker image, with no database and no outbound network call at runtime other than the visitor's own
  browser loading a thumbnail image.

## 12. What I'd still call unfinished

I'd rather list this honestly than let the "results" section stand alone:

- Several edge cases (whitespace-only search input, inputs over 255 characters, underscores in
  names) are **explicitly unspecified**, not silently handled — they're recorded as open decisions
  in the spec with the corresponding tests deliberately excluded from required coverage, rather than
  implemented on an assumption I hadn't actually decided on.
- One dependency (`anyio`) is pinned one release behind current purely to dodge a `TestClient`-only
  deprecation warning caused by a library I depend on (`starlette`) not yet updating its own import
  path — a workaround I'm tracking, not a permanent decision.
- The spec's own technical-debt section hasn't been updated yet to reflect that two items in it (a
  Windows test-network fix and the dependency bump above) were already resolved in later maintenance
  commits — a documentation gap I'm aware of, not an unknown one.
- Name coverage is exactly what the offline fetcher found; there's no live fallback to Wikipedia by
  design, so widening coverage is a data-refresh task, not a code change.
- Search history is per-browser only, with no account system or cross-device sync — a deliberate
  scope cut for a project with a "near-zero operating cost" constraint, not an oversight.
