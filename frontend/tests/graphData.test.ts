// GraphView, Q-14 (ADR-014, mở lại và chốt lại ở v2.17): the data of the drawing is built from
// SearchResponse.levels and .path ONLY. These tests are about the transform and the layout, which
// need no WebGL; 3d-force-graph/Three is not involved.
// (No @spec tag: SPEC §7 has no test ID for the graph, and ADR-014 keeps WebGL out of these tests.)
import { describe, expect, it } from "vitest";
import { buildGraph, EXPLORED_COLOR, PATH_COLOR, START_COLOR, END_COLOR, type GraphData3D, type Node3D } from "../src/graph/buildGraph";
import { visibleGraph } from "../src/graph/style";
import { LEVELS, PATH, RESPONSE, makeResponse } from "./helpers/graph";

const names = LEVELS.flat();

function nodeOf(graph: GraphData3D, id: string): Node3D {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id} in graph`);
  return node;
}

const dist = (graph: GraphData3D, id: string) => {
  const n = nodeOf(graph, id);
  return Math.hypot(n.x, n.y, n.z);
};

describe("buildGraph: nodes and links", () => {
  it("has exactly one node per name of levels, and no other node", () => {
    const graph = buildGraph(RESPONSE);
    expect(graph.nodes).toHaveLength(names.length);
    for (const name of names) expect(graph.nodes.some((n) => n.id === name)).toBe(true);
  });

  it("records the level of every node (levels[k] = discovered at depth k)", () => {
    const graph = buildGraph(RESPONSE);
    LEVELS.forEach((level, k) => level.forEach((name) => expect(nodeOf(graph, name).level).toBe(k)));
  });

  it("marks and highlights the path: only its nodes are onPath, bigger and coloured apart", () => {
    const graph = buildGraph(RESPONSE);
    for (const name of names) {
      const onPath = PATH.includes(name);
      expect(nodeOf(graph, name).onPath).toBe(onPath);
    }
    const on = nodeOf(graph, "P1");
    const off = nodeOf(graph, "a1");
    expect(on.val).toBeGreaterThan(off.val);
    expect(on.color).not.toBe(off.color);
  });

  it("has one link per consecutive pair of the path, in path order, and no other link", () => {
    const graph = buildGraph(RESPONSE);
    expect(graph.links).toHaveLength(PATH.length - 1);
    for (let i = 0; i + 1 < PATH.length; i++) {
      expect(graph.links.some((l) => l.source === PATH[i] && l.target === PATH[i + 1])).toBe(true);
      expect(graph.links.some((l) => l.source === PATH[i + 1] && l.target === PATH[i])).toBe(false);
    }
  });

  it("gives a link the level of its later endpoint, so it appears with it", () => {
    const graph = buildGraph(RESPONSE);
    for (const link of graph.links) {
      expect(link.level).toBe(Math.max(nodeOf(graph, link.source).level, nodeOf(graph, link.target).level));
    }
  });

  it("labels every node with its own name (hover target for all nodes, not only the path — design: 2026-09-21)", () => {
    const graph = buildGraph(RESPONSE);
    for (const name of names) expect(nodeOf(graph, name).label).toBe(name);
  });

  it("not found: the explored nodes only, nothing on the path, no link", () => {
    const graph = buildGraph(makeResponse([["A"], ["b", "c"], ["d"]], null));
    expect(graph.nodes).toHaveLength(4);
    expect(graph.links).toHaveLength(0);
    graph.nodes.forEach((n) => expect(n.onPath).toBe(false));
  });

  it("start = target: one highlighted node, no link", () => {
    const graph = buildGraph(makeResponse([["A"]], ["A"]));
    expect(graph.nodes).toHaveLength(1);
    expect(graph.links).toHaveLength(0);
    expect(nodeOf(graph, "A").onPath).toBe(true);
  });

  it("a path node that levels does not list is still drawn (at its place on the path)", () => {
    const graph = buildGraph(makeResponse([["S"], ["a"]], ["S", "Q"]));
    expect(graph.nodes.some((n) => n.id === "Q")).toBe(true);
    expect(nodeOf(graph, "Q").level).toBe(1);
    expect(graph.links.some((l) => l.source === "S" && l.target === "Q")).toBe(true);
  });

  it("does not modify the response", () => {
    const before = structuredClone(RESPONSE);
    buildGraph(RESPONSE);
    expect(RESPONSE).toEqual(before);
  });
});

// Design (sixth-degree.ranisaro.com-DESIGN.md): 4 semantic roles, all derived from levels/path
// already in SearchResponse — start = path[0], end = path[last], path = the other path nodes/links,
// explored = every other node `levels` lists. No BFS, no API call, node positions unchanged.
describe("buildGraph: semantic roles (start / end / path / explored)", () => {
  it("gives the first path name the 'start' role and its color, the last the 'end' role and its color", () => {
    const graph = buildGraph(RESPONSE); // PATH = ["S", "P1", "P2", "T"]
    expect(nodeOf(graph, "S").role).toBe("start");
    expect(nodeOf(graph, "S").color).toBe(START_COLOR);
    expect(nodeOf(graph, "T").role).toBe("end");
    expect(nodeOf(graph, "T").color).toBe(END_COLOR);
  });

  it("gives the other path names the 'path' role and its color", () => {
    const graph = buildGraph(RESPONSE);
    for (const name of ["P1", "P2"]) {
      expect(nodeOf(graph, name).role).toBe("path");
      expect(nodeOf(graph, name).color).toBe(PATH_COLOR);
    }
  });

  it("gives every non-path name the 'explored' role, coloured EXPLORED_COLOR", () => {
    const graph = buildGraph(RESPONSE);
    const explored = LEVELS.flat().filter((name) => !PATH.includes(name));
    expect(explored.length).toBeGreaterThan(0);
    for (const name of explored) {
      expect(nodeOf(graph, name).role).toBe("explored");
      expect(nodeOf(graph, name).color).toBe(EXPLORED_COLOR);
    }
  });

  it("start === end (single-node path): the 'start' role wins, not 'end'", () => {
    const graph = buildGraph(makeResponse([["A"]], ["A"]));
    expect(nodeOf(graph, "A").role).toBe("start");
    expect(nodeOf(graph, "A").color).toBe(START_COLOR);
  });

  it("path links are coloured PATH_COLOR regardless of which segment (start->path, path->end included)", () => {
    const graph = buildGraph(RESPONSE);
    graph.links.forEach((link) => expect(link.color).toBe(PATH_COLOR));
  });

  it("not found: no path at all, so every node is 'explored' (no start/end/path role exists)", () => {
    const graph = buildGraph(makeResponse([["A"], ["b", "c"], ["d"]], null));
    graph.nodes.forEach((n) => expect(n.role).toBe("explored"));
  });
});

// Design (2026-09-21, "hình cầu 3D xoay được"): a rotatable 3D sphere, not a flat 2D scatter — but
// depth from the start must still read at a glance, so a level's explored nodes live on their own
// spherical shell, and no two levels' shells ever overlap.
describe("buildGraph: layout (path on a line through the centre, explored nodes on spherical shells)", () => {
  it("puts the start in the centre", () => {
    const graph = buildGraph(RESPONSE);
    const s = nodeOf(graph, "S");
    expect(s.x).toBeCloseTo(0);
    expect(s.y).toBeCloseTo(0);
    expect(s.z).toBeCloseTo(0);
  });

  it("puts the whole path on one straight line through the centre, each step further out", () => {
    const graph = buildGraph(RESPONSE);
    const radii = PATH.map((n) => dist(graph, n));
    PATH.forEach((n) => {
      expect(nodeOf(graph, n).y).toBeCloseTo(0);
      expect(nodeOf(graph, n).z).toBeCloseTo(0);
    });
    PATH.slice(1).forEach((n) => expect(nodeOf(graph, n).x).toBeGreaterThan(0));
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
  });

  it("keeps a level's explored nodes closer to the centre than the next level's, even with the scatter", () => {
    const graph = buildGraph(RESPONSE);
    const exploredByLevel = LEVELS.map((level) => level.filter((n) => !PATH.includes(n)));
    const maxRadius = (list: string[]) => Math.max(...list.map((n) => dist(graph, n)));
    const minRadius = (list: string[]) => Math.min(...list.map((n) => dist(graph, n)));
    for (let k = 1; k < exploredByLevel.length; k++) {
      const prev = exploredByLevel[k - 1]!;
      const cur = exploredByLevel[k]!;
      if (prev.length === 0 || cur.length === 0) continue;
      expect(minRadius(cur)).toBeGreaterThan(maxRadius(prev));
    }
  });

  it("scatters explored nodes over the whole sphere surface, not flat on one plane", () => {
    const graph = buildGraph(RESPONSE);
    const explored = graph.nodes.filter((n) => n.role === "explored");
    expect(explored.length).toBeGreaterThan(2);
    const zs = explored.map((n) => n.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0); // not all z === 0: a real sphere, not a disc
  });

  it("never puts two nodes on the same spot", () => {
    const graph = buildGraph(RESPONSE);
    const spots = new Set(names.map((n) => {
      const node = nodeOf(graph, n);
      return `${node.x.toFixed(6)},${node.y.toFixed(6)},${node.z.toFixed(6)}`;
    }));
    expect(spots.size).toBe(names.length);
  });

  it("is deterministic: the same response gives the same coordinates", () => {
    const a = buildGraph(RESPONSE);
    const b = buildGraph(makeResponse(LEVELS, PATH));
    for (const name of names) {
      expect(nodeOf(a, name).x).toBe(nodeOf(b, name).x);
      expect(nodeOf(a, name).y).toBe(nodeOf(b, name).y);
      expect(nodeOf(a, name).z).toBe(nodeOf(b, name).z);
    }
  });

  it("copes with the size of the real dataset: about 9,200 nodes in 6 levels, all distinct", () => {
    const sizes = [1, 40, 500, 3000, 5000, 674];
    const levels = sizes.map((count, k) => Array.from({ length: count }, (_, i) => `n${k}-${i}`));
    const path = levels.map((level) => level[0]!);
    const graph = buildGraph(makeResponse(levels, path));
    expect(graph.nodes).toHaveLength(9215);
    expect(graph.links).toHaveLength(5);
    const spots = new Set(graph.nodes.map((n) => `${n.x.toFixed(6)},${n.y.toFixed(6)},${n.z.toFixed(6)}`));
    expect(spots.size).toBe(9215);
  });
});

// visibleGraph (../src/graph/style.ts) takes the place of the pre-v2.17 Sigma "hidden" reducers:
// 3d-force-graph is fed one full {nodes, links} snapshot per step instead of a per-row flag.
describe("animation by level: what is visible when", () => {
  const graph = buildGraph(RESPONSE);

  it("shows level k once k+1 levels are revealed, and nothing before", () => {
    expect(visibleGraph(graph, 0).nodes).toHaveLength(0);
    expect(visibleGraph(graph, 1).nodes.map((n) => n.id).sort()).toEqual(LEVELS[0]!.slice().sort());
    expect(visibleGraph(graph, 2).nodes.map((n) => n.id).sort()).toEqual(LEVELS.slice(0, 2).flat().sort());
    expect(visibleGraph(graph, LEVELS.length).nodes).toHaveLength(names.length);
    expect(visibleGraph(graph, LEVELS.length + 5).nodes).toHaveLength(names.length);
  });

  it("shows a path link only when both of its ends are revealed", () => {
    expect(visibleGraph(graph, 1).links).toHaveLength(0); // S-P1 needs level 1 (P1 discovered there)
    expect(visibleGraph(graph, 2).links).toHaveLength(1);
    expect(visibleGraph(graph, 3).links).toHaveLength(2);
    expect(visibleGraph(graph, 4).links).toHaveLength(3); // the whole path is there
  });

  it("keeps everything else about a node as it is (the highlight stays; same object, fixed position never recomputed)", () => {
    const node = nodeOf(graph, "P1");
    const shown = visibleGraph(graph, 4).nodes.find((n) => n.id === "P1");
    expect(shown).toBe(node);
  });
});
