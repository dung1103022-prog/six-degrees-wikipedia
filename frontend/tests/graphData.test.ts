// GraphView, Q-14 (ADR-014): the data of the drawing is built from SearchResponse.levels and .path ONLY.
// These tests are about the transform and the layout, which need no WebGL; Sigma is not involved.
// (No @spec tag: SPEC §7 has no test ID for the graph, and ADR-014 keeps Sigma out of the tests.)
import { describe, expect, it } from "vitest";
import { buildGraph, END_COLOR, PATH_COLOR, START_COLOR } from "../src/graph/buildGraph";
import { edgeDisplay, nodeDisplay } from "../src/graph/style";
import { LEVELS, PATH, RESPONSE, makeResponse } from "./helpers/graph";

const names = LEVELS.flat();
const dist = (g: ReturnType<typeof buildGraph>, n: string) => Math.hypot(g.getNodeAttribute(n, "x"), g.getNodeAttribute(n, "y"));

describe("buildGraph: nodes and edges", () => {
  it("has exactly one node per name of levels, and no other node", () => {
    const graph = buildGraph(RESPONSE);
    expect(graph.order).toBe(names.length);
    for (const name of names) expect(graph.hasNode(name)).toBe(true);
  });

  it("records the level of every node (levels[k] = discovered at depth k)", () => {
    const graph = buildGraph(RESPONSE);
    LEVELS.forEach((level, k) => level.forEach((name) => expect(graph.getNodeAttribute(name, "level")).toBe(k)));
  });

  it("marks and highlights the path: only its nodes are onPath, bigger, coloured apart and drawn on top", () => {
    const graph = buildGraph(RESPONSE);
    for (const name of names) {
      const onPath = PATH.includes(name);
      expect(graph.getNodeAttribute(name, "onPath")).toBe(onPath);
    }
    const on = graph.getNodeAttributes("P1");
    const off = graph.getNodeAttributes("a1");
    expect(on.size).toBeGreaterThan(off.size);
    expect(on.color).not.toBe(off.color);
    expect(on.zIndex).toBeGreaterThan(off.zIndex);
  });

  it("has one directed, highlighted edge per consecutive pair of the path, in path order, and no other edge", () => {
    const graph = buildGraph(RESPONSE);
    expect(graph.size).toBe(PATH.length - 1);
    for (let i = 0; i + 1 < PATH.length; i++) {
      expect(graph.hasDirectedEdge(PATH[i]!, PATH[i + 1]!)).toBe(true);
      expect(graph.hasDirectedEdge(PATH[i + 1]!, PATH[i]!)).toBe(false);
    }
    graph.forEachEdge((_edge, attrs) => expect(attrs.onPath).toBe(true));
  });

  it("gives an edge the level of its later endpoint, so it appears with it", () => {
    const graph = buildGraph(RESPONSE);
    graph.forEachEdge((_edge, attrs, source, target) => {
      expect(attrs.level).toBe(Math.max(graph.getNodeAttribute(source, "level"), graph.getNodeAttribute(target, "level")));
    });
  });

  it("labels the path nodes, and only them", () => {
    const graph = buildGraph(RESPONSE);
    for (const name of names) {
      const attrs = graph.getNodeAttributes(name);
      if (PATH.includes(name)) expect([attrs.label, attrs.forceLabel]).toEqual([name, true]);
      else expect(attrs.label).toBeUndefined();
    }
  });

  it("not found: the explored nodes only, nothing on the path, no edge", () => {
    const graph = buildGraph(makeResponse([["A"], ["b", "c"], ["d"]], null));
    expect(graph.order).toBe(4);
    expect(graph.size).toBe(0);
    graph.forEachNode((_n, attrs) => expect(attrs.onPath).toBe(false));
  });

  it("start = target: one highlighted node, no edge", () => {
    const graph = buildGraph(makeResponse([["A"]], ["A"]));
    expect(graph.order).toBe(1);
    expect(graph.size).toBe(0);
    expect(graph.getNodeAttribute("A", "onPath")).toBe(true);
  });

  it("a path node that levels does not list is still drawn (at its place on the path)", () => {
    const graph = buildGraph(makeResponse([["S"], ["a"]], ["S", "Q"]));
    expect(graph.hasNode("Q")).toBe(true);
    expect(graph.getNodeAttribute("Q", "level")).toBe(1);
    expect(graph.hasDirectedEdge("S", "Q")).toBe(true);
  });

  it("does not modify the response", () => {
    const before = structuredClone(RESPONSE);
    buildGraph(RESPONSE);
    expect(RESPONSE).toEqual(before);
  });
});

// Design (sixth-degree.ranisaro.com-DESIGN.md): 4 semantic roles, all derived from levels/path
// already in SearchResponse — start = path[0], end = path[last], path = the other path nodes/edges,
// explored = every other node `levels` lists. No BFS, no API call, node positions unchanged.
describe("buildGraph: semantic roles (start / end / path / explored)", () => {
  it("gives the first path name the 'start' role and its color, the last the 'end' role and its color", () => {
    const graph = buildGraph(RESPONSE); // PATH = ["S", "P1", "P2", "T"]
    expect(graph.getNodeAttribute("S", "role")).toBe("start");
    expect(graph.getNodeAttribute("S", "color")).toBe(START_COLOR);
    expect(graph.getNodeAttribute("T", "role")).toBe("end");
    expect(graph.getNodeAttribute("T", "color")).toBe(END_COLOR);
  });

  it("gives the other path names the 'path' role and its color", () => {
    const graph = buildGraph(RESPONSE);
    for (const name of ["P1", "P2"]) {
      expect(graph.getNodeAttribute(name, "role")).toBe("path");
      expect(graph.getNodeAttribute(name, "color")).toBe(PATH_COLOR);
    }
  });

  it("gives every non-path name the 'explored' role, coloured from EXPLORED_COLOR, faded by level", () => {
    const graph = buildGraph(RESPONSE);
    const explored = LEVELS.flat().filter((name) => !PATH.includes(name));
    expect(explored.length).toBeGreaterThan(0);
    for (const name of explored) {
      expect(graph.getNodeAttribute(name, "role")).toBe("explored");
      const color = graph.getNodeAttribute(name, "color");
      expect(color).toMatch(/^rgba\(168, 85, 247, [\d.]+\)$/); // EXPLORED_COLOR (#A855F7) as rgb
    }
    // deeper levels fade more: a level-1 explored node is more opaque than a level-2 one
    const alphaOf = (name: string) => Number(graph.getNodeAttribute(name, "color").match(/[\d.]+(?=\)$)/)![0]);
    expect(alphaOf("a1")).toBeGreaterThan(alphaOf("b1"));
  });

  it("start === end (single-node path): the 'start' role wins, not 'end'", () => {
    const graph = buildGraph(makeResponse([["A"]], ["A"]));
    expect(graph.getNodeAttribute("A", "role")).toBe("start");
    expect(graph.getNodeAttribute("A", "color")).toBe(START_COLOR);
  });

  it("path edges are coloured PATH_COLOR regardless of which segment (start->path, path->end included)", () => {
    const graph = buildGraph(RESPONSE);
    graph.forEachEdge((_edge, attrs) => expect(attrs.color).toBe(PATH_COLOR));
  });

  it("not found: no path at all, so every node is 'explored' (no start/end/path role exists)", () => {
    const graph = buildGraph(makeResponse([["A"], ["b", "c"], ["d"]], null));
    graph.forEachNode((_n, attrs) => expect(attrs.role).toBe("explored"));
  });
});

// Design (sixth-degree.ranisaro.com-DESIGN.md, "Network Visualization"): an organic scatter, not a
// target's rings — but depth from the start must still read at a glance, so a level's explored nodes
// live in their own radius band, and no two levels' bands ever overlap.
describe("buildGraph: layout (path on a line, explored nodes banded and scattered)", () => {
  it("puts the start in the centre", () => {
    const graph = buildGraph(RESPONSE);
    expect(graph.getNodeAttribute("S", "x")).toBeCloseTo(0);
    expect(graph.getNodeAttribute("S", "y")).toBeCloseTo(0);
  });

  it("puts the whole path on one straight line through the centre, each step further out", () => {
    const graph = buildGraph(RESPONSE);
    const radii = PATH.map((n) => dist(graph, n));
    PATH.forEach((n) => expect(graph.getNodeAttribute(n, "y")).toBeCloseTo(0));
    PATH.slice(1).forEach((n) => expect(graph.getNodeAttribute(n, "x")).toBeGreaterThan(0));
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

  it("never puts two nodes on the same spot", () => {
    const graph = buildGraph(RESPONSE);
    const spots = new Set(names.map((n) => `${graph.getNodeAttribute(n, "x").toFixed(6)},${graph.getNodeAttribute(n, "y").toFixed(6)}`));
    expect(spots.size).toBe(names.length);
  });

  it("is deterministic: the same response gives the same coordinates", () => {
    const a = buildGraph(RESPONSE);
    const b = buildGraph(makeResponse(LEVELS, PATH));
    for (const name of names) {
      expect(a.getNodeAttribute(name, "x")).toBe(b.getNodeAttribute(name, "x"));
      expect(a.getNodeAttribute(name, "y")).toBe(b.getNodeAttribute(name, "y"));
    }
  });

  it("copes with the size of the real dataset: about 9,200 nodes in 6 levels, all distinct", () => {
    const sizes = [1, 40, 500, 3000, 5000, 674];
    const levels = sizes.map((count, k) => Array.from({ length: count }, (_, i) => `n${k}-${i}`));
    const path = levels.map((level) => level[0]!);
    const graph = buildGraph(makeResponse(levels, path));
    expect(graph.order).toBe(9215);
    expect(graph.size).toBe(5);
    const spots = new Set<string>();
    graph.forEachNode((_n, attrs) => spots.add(`${attrs.x.toFixed(6)},${attrs.y.toFixed(6)}`));
    expect(spots.size).toBe(9215);
  });
});

describe("animation by level: what is visible when", () => {
  const graph = buildGraph(RESPONSE);
  const hiddenNodes = (visibleLevels: number) =>
    graph.nodes().filter((n) => nodeDisplay(graph.getNodeAttributes(n), visibleLevels).hidden);
  const hiddenEdges = (visibleLevels: number) =>
    graph.edges().filter((e) => edgeDisplay(graph.getEdgeAttributes(e), visibleLevels).hidden);

  it("shows level k once k+1 levels are revealed, and nothing before", () => {
    expect(hiddenNodes(0)).toHaveLength(names.length);
    expect(hiddenNodes(1).sort()).toEqual(LEVELS.slice(1).flat().sort()); // only the start
    expect(hiddenNodes(2).sort()).toEqual(LEVELS.slice(2).flat().sort());
    expect(hiddenNodes(LEVELS.length)).toEqual([]);
    expect(hiddenNodes(LEVELS.length + 5)).toEqual([]);
  });

  it("shows a path edge only when both of its ends are revealed", () => {
    expect(hiddenEdges(1)).toHaveLength(3); // S-P1 needs level 1
    expect(hiddenEdges(2)).toHaveLength(2); // S-P1 shown
    expect(hiddenEdges(3)).toHaveLength(1);
    expect(hiddenEdges(4)).toHaveLength(0);
  });

  it("keeps everything else about a node as it is (the highlight stays)", () => {
    const attrs = graph.getNodeAttributes("P1");
    expect(nodeDisplay(attrs, 4)).toMatchObject({ color: attrs.color, size: attrs.size, x: attrs.x, y: attrs.y, hidden: false });
  });
});
