// Animation by level (SPEC ADR-005): level 0 is shown at once, then one more level every LEVEL_MS.
import { useEffect, useState } from "react";

export const LEVEL_MS = 400;

/**
 * How many levels are revealed. `restartOn` is the identity of what is drawn: when it changes the
 * animation starts again from level 0, even if the number of levels is the same.
 */
export function useLevelAnimation(levelCount: number, restartOn: unknown, msPerLevel: number = LEVEL_MS): number {
  const initial = Math.min(1, levelCount);
  const [state, setState] = useState({ key: restartOn, shown: initial });

  useEffect(() => {
    let shown = initial;
    setState({ key: restartOn, shown });
    if (shown >= levelCount) return;
    const timer = setInterval(() => {
      shown += 1;
      setState({ key: restartOn, shown });
      if (shown >= levelCount) clearInterval(timer);
    }, msPerLevel);
    return () => clearInterval(timer);
  }, [levelCount, restartOn, msPerLevel, initial]);

  // Derived while rendering, so a new result never shows one frame of the old, finished animation.
  return state.key === restartOn ? Math.min(state.shown, levelCount) : initial;
}
