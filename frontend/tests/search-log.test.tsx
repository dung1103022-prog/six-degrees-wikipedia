// The "Search Log" card (design: sixth-degree.ranisaro.com-DESIGN.md, "Search Log"). It replays the
// SearchResponse already fetched by the page — nothing here calls the API or runs a BFS of its own
// (setup.ts fails the test on any unmocked fetch, which is enough to prove that).
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchLog from "../src/components/SearchLog";
import { LEVEL_MS } from "../src/graph/useLevelAnimation";
import type { View } from "../src/pages/SearchPage";
import { LEVELS, PATH, RESPONSE } from "./helpers/graph";

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const lineTexts = () => Array.from(screen.getAllByRole("listitem"), (li) => li.textContent ?? "");

const idle: View = { status: "idle" };
const loading: View = { status: "loading", query: { from: "S", to: "T" } };
const done: View = { status: "done", query: { from: "S", to: "T" }, response: RESPONSE };
const failed: View = { status: "failed", query: { from: "S", to: "T" }, failure: { kind: "other", reason: "boom" } };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SearchLog", () => {
  it("idle: disconnected status, an empty-state message, no list", () => {
    render(<SearchLog view={idle} />);
    expect(screen.getByText("Ngắt kết nối")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("loading: connected status, the query line, nothing about levels yet (there is no response)", () => {
    render(<SearchLog view={loading} />);
    expect(screen.getByText("Đã kết nối")).toBeInTheDocument();
    const texts = lineTexts();
    expect(texts).toHaveLength(2);
    expect(texts[1]).toMatch(/"S".*"T"/);
  });

  it("done: level 0 is shown at once, then one more level every LEVEL_MS, ending with all of them", () => {
    render(<SearchLog view={done} />);
    expect(lineTexts()).toHaveLength(4); // connect + query + level 0's own 2 lines (shown at once)
    expect(lineTexts().some((t) => t.startsWith("Cấp 0:"))).toBe(true);

    advance(LEVEL_MS); // level 1 revealed
    expect(lineTexts()).toHaveLength(6);

    advance(LEVEL_MS * (LEVELS.length + 5)); // run past the end: nothing more appears, nothing crashes
    const finalTexts = lineTexts();
    expect(finalTexts).toHaveLength(10); // connect + query + 2 lines per level (4 levels)
    LEVELS.forEach((_level, k) => expect(finalTexts.some((t) => t.startsWith(`Cấp ${k}:`))).toBe(true));
    for (const name of PATH) expect(finalTexts.some((t) => t.includes(name))).toBe(true);
  });

  it("failed: connected status, the query line, then a failure line", () => {
    render(<SearchLog view={failed} />);
    const texts = lineTexts();
    expect(texts).toHaveLength(3);
    expect(texts[2]).toMatch(/không thành công/i);
  });

  it("never fetches and runs no BFS of its own", async () => {
    render(<SearchLog view={done} />);
    advance(LEVEL_MS * 10);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("restarts from level 0 when the response changes", () => {
    const { rerender } = render(<SearchLog view={done} />);
    advance(LEVEL_MS * 10);
    const other: View = { status: "done", query: { from: "X", to: "Y" }, response: { ...RESPONSE, levels: RESPONSE.levels.slice(0, 1) } };
    rerender(<SearchLog view={other} />);
    expect((lineTexts()).some((t) => t.includes("Cấp 1"))).toBe(false);
  });
});
