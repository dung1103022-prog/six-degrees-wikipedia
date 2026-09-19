// SPEC ADR-006, Q-15, §7.9 — FE-02: search history in localStorage.
// What one entry holds and how duplicates are treated is NOT specified (SPEC N-4): these tests use
// distinct entries and do not lock either.
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HISTORY_LIMIT, HISTORY_STORAGE_KEY, useHistory, type HistoryEntry } from "../src/lib/history";

const entry = (i: number): HistoryEntry => ({ from: `From ${i}`, to: `To ${i}` });

function addAll(result: { current: ReturnType<typeof useHistory> }, from: number, to: number) {
  for (let i = from; i < to; i++) act(() => result.current.add(entry(i)));
}

describe("search history", () => {
  afterEach(() => vi.restoreAllMocks());

  it("@spec FE-02 keeps at most 20 entries (one constant)", () => {
    expect(HISTORY_LIMIT).toBe(20);
  });

  it("@spec FE-02 adds an entry and reads it back, also from a fresh hook (page reload)", () => {
    const first = renderHook(() => useHistory());
    expect(first.result.current.entries).toEqual([]);
    act(() => first.result.current.add(entry(1)));
    expect(first.result.current.entries).toEqual([entry(1)]);
    first.unmount();

    const second = renderHook(() => useHistory());
    expect(second.result.current.entries).toEqual([entry(1)]);
  });

  it("@spec FE-02 one add is one entry, also under React StrictMode (which runs updaters twice)", () => {
    const { result } = renderHook(() => useHistory(), { wrapper: StrictMode });
    act(() => result.current.add(entry(1)));
    expect(result.current.entries).toEqual([entry(1)]);
    expect(JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "null")).toEqual([entry(1)]);
    act(() => result.current.add(entry(2)));
    expect(result.current.entries).toHaveLength(2);
  });

  it("@spec FE-02 keeps all of the first 20 entries", () => {
    const { result } = renderHook(() => useHistory());
    addAll(result, 0, 20);
    expect(result.current.entries).toHaveLength(20);
  });

  it("@spec FE-02 the 21st entry drops the oldest one; the list stays at 20", () => {
    const { result } = renderHook(() => useHistory());
    addAll(result, 0, 25);
    const entries = result.current.entries;
    expect(entries).toHaveLength(20);
    for (let i = 0; i < 5; i++) expect(entries).not.toContainEqual(entry(i)); // the 5 oldest are gone
    for (let i = 5; i < 25; i++) expect(entries).toContainEqual(entry(i)); // the 20 newest remain
    // ... and the stored copy respects the limit too
    const stored = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "null");
    expect(stored).toHaveLength(20);
  });

  it("@spec FE-02 empty localStorage: no crash, no entries", () => {
    expect(window.localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
    const { result } = renderHook(() => useHistory());
    expect(result.current.entries).toEqual([]);
  });

  it("@spec FE-02 storage that throws (blocked or full): no crash, and the entries still work in memory", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage is blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(() => useHistory());
    expect(result.current.entries).toEqual([]);
    act(() => result.current.add(entry(1)));
    act(() => result.current.add(entry(2)));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries).toContainEqual(entry(1));
    expect(result.current.entries).toContainEqual(entry(2));
  });

  it.each([
    ["JSON that does not parse", "{not json"],
    ["a truncated JSON array", '[{"from":"A","to"'],
    ["valid JSON that is not a list", '{"from":"A","to":"B"}'],
    ["a JSON string", '"just text"'],
  ])("@spec FE-02 corrupt localStorage (%s): no crash, no entries, and adding still works", (_label, raw) => {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, raw);
    const { result } = renderHook(() => useHistory());
    expect(result.current.entries).toEqual([]);
    act(() => result.current.add(entry(1)));
    expect(result.current.entries).toEqual([entry(1)]);
    const again = renderHook(() => useHistory());
    expect(again.result.current.entries).toEqual([entry(1)]);
  });
});
