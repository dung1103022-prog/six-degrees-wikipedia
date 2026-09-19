// The search page (SPEC §3.2, ADR-005, FE-03). One GET /api/search per search; a failure is shown by
// `detail.code`; choosing a candidate of AMBIGUOUS_NAME searches again with its canonical name.
// The successful SearchResponse is kept in `view` (path and levels) for what draws it next.
import { useRef, useState, type FormEvent } from "react";
import { searchPeople, type SearchFailure } from "../api/search";
import type { ErrorDetail, PersonMeta, SearchResponse } from "../api/types";
import PathList from "../components/PathList";
import SearchFailureView from "../components/SearchFailureView";
import { strings } from "../ui/strings";

interface Query {
  from: string;
  to: string;
}

type View =
  | { status: "idle" }
  | { status: "loading"; query: Query }
  | { status: "done"; query: Query; response: SearchResponse }
  | { status: "failed"; query: Query; failure: SearchFailure };

export default function SearchPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<View>({ status: "idle" });
  const latest = useRef(0); // only the newest search may update the page

  async function run(query: Query): Promise<void> {
    const id = ++latest.current;
    setView({ status: "loading", query });
    const outcome = await searchPeople(query.from, query.to);
    if (id !== latest.current) return;
    setView(
      outcome.ok
        ? { status: "done", query, response: outcome.response }
        : { status: "failed", query, failure: outcome.failure },
    );
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
    <main>
      <h1>Six Degrees of Wikipedia</h1>
      <form onSubmit={submit}>
        <label htmlFor="search-from">{strings.from}</label>
        <input id="search-from" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label htmlFor="search-to">{strings.to}</label>
        <input id="search-to" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="submit" disabled={!canSearch}>
          {strings.search}
        </button>
      </form>

      <div aria-live="polite">{busy ? strings.searching : null}</div>
      {view.status === "failed" ? <SearchFailureView failure={view.failure} onChoose={choose} /> : null}
      {view.status === "done" ? <Result response={view.response} /> : null}
    </main>
  );
}

function Result({ response }: { response: SearchResponse }) {
  if (!response.found) return <p role="status">{strings.noPath(response.from, response.to)}</p>;
  return (
    <section>
      <p>{strings.pathLength(response.length)}</p>
      <PathList people={response.path} />
    </section>
  );
}
