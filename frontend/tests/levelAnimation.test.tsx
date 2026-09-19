// Animation by level (SPEC ADR-005): the levels are revealed one after the other, driven by a timer.
// Fake timers only: nothing really waits.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVEL_MS, useLevelAnimation } from "../src/graph/useLevelAnimation";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useLevelAnimation", () => {
  it("starts with level 0 shown and reveals one more level every LEVEL_MS", () => {
    const { result } = renderHook(() => useLevelAnimation(4, "a"));
    expect(result.current).toBe(1);
    advance(LEVEL_MS - 1);
    expect(result.current).toBe(1);
    advance(1);
    expect(result.current).toBe(2);
    advance(LEVEL_MS);
    expect(result.current).toBe(3);
  });

  it("stops at the last level and leaves no timer running", () => {
    const { result } = renderHook(() => useLevelAnimation(3, "a"));
    advance(LEVEL_MS * 10);
    expect(result.current).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("has nothing to animate for 0 or 1 level", () => {
    expect(renderHook(() => useLevelAnimation(0, "a")).result.current).toBe(0);
    expect(renderHook(() => useLevelAnimation(1, "b")).result.current).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts again from level 0 when the result changes, even with the same number of levels", () => {
    const first = {};
    const { result, rerender } = renderHook(({ key }) => useLevelAnimation(4, key), { initialProps: { key: first as object } });
    advance(LEVEL_MS * 3);
    expect(result.current).toBe(4);
    rerender({ key: {} });
    expect(result.current).toBe(1);
    advance(LEVEL_MS);
    expect(result.current).toBe(2);
  });

  it("clears its timer when unmounted", () => {
    const { unmount } = renderHook(() => useLevelAnimation(5, "a"));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
