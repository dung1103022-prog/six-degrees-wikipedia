// A SearchResponse built from explicit levels (SPEC §2, §4.2-4.4) for the graph tests. Shape only: nothing here
// runs a BFS. `path` is the list of names on the path (null: not found).
import type { SearchResponse } from "../../src/api/types";
import { personMeta } from "./api";

export function makeResponse(levels: string[][], path: string[] | null): SearchResponse {
  const found = path !== null && path.length > 0;
  const start = levels[0]?.[0] ?? "";
  const last = found ? path![path!.length - 1]! : (levels[levels.length - 1]?.[0] ?? start);
  return {
    found,
    from: start,
    to: last,
    length: found ? path!.length - 1 : null,
    nodes_explored: levels.reduce((n, level) => n + level.length, 0),
    path: found ? path!.map((name) => personMeta(name)) : [],
    levels: levels.map((nodes, level) => ({ level, nodes })),
  };
}

/** S -> P1 -> P2 -> T on the path; a1, a2, b1, b2, b3, c1 explored on the side. path[i] is in levels[i] (BFS). */
export const LEVELS = [["S"], ["a1", "a2", "P1"], ["b1", "P2", "b2", "b3"], ["T", "c1"]];
export const PATH = ["S", "P1", "P2", "T"];
export const RESPONSE = makeResponse(LEVELS, PATH);
