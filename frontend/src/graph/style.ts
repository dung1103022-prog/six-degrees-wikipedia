// What is visible while the levels are revealed (SPEC ADR-005: the frontend animates by level).
// `visibleLevels` = how many levels are shown, so level k is visible once k < visibleLevels.
// Unlike the pre-v2.17 Sigma layout (a per-node/per-edge "hidden" reducer Sigma read every frame),
// 3d-force-graph is fed a full `{nodes, links}` snapshot on every update (GraphView.tsx calls
// `.graphData()` again each time `visibleLevels` changes): this file's job is to compute that
// snapshot, not to flag rows as hidden. A node keeps its own object identity across snapshots (the
// same Node3D reference from GraphView's one `buildGraph` call is filtered in and out, never
// cloned), so its fixed fx/fy/fz position is stable while more of the graph is revealed.
// No 3d-force-graph/Three import here on purpose (ADR-014): this file is used by graphData.test.ts
// without WebGL.
import type { GraphData3D } from "./buildGraph";

export function visibleGraph(data: GraphData3D, visibleLevels: number): GraphData3D {
  const nodes = data.nodes.filter((node) => node.level < visibleLevels);
  const ids = new Set(nodes.map((node) => node.id));
  const links = data.links.filter((link) => link.level < visibleLevels && ids.has(link.source) && ids.has(link.target));
  return { nodes, links };
}
