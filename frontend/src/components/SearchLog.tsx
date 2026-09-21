// The "Search Log" card (design: sixth-degree.ranisaro.com-DESIGN.md, "Search Log"). There is no
// live socket to a server (SPEC: one GET /api/search per search, ADR-005): every line here is
// replayed from the SearchResponse the page already has, timed with the same per-level reveal as
// GraphView (useLevelAnimation, LEVEL_MS), so the two panels stay in step. Nothing here fetches or
// runs a BFS of its own.
import { useMemo } from "react";
import type { SearchResponse } from "../api/types";
import { useLevelAnimation } from "../graph/useLevelAnimation";
import type { Query, View } from "../pages/SearchPage";
import { strings } from "../ui/strings";

interface LogLine {
  key: string;
  text: string;
  tone?: "ok";
}

function levelLines(response: SearchResponse, visible: number): LogLine[] {
  const lines: LogLine[] = [];
  const pathNames = new Set(response.path.map((person) => person.name));
  let explored = 0;
  response.levels.slice(0, visible).forEach((level, k) => {
    explored += level.nodes.length;
    lines.push({ key: `level:${k}`, text: strings.searchLogLevel(k, explored) });
    level.nodes
      .filter((name) => pathNames.has(name))
      .forEach((name) => lines.push({ key: `path:${k}:${name}`, text: strings.searchLogPathNode(name, k) }));
  });
  return lines;
}

function buildLines(view: View, visible: number): LogLine[] {
  if (view.status === "idle") return [];
  const query: Query = view.query;
  const lines: LogLine[] = [
    { key: "connect", text: strings.searchLogConnected, tone: "ok" },
    { key: "query", text: strings.searchLogSearching(query.from, query.to) },
  ];
  if (view.status === "failed") return [...lines, { key: "failed", text: strings.searchLogFailed }];
  if (view.status === "done") return [...lines, ...levelLines(view.response, visible)];
  return lines; // loading: connected + the query line only, until a response arrives
}

export default function SearchLog({ view }: { view: View }) {
  const response = view.status === "done" ? view.response : undefined;
  const visible = useLevelAnimation(response?.levels.length ?? 0, response);
  const connected = view.status !== "idle";
  const lines = useMemo(() => buildLines(view, visible), [view, visible]);

  return (
    <div className="card">
      <h2 className="card-title">
        <span className={`status-dot ${connected ? "status-dot--on" : "status-dot--off"}`} aria-hidden="true" />
        {strings.searchLogTitle}
        <span className="card-title-status">{connected ? strings.searchLogStatusOn : strings.searchLogStatusOff}</span>
      </h2>
      {lines.length === 0 ? (
        <p className="search-log-empty">{strings.searchLogEmpty}</p>
      ) : (
        <ul className="search-log-lines" aria-live="polite">
          {lines.map((line) => (
            <li key={line.key} className={line.tone === "ok" ? "search-log-line--ok" : undefined}>
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
