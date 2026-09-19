import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Sigma needs WebGL, which the DOM test environment does not have (ADR-014): the graph component is
// replaced for every test. The data it would draw comes from SearchResponse, which the tests assert on.
vi.mock("../src/components/GraphView", () => ({ default: () => null }));

// SPEC §0.2: tests never reach the network. Any `fetch` a test has not mocked fails the test.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      throw new Error(`Network access is blocked in tests (SPEC §0.2): unmocked fetch(${String(input)})`);
    }),
  );
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
