// 3d-force-graph (Three.js) drawing of a SearchResponse (SPEC ADR-014, Q-14 — mở lại và chốt lại ở
// v2.17: đồ thị 3D xoay được). It draws what the response holds (`levels`, `path`) and nothing else:
// no BFS, no API call. The levels appear one after the other (ADR-005) and the found path is
// highlighted. The data is built in ../graph (pure, tested without WebGL).
//
// The panel is mounted for the whole life of the search page, not only once a result exists
// (design: 2026-09-21, "Network Visualization luôn hiện"): `response` may be `null` (no search yet),
// in which case the 3D scene exists but is empty — nothing to draw, nothing to hover.
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import type { SearchResponse } from "../api/types";
import { buildGraph, END_COLOR, EXPLORED_COLOR, PATH_COLOR, START_COLOR, type GraphData3D, type Link3D, type Node3D } from "../graph/buildGraph";
import { visibleGraph } from "../graph/style";
import { useLevelAnimation } from "../graph/useLevelAnimation";
import { strings } from "../ui/strings";

const EMPTY_GRAPH: GraphData3D = { nodes: [], links: [] };

// 3d-force-graph sizes its canvas from explicit width()/height() pixel numbers (unlike Sigma, which
// read the container's own CSS size): --graph-height (index.css) still controls how tall the panel
// is, ResizeObserver below just keeps the renderer in step with it.
const CONTAINER_STYLE = { width: "100%", height: "var(--graph-height, 480px)" } as const;

export default function GraphView({ response }: { response: SearchResponse | null }) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ForceGraph3DInstance<Node3D, Link3D> | null>(null);
  const graph = useMemo(() => (response ? buildGraph(response) : EMPTY_GRAPH), [response]);
  const visible = useLevelAnimation(response?.levels.length ?? 0, response);
  const [unavailable, setUnavailable] = useState(false);
  // How many nodes the levels revealed so far actually list (design: "Nodes explored" counter) — a
  // straight sum over data already in the response, not a count read back from the 3D scene.
  const explored = useMemo(
    () => (response ? response.levels.slice(0, visible).reduce((n, level) => n + level.nodes.length, 0) : 0),
    [response, visible],
  );

  // One 3d-force-graph instance for the life of the component: created once, empty, so the panel can
  // mount before any search runs and simply gets fed data later (see the effect below) rather than
  // being torn down and rebuilt on every new search.
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    let fg: ForceGraph3DInstance<Node3D, Link3D>;
    try {
      // The `ForceGraph3D` export is typed for the default NodeObject/LinkObject shape (it is not
      // itself a generic class at the type level, only the instance interface is): cast once, right
      // after construction, to the response's own node/link shape; every chained call below is then
      // checked against Node3D/Link3D.
      fg = new ForceGraph3D(element) as unknown as ForceGraph3DInstance<Node3D, Link3D>;
      fg
        .graphData(EMPTY_GRAPH)
        .backgroundColor("rgba(0,0,0,0)")
        .showNavInfo(false)
        .enableNodeDrag(false)
        .nodeRelSize(3)
        .nodeLabel((node) => node.label) // hover shows the person's name, for every node (design request)
        .nodeColor((node) => node.color)
        .nodeVal((node) => node.val)
        .nodeOpacity(0.92)
        .linkColor((link) => link.color)
        .linkWidth(1.1)
        .linkOpacity(0.9)
        .linkDirectionalArrowLength(4)
        .linkDirectionalArrowRelPos(1)
        .warmupTicks(0) // buildGraph already fixed every node's position (fx/fy/fz): no simulation
        .cooldownTicks(0);
    } catch {
      setUnavailable(true); // no WebGL: say so, do not take the page down
      return;
    }
    setUnavailable(false);
    renderer.current = fg;
    const resize = (): void => {
      fg.width(element.clientWidth).height(element.clientHeight);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      fg._destructor();
      renderer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one instance for the component's life; data is fed by the effect below
  }, []);

  // Feed the fixed layout, revealing one more level at a time (ADR-005). Node/link identity is
  // preserved across calls (visibleGraph filters `graph`, never clones it), so a node's fixed
  // position never moves as more of the graph is revealed.
  useEffect(() => {
    const fg = renderer.current;
    if (fg === null) return;
    fg.graphData(visibleGraph(graph, visible));
  }, [graph, visible, unavailable]);

  if (unavailable) return <p role="note">{strings.graphUnavailable}</p>;
  return (
    <div className="card graph-panel">
      <h2 className="card-title">
        <span className="status-dot status-dot--on" aria-hidden="true" />
        {strings.networkVisualizationTitle}
      </h2>
      <div className="graph-canvas-wrap">
        <div ref={container} role="img" aria-label={strings.graphLabel} className="graph-canvas" style={CONTAINER_STYLE} />
        {response ? <span className="graph-panel-badge">{strings.nodesExplored(explored)}</span> : null}
      </div>
      {response ? (
        <p className="graph-legend">
          <span className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: START_COLOR }} aria-hidden="true" />
            {strings.graphLegendStart}
          </span>
          <span className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: END_COLOR }} aria-hidden="true" />
            {strings.graphLegendEnd}
          </span>
          <span className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: PATH_COLOR }} aria-hidden="true" />
            {strings.graphLegendPath}
          </span>
          <span className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: EXPLORED_COLOR }} aria-hidden="true" />
            {strings.graphLegendOther}
          </span>
        </p>
      ) : null}
    </div>
  );
}
