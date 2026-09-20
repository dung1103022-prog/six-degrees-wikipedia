// The /share page (SPEC §5.6, FE-04):
//   1. read the names with getAll("p");
//   2. GET /api/path with exactly that list (the page never validates it);
//   3. valid=true  -> show the returned path, nothing else is called;
//   4. valid=false -> say the link is no longer valid and, with at least two names, run a NEW
//      search from p[0] to p[-1]; that search fails by `detail.code` like on the search page.
import { useEffect, useRef, useState } from "react";
import { fetchPath } from "../api/path";
import { searchPeople, type SearchFailure } from "../api/search";
import type { ErrorDetail, PersonMeta, SearchResponse } from "../api/types";
import GraphView from "../components/GraphView";
import PathList from "../components/PathList";
import SearchFailureView from "../components/SearchFailureView";
import { parseShareNames } from "../lib/shareUrl";
import { strings } from "../ui/strings";

interface Query {
  from: string;
  to: string;
}

type PathState =
  | { status: "loading" }
  | { status: "error"; reason: string } // /api/path itself failed: not an invalid link
  | { status: "valid"; people: PersonMeta[] }
  | { status: "invalid" };

type NewSearch =
  | { status: "none" }
  | { status: "loading"; query: Query }
  | { status: "done"; query: Query; response: SearchResponse }
  | { status: "failed"; query: Query; failure: SearchFailure };

export default function SharePage() {
  const [names] = useState(() => parseShareNames(window.location.search));
  const [path, setPath] = useState<PathState>({ status: "loading" });
  const [search, setSearch] = useState<NewSearch>({ status: "none" });
  const latest = useRef(0); // only the newest new-search may update the page
  const started = useRef(false); // /api/path is asked once per page load

  async function runSearch(query: Query): Promise<void> {
    const id = ++latest.current;
    setSearch({ status: "loading", query });
    const outcome = await searchPeople(query.from, query.to);
    if (id !== latest.current) return;
    setSearch(
      outcome.ok
        ? { status: "done", query, response: outcome.response }
        : { status: "failed", query, failure: outcome.failure },
    );
  }

  useEffect(() => {
    // Once per page load. React StrictMode runs effects twice in development; without this guard
    // /api/path would be asked twice. (No "cancelled" flag either: a flag set by the first run's
    // cleanup would discard the only answer that is ever asked for.)
    if (started.current) return;
    started.current = true;
    void (async () => {
      const outcome = await fetchPath(names);
      if (!outcome.ok) return setPath({ status: "error", reason: outcome.reason });
      if (outcome.response.valid) return setPath({ status: "valid", people: outcome.response.path });
      setPath({ status: "invalid" });
      if (names.length >= 2) void runSearch({ from: names[0]!, to: names[names.length - 1]! });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` never changes and runSearch only sets state
  }, [names]);

  function choose(param: ErrorDetail["param"], candidate: PersonMeta): void {
    if (search.status !== "failed") return;
    void runSearch({ ...search.query, [param]: candidate.name });
  }

  return (
    <main className="app-main">
      <h1>Six Degrees of Wikipedia</h1>
      {path.status === "loading" ? <div aria-live="polite">{strings.loading}</div> : null}
      {path.status === "error" ? <p role="alert">{strings.pathFailed(path.reason)}</p> : null}
      {path.status === "valid" ? <PathList people={path.people} /> : null}
      {path.status === "invalid" ? (
        <>
          <p role="status">{strings.invalidLink}</p>
          <NewSearchView search={search} onChoose={choose} />
        </>
      ) : null}
    </main>
  );
}

function NewSearchView({ search, onChoose }: { search: NewSearch; onChoose: (param: ErrorDetail["param"], candidate: PersonMeta) => void }) {
  if (search.status === "none") return null;
  const { from, to } = search.query;
  return (
    <section className="result">
      <p>{strings.newSearch(from, to)}</p>
      {search.status === "loading" ? <div aria-live="polite">{strings.searching}</div> : null}
      {search.status === "failed" ? <SearchFailureView failure={search.failure} onChoose={onChoose} /> : null}
      {search.status === "done" && search.response.found ? <PathList people={search.response.path} /> : null}
      {search.status === "done" && !search.response.found ? (
        <p role="status">{strings.noPath(search.response.from, search.response.to)}</p>
      ) : null}
      {search.status === "done" ? <GraphView response={search.response} /> : null}
    </section>
  );
}
