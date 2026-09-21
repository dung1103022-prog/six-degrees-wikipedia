// Sigma.js + Graphology drawing of a SearchResponse (SPEC ADR-014, Q-14). It draws what the response holds
// (`levels`, `path`) and nothing else: no BFS, no API call. The levels appear one after the other
// (ADR-005) and the found path is highlighted. The data is built in ../graph (pure, tested without WebGL).
import { useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
import { EdgeArrowProgram, type EdgeProgramType } from "sigma/rendering";
import type { SearchResponse } from "../api/types";
import { buildGraph, END_COLOR, EXPLORED_COLOR, PATH_COLOR, START_COLOR, type EdgeAttributes, type NodeAttributes } from "../graph/buildGraph";
import { drawPathLabel } from "../graph/label";
import { edgeDisplay, nodeDisplay } from "../graph/style";
import { useLevelAnimation } from "../graph/useLevelAnimation";
import { strings } from "../ui/strings";

// Sigma refuses a container without a height, so a height is set here; --graph-height (index.css)
// makes it smaller on narrow viewports without touching this (a CSS class alone cannot override an
// inline style, and the height must stay inline: Sigma reads it from the element as soon as it mounts).
const CONTAINER_STYLE = { width: "100%", height: "var(--graph-height, 480px)" } as const;

// Sigma fits the graph to the container using only node positions, then draws labels past that
// (drawPathLabel puts each one to the right of its node, see ../graph/label.ts): the outermost
// node's label — the end of the path — can run past the canvas edge and get clipped. `stagePadding`
// (a Sigma setting) reserves screen-pixel margin around the fit so the label has room to fit inside
// the canvas too. A wide margin on the already-tight mobile canvas would just push nodes closer
// together and fight the anti-overlap staggering in ../graph/label.ts, so only widen it when the
// container is wide enough to spare the room; same width threshold as the label's own compact mode.
const COMPACT_CANVAS_WIDTH_PX = 480;
const WIDE_STAGE_PADDING = 60;
const COMPACT_STAGE_PADDING = 50;

export default function GraphView({ response }: { response: SearchResponse }) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null);
  const graph = useMemo(() => buildGraph(response), [response]);
  const visible = useLevelAnimation(response.levels.length, response);
  const [unavailable, setUnavailable] = useState(false);
  // How many nodes the levels revealed so far actually list (design: "Nodes explored" counter) — a
  // straight sum over data already in the response, not a count read back from Sigma/Graphology.
  const explored = useMemo(() => response.levels.slice(0, visible).reduce((n, level) => n + level.nodes.length, 0), [response, visible]);

  // One Sigma per graph.
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    let sigma: Sigma<NodeAttributes, EdgeAttributes>;
    try {
      sigma = new Sigma<NodeAttributes, EdgeAttributes>(graph, element, {
        zIndex: true, // the highlighted path is drawn over the other nodes
        renderEdgeLabels: false,
        defaultEdgeType: "arrow",
        defaultDrawNodeLabel: drawPathLabel, // path names are staggered so they do not overlap
        stagePadding: element.clientWidth < COMPACT_CANVAS_WIDTH_PX ? COMPACT_STAGE_PADDING : WIDE_STAGE_PADDING,
        // Sigma types its arrow program for untyped attributes; ours are typed (same shape at run time).
        edgeProgramClasses: { arrow: EdgeArrowProgram as unknown as EdgeProgramType<NodeAttributes, EdgeAttributes> },
      });
    } catch {
      setUnavailable(true); // no WebGL: say so, do not take the page down
      return;
    }
    setUnavailable(false);
    renderer.current = sigma;
    return () => {
      sigma.kill();
      renderer.current = null;
    };
  }, [graph]);

  // Reveal the levels: the reducers hide what is deeper than `visible`, then Sigma redraws.
  useEffect(() => {
    const sigma = renderer.current;
    if (sigma === null) return;
    sigma.setSetting("nodeReducer", (_node, attributes) => nodeDisplay(attributes, visible));
    sigma.setSetting("edgeReducer", (_edge, attributes) => edgeDisplay(attributes, visible));
    sigma.refresh();
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
        <span className="graph-panel-badge">{strings.nodesExplored(explored)}</span>
      </div>
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
    </div>
  );
}
