// GraphView with Sigma replaced by a fake (ADR-014: Sigma needs WebGL, which the DOM test environment has
// not). What is checked is what GraphView asks of Sigma: the graph of the response, a sized container,
// the levels revealed one by one through the reducers, cleanup, and that nothing is fetched.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GraphView from "../src/components/GraphView";
import { buildGraph } from "../src/graph/buildGraph";
import { LEVEL_MS } from "../src/graph/useLevelAnimation";
import { LEVELS, PATH, RESPONSE, makeResponse } from "./helpers/graph";

// tests/setup.ts replaces GraphView for every other test; this file needs the real one.
vi.unmock("../src/components/GraphView");

const h = vi.hoisted(() => ({ instances: [] as FakeSigma[], failToStart: false }));

interface FakeSigma {
  graph: { order: number; nodes(): string[]; edges(): string[]; getNodeAttributes(n: string): never; getEdgeAttributes(e: string): never };
  container: HTMLElement;
  settings: Record<string, unknown>;
  setSetting: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
}

vi.mock("sigma", () => ({
  default: class {
    graph: FakeSigma["graph"];
    container: HTMLElement;
    settings: Record<string, unknown>;
    setSetting = vi.fn((key: string, value: unknown) => {
      this.settings[key] = value;
      return this;
    });
    refresh = vi.fn();
    kill = vi.fn();
    constructor(graph: FakeSigma["graph"], container: HTMLElement, settings: Record<string, unknown> = {}) {
      if (h.failToStart) throw new Error("Sigma: could not create a WebGL context");
      this.graph = graph;
      this.container = container;
      this.settings = { ...settings };
      h.instances.push(this as unknown as FakeSigma);
    }
  },
}));
vi.mock("sigma/rendering", () => ({ EdgeArrowProgram: class {} }));

beforeEach(() => {
  h.instances.length = 0;
  h.failToStart = false;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function hiddenNames(sigma: FakeSigma): string[] {
  const reducer = sigma.settings.nodeReducer as (n: string, a: never) => { hidden?: boolean };
  return sigma.graph.nodes().filter((n) => reducer(n, sigma.graph.getNodeAttributes(n)).hidden);
}

function hiddenEdges(sigma: FakeSigma): string[] {
  const reducer = sigma.settings.edgeReducer as (e: string, a: never) => { hidden?: boolean };
  return sigma.graph.edges().filter((e) => reducer(e, sigma.graph.getEdgeAttributes(e)).hidden);
}

describe("GraphView", () => {
  it("gives Sigma the graph of the response, in a container that has a size", () => {
    render(<GraphView response={RESPONSE} />);

    expect(h.instances).toHaveLength(1);
    const sigma = h.instances[0]!;
    expect(sigma.graph.order).toBe(LEVELS.flat().length);
    expect(sigma.container).toBeInstanceOf(HTMLElement);
    expect(sigma.container.style.height).not.toBe(""); // Sigma refuses a container without a height
    expect(sigma.settings.zIndex).toBe(true); // the highlighted path is drawn over the rest
  });

  it("uses only the response: it fetches nothing and runs no search of its own", () => {
    render(<GraphView response={RESPONSE} />);
    advance(LEVEL_MS * 10);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reveals the levels one at a time, refreshing Sigma at each step, and ends with the whole graph", () => {
    render(<GraphView response={RESPONSE} />);
    const sigma = h.instances[0]!;

    expect(hiddenNames(sigma).sort()).toEqual(LEVELS.slice(1).flat().sort()); // level 0 only
    advance(LEVEL_MS);
    expect(hiddenNames(sigma).sort()).toEqual(LEVELS.slice(2).flat().sort());
    const refreshes = sigma.refresh.mock.calls.length;
    expect(refreshes).toBeGreaterThan(0);
    advance(LEVEL_MS * 5);
    expect(hiddenNames(sigma)).toEqual([]);
    expect(sigma.refresh.mock.calls.length).toBeGreaterThan(refreshes);
    expect(hiddenEdges(sigma)).toEqual([]); // the whole path is there
  });

  it("draws the found path highlighted, with 4 distinct semantic colors (start/end/path/explored)", () => {
    render(<GraphView response={RESPONSE} />);
    const sigma = h.instances[0]!;
    advance(LEVEL_MS * 5);
    const reducer = sigma.settings.nodeReducer as (n: string, a: never) => { color: string; size: number };
    const shown = (n: string) => reducer(n, sigma.graph.getNodeAttributes(n));
    // PATH = ["S", "P1", "P2", "T"]: S is start, T is end, P1/P2 are the intermediate path nodes.
    for (const name of PATH) expect(shown(name).size).toBeGreaterThan(shown("a1").size);
    expect(shown("S").color).not.toBe(shown("T").color); // start vs end
    expect(shown("P1").color).not.toBe(shown("S").color); // path vs start
    expect(shown("P1").color).not.toBe(shown("T").color); // path vs end
    expect(shown("P1").color).toBe(shown("P2").color); // the intermediate path nodes share one color
    expect(shown("P1").color).not.toBe(shown("a1").color); // path vs explored
  });

  it("draws a search that found nothing: the explored levels, no path", () => {
    render(<GraphView response={makeResponse([["A"], ["b", "c"]], null)} />);
    const sigma = h.instances[0]!;
    advance(LEVEL_MS * 5);
    expect(sigma.graph.order).toBe(3);
    expect(sigma.graph.edges()).toHaveLength(0);
  });

  it("starts over, with a new Sigma, for a new response, and kills the old one", () => {
    const { rerender } = render(<GraphView response={RESPONSE} />);
    advance(LEVEL_MS * 5);
    rerender(<GraphView response={makeResponse([["X"], ["y"]], ["X", "y"])} />);

    expect(h.instances).toHaveLength(2);
    expect(h.instances[0]!.kill).toHaveBeenCalledTimes(1);
    expect(h.instances[1]!.graph.order).toBe(2);
    expect(hiddenNames(h.instances[1]!)).toEqual(["y"]); // the animation began again at level 0
  });

  it("kills Sigma when it unmounts, and leaves no timer", () => {
    const { unmount } = render(<GraphView response={RESPONSE} />);
    unmount();
    expect(h.instances[0]!.kill).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("without WebGL (Sigma cannot start) it says so instead of crashing the page", () => {
    h.failToStart = true;
    render(<GraphView response={RESPONSE} />);
    expect(screen.getByText(/không thể vẽ đồ thị/i)).toBeInTheDocument();
  });

  it("builds from the same transform as buildGraph", () => {
    render(<GraphView response={RESPONSE} />);
    expect(h.instances[0]!.graph.order).toBe(buildGraph(RESPONSE).order);
  });
});
