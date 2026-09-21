// UI text: English. Was Vietnamese under SPEC Q-3 (v2.5); superseded — the visible UI is now English
// (SPEC.md carries a note next to Q-3). Kept in one place so the pages share the wording.
import type { ErrorDetail } from "../api/types";

const FIELD: Record<ErrorDetail["param"], string> = { from: "Start Person", to: "End Person" };

export const strings = {
  from: FIELD.from,
  to: FIELD.to,
  search: "Start Search",
  searching: "Searching…",
  pathLabel: "Path",
  candidatesLabel: "Choose a person",
  pathLength: (edges: number | null) => `Shortest path: ${edges ?? "?"} steps`,
  noPath: (from: string, to: string) => `No path from "${from}" to "${to}".`,
  unresolved: (input: string, param: ErrorDetail["param"]) => `Could not find "${input}" (${FIELD[param]}).`,
  ambiguous: (input: string, param: ErrorDetail["param"]) => `"${input}" (${FIELD[param]}) is ambiguous, choose a person:`,
  searchFailed: (reason: string) => `Search failed: ${reason}.`,
  historyLabel: "Search History",
  historyEntry: (from: string, to: string) => `${from} → ${to}`,
  graphLabel: "Graph of the search's steps",
  graphUnavailable: "Could not draw the graph (your browser does not support WebGL).",
  graphLegendStart: "Start",
  graphLegendEnd: "End",
  graphLegendPath: "On the shortest path",
  graphLegendOther: "Other people explored, fading with distance",
  // the /share page (SPEC §5.6)
  loading: "Loading…",
  invalidLink: "This link is no longer valid.",
  backToHome: "← Back to home",
  newSearch: (from: string, to: string) => `New search result from "${from}" to "${to}":`,
  pathFailed: (reason: string) => `Could not load the path: ${reason}.`,
  // Panel titles (design: sixth-degree.ranisaro.com-DESIGN.md — "Pathfinding Search" / "Search Log" /
  // "Network Visualization"). The Search Log card is a client-only replay of the SearchResponse
  // already fetched (see SearchLog.tsx): there is no live socket to a server, so "connected" here
  // means "a search is in flight or done", not an actual connection.
  pathfindingSearchTitle: "Pathfinding Search",
  networkVisualizationTitle: "Network Visualization",
  nodesExplored: (n: number) => `Nodes explored: ${n}`,
  searchLogTitle: "Search Log",
  searchLogStatusOn: "Connected",
  searchLogStatusOff: "Disconnected",
  searchLogEmpty: "No search activity yet. Choose a start and end person to begin.",
  searchLogConnected: "Connected to the pathfinding server.",
  searchLogSearching: (from: string, to: string) => `Searching for a path from "${from}" to "${to}"…`,
  searchLogLevel: (level: number, explored: number) => `Level ${level}: explored ${explored} nodes.`,
  searchLogPathNode: (name: string, level: number) => `Level ${level}: path node — ${name}.`,
  searchLogFailed: "Search failed.",
} as const;
