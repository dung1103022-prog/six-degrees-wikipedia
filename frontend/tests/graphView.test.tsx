// GraphView with 3d-force-graph replaced by a fake (ADR-014: it needs WebGL, which the DOM test
// environment has not). What is checked is what GraphView asks of 3d-force-graph: the graph of the
// response (fed as `visibleGraph` snapshots, see ../src/graph/style.ts), a sized container, the
// levels revealed one by one, a hover label for every node, cleanup, and that nothing is fetched.
// The panel is mounted even with `response={null}` (design: 2026-09-21, "luôn hiện"), so several
// tests below render that way first.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GraphView from "../src/components/GraphView";
import { buildGraph, type Node3D } from "../src/graph/buildGraph";
import { LEVEL_MS } from "../src/graph/useLevelAnimation";
import { LEVELS, PATH, RESPONSE, makeResponse } from "./helpers/graph";

// tests/setup.ts replaces GraphView for every other test; this file needs the real one.
vi.unmock("../src/components/GraphView");

const h = vi.hoisted(() => ({ instances: [] as FakeFG[], failToStart: false }));

interface GraphSnapshot {
  nodes: Node3D[];
  links: { id: string; source: string; target: string; color: string; level: number }[];
}

interface FakeFG {
  element: HTMLElement;
  data: GraphSnapshot;
  calls: Record<string, unknown[][]>;
  _destructor: ReturnType<typeof vi.fn>;
}

vi.mock("3d-force-graph", () => {
  class FakeForceGraph3D {
    element: HTMLElement;
    data: GraphSnapshot = { nodes: [], links: [] };
    calls: Record<string, unknown[][]> = {};
    _destructor = vi.fn();

    constructor(element: HTMLElement) {
      if (h.failToStart) throw new Error("3d-force-graph: could not create a WebGL context");
      this.element = element;
      h.instances.push(this as unknown as FakeFG);
    }

    private chain(name: string, args: unknown[]): this {
      (this.calls[name] ??= []).push(args);
      return this;
    }

    graphData(data?: GraphSnapshot): this | GraphSnapshot {
      if (data === undefined) return this.data;
      this.data = data;
      return this.chain("graphData", [data]);
    }

    backgroundColor(...a: unknown[]): this { return this.chain("backgroundColor", a); }
    showNavInfo(...a: unknown[]): this { return this.chain("showNavInfo", a); }
    enableNodeDrag(...a: unknown[]): this { return this.chain("enableNodeDrag", a); }
    nodeRelSize(...a: unknown[]): this { return this.chain("nodeRelSize", a); }
    nodeLabel(...a: unknown[]): this { return this.chain("nodeLabel", a); }
    nodeColor(...a: unknown[]): this { return this.chain("nodeColor", a); }
    nodeVal(...a: unknown[]): this { return this.chain("nodeVal", a); }
    nodeOpacity(...a: unknown[]): this { return this.chain("nodeOpacity", a); }
    linkColor(...a: unknown[]): this { return this.chain("linkColor", a); }
    linkWidth(...a: unknown[]): this { return this.chain("linkWidth", a); }
    linkOpacity(...a: unknown[]): this { return this.chain("linkOpacity", a); }
    linkDirectionalArrowLength(...a: unknown[]): this { return this.chain("linkDirectionalArrowLength", a); }
    linkDirectionalArrowRelPos(...a: unknown[]): this { return this.chain("linkDirectionalArrowRelPos", a); }
    warmupTicks(...a: unknown[]): this { return this.chain("warmupTicks", a); }
    cooldownTicks(...a: unknown[]): this { return this.chain("cooldownTicks", a); }
    width(...a: unknown[]): this { return this.chain("width", a); }
    height(...a: unknown[]): this { return this.chain("height", a); }
  }
  return { default: FakeForceGraph3D };
});

beforeEach(() => {
  h.instances.length = 0;
  h.failToStart = false;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("GraphView", () => {
  it("creates one 3d-force-graph instance, in a container that has a size, even before any search", () => {
    render(<GraphView response={null} />);

    expect(h.instances).toHaveLength(1);
    const fg = h.instances[0]!;
    expect(fg.element).toBeInstanceOf(HTMLElement);
    expect(fg.element.style.height).not.toBe(""); // 3d-force-graph sizes its canvas from width()/height()
    expect(fg.data.nodes).toEqual([]);
    expect(fg.data.links).toEqual([]);
  });

  it("renders empty — no nodes or links — before any search, however long it waits", () => {
    render(<GraphView response={null} />);
    advance(LEVEL_MS * 10);
    const fg = h.instances[0]!;
    expect(fg.data.nodes).toEqual([]);
    expect(fg.data.links).toEqual([]);
  });

  it("uses only the response: it fetches nothing and runs no search of its own", () => {
    render(<GraphView response={RESPONSE} />);
    advance(LEVEL_MS * 10);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("feeds the levels one at a time, and ends with the whole graph", () => {
    render(<GraphView response={RESPONSE} />);
    const fg = h.instances[0]!;

    expect(fg.data.nodes.map((n) => n.id).sort()).toEqual(LEVELS[0]!.slice().sort());
    advance(LEVEL_MS);
    expect(fg.data.nodes.map((n) => n.id).sort()).toEqual(LEVELS.slice(0, 2).flat().sort());
    advance(LEVEL_MS * 5);
    expect(fg.data.nodes).toHaveLength(LEVELS.flat().length);
    expect(fg.data.links).toHaveLength(PATH.length - 1); // the whole path is there
  });

  it("draws the found path highlighted, with 4 distinct semantic colors (start/end/path/explored)", () => {
    render(<GraphView response={RESPONSE} />);
    const fg = h.instances[0]!;
    advance(LEVEL_MS * 5);
    const shown = (id: string) => fg.data.nodes.find((n) => n.id === id)!;
    for (const name of PATH) expect(shown(name).val).toBeGreaterThan(shown("a1").val);
    expect(shown("S").color).not.toBe(shown("T").color); // start vs end
    expect(shown("P1").color).not.toBe(shown("S").color); // path vs start
    expect(shown("P1").color).not.toBe(shown("T").color); // path vs end
    expect(shown("P1").color).toBe(shown("P2").color); // the intermediate path nodes share one color
    expect(shown("P1").color).not.toBe(shown("a1").color); // path vs explored
  });

  it("draws a search that found nothing: the explored levels, no path", () => {
    render(<GraphView response={makeResponse([["A"], ["b", "c"]], null)} />);
    const fg = h.instances[0]!;
    advance(LEVEL_MS * 5);
    expect(fg.data.nodes).toHaveLength(3);
    expect(fg.data.links).toHaveLength(0);
  });

  it("gives every node a hover label of its own name, for the whole graph (design: 2026-09-21)", () => {
    render(<GraphView response={RESPONSE} />);
    const fg = h.instances[0]!;
    const labelFn = fg.calls.nodeLabel?.[0]?.[0] as (node: { label: string }) => string;
    expect(labelFn({ label: "Marie Curie" })).toBe("Marie Curie");
  });

  it("restarts the reveal animation for a new response, without creating a new instance", () => {
    const { rerender } = render(<GraphView response={RESPONSE} />);
    advance(LEVEL_MS * 5);
    rerender(<GraphView response={makeResponse([["X"], ["y"]], ["X", "y"])} />);

    expect(h.instances).toHaveLength(1); // one scene for the component's whole life, just re-fed
    const fg = h.instances[0]!;
    expect(fg.data.nodes.map((n) => n.id)).toEqual(["X"]); // the animation began again at level 0
  });

  it("destroys the 3d-force-graph instance and removes the resize listener when it unmounts, leaving no timer", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<GraphView response={RESPONSE} />);
    const fg = h.instances[0]!;
    unmount();
    expect(fg._destructor).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(addSpy.mock.calls.some(([type]) => type === "resize")).toBe(true);
    expect(removeSpy.mock.calls.some(([type]) => type === "resize")).toBe(true);
  });

  it("without WebGL (3d-force-graph cannot start) it says so instead of crashing the page", () => {
    h.failToStart = true;
    render(<GraphView response={RESPONSE} />);
    expect(screen.getByText(/could not draw the graph/i)).toBeInTheDocument();
  });

  it("builds from the same transform as buildGraph", () => {
    render(<GraphView response={RESPONSE} />);
    advance(LEVEL_MS * 5);
    expect(h.instances[0]!.data.nodes).toHaveLength(buildGraph(RESPONSE).nodes.length);
  });
});
