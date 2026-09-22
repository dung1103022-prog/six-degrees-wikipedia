// A shared "how much GPU headroom does the ambient background get" signal (design: 2026-09-22, "giảm
// chất lượng nền khi đồ thị 3D đang hiện"). SearchPage/SharePage own the decision -- they know when
// GraphView (its own separate WebGL context) is actually drawing a result, not just mounted empty --
// AmbientBackground only reads it. Kept as a tiny context rather than a prop because AmbientBackground
// is mounted once at the App root (design: 2026-09-22, whole-app background), a sibling of the pages,
// not their child.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface BackgroundQualityValue {
  /** true while something else on the page (the 3D graph) would rather the background used less GPU. */
  reduced: boolean;
  setGraphActive: (active: boolean) => void;
}

const BackgroundQualityContext = createContext<BackgroundQualityValue | null>(null);

export function BackgroundQualityProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(false);
  const value = useMemo<BackgroundQualityValue>(() => ({ reduced, setGraphActive: setReduced }), [reduced]);
  return <BackgroundQualityContext.Provider value={value}>{children}</BackgroundQualityContext.Provider>;
}

export function useBackgroundQuality(): BackgroundQualityValue {
  const ctx = useContext(BackgroundQualityContext);
  if (ctx === null) throw new Error("useBackgroundQuality must be used within a BackgroundQualityProvider");
  return ctx;
}
