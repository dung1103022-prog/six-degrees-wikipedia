// The search page (SPEC §3.2, ADR-005, FE-03). One GET /api/search per search; a failure is shown by
// `detail.code`; choosing a candidate of AMBIGUOUS_NAME searches again with its canonical name.
// The successful SearchResponse is kept in `view` (path and levels) for what draws it next.
import { useRef, useState, type FormEvent } from "react";
import { searchPeople, type SearchFailure } from "../api/search";
import type { ErrorDetail, PersonMeta, SearchResponse } from "../api/types";
import GraphView from "../components/GraphView";
import HistoryList from "../components/HistoryList";
import PathList from "../components/PathList";
import SearchFailureView from "../components/SearchFailureView";
import SearchLog from "../components/SearchLog";
import { useHistory, type HistoryEntry } from "../lib/history";
import { strings } from "../ui/strings";

export interface Query {
  from: string;
  to: string;
}

export type View =
  | { status: "idle" }
  | { status: "loading"; query: Query }
  | { status: "done"; query: Query; response: SearchResponse }
  | { status: "failed"; query: Query; failure: SearchFailure };

export default function SearchPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<View>({ status: "idle" });
  const latest = useRef(0); // only the newest search may update the page
  const { entries: history, add: remember } = useHistory();

  async function run(query: Query, record = true): Promise<void> {
    const id = ++latest.current;
    setView({ status: "loading", query });
    const outcome = await searchPeople(query.from, query.to);
    if (id !== latest.current) return;
    setView(
      outcome.ok
        ? { status: "done", query, response: outcome.response }
        : { status: "failed", query, failure: outcome.failure },
    );
    // A search that got an answer (HTTP 200, a path or not) is history, under the canonical names of the
    // answer and not the typed text; a failed one is not. Searching again from the history does not add the
    // entry a second time. (What an entry holds and how repeats are treated: SPEC N-4, implementation's choice.)
    if (outcome.ok && record) remember({ from: outcome.response.from, to: outcome.response.to });
  }

  function replay(entry: HistoryEntry): void {
    setFrom(entry.from);
    setTo(entry.to);
    void run({ from: entry.from, to: entry.to }, false);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    void run({ from, to });
  }

  function choose(param: ErrorDetail["param"], candidate: PersonMeta): void {
    if (view.status !== "failed") return;
    const query: Query = { ...view.query, [param]: candidate.name };
    setFrom(query.from);
    setTo(query.to);
    void run(query);
  }

  const busy = view.status === "loading";
  const canSearch = !busy && from.trim() !== "" && to.trim() !== "";

  return (
    <div className="page">
      <header className="hero">
        <h1>Six Degrees of Wikipedia</h1>
      </header>
      <div className="layout-columns">
        <section className="col-left">
          <div className="card">
            <h2 className="card-title">{strings.pathfindingSearchTitle}</h2>
            <form onSubmit={submit} className="search-form">
              <div className="field">
                <label htmlFor="search-from">{strings.from}</label>
                <input id="search-from" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="search-to">{strings.to}</label>
                <input id="search-to" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <button type="submit" disabled={!canSearch} className="btn">
                {strings.search}
              </button>
            </form>
          </div>

          {history.length > 0 || busy || view.status === "failed" || view.status === "done" ? (
            <div className="card">
              <HistoryList entries={history} onPick={replay} />
              <div aria-live="polite">{busy ? strings.searching : null}</div>
              {view.status === "failed" ? <SearchFailureView failure={view.failure} onChoose={choose} /> : null}
              {view.status === "done" ? <ResultText response={view.response} /> : null}
            </div>
          ) : null}

          <SearchLog view={view} />
        </section>
        <section className="col-right">{view.status === "done" ? <GraphView response={view.response} /> : null}</section>
      </div>
    </div>
  );
}

function ResultText({ response }: { response: SearchResponse }) {
  return response.found ? (
    <>
      <p>{strings.pathLength(response.length)}</p>
      <PathList people={response.path} />
    </>
  ) : (
    <p role="status">{strings.noPath(response.from, response.to)}</p>
  );
}
