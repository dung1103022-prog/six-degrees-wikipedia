// 3d-force-graph (Three.js) drawing of a SearchResponse (SPEC ADR-014, Q-14 — mở lại và chốt lại ở
// v2.17: đồ thị 3D xoay được). It draws what the response holds (`levels`, `path`) and nothing else:
// no BFS, no API call. The levels appear one after the other (ADR-005) and the found path is
// highlighted. The data is built in ../graph (pure, tested without WebGL).
//
// The panel is mounted for the whole life of the search page, not only once a result exists
// (design: 2026-09-21, "Network Visualization luôn hiện"): `response` may be `null` (no search yet),
// in which case the 3D scene exists but is empty — nothing to draw, nothing to hover.
//
// Navigation (design: 2026-09-21 follow-up): rotate (drag) and zoom (scroll/pinch) come from
// 3d-force-graph's own OrbitControls. Panning is added on top of that, two ways — the arrow keys via
// OrbitControls' own (built-in but off by default) keyboard handling, and WASD via a small custom
// handler, since OrbitControls only ever listens for one fixed key mapping at a time and this one
// needs both active together. Both only fire while the canvas itself has focus (`tabIndex`, listeners
// scoped to the container element, never `window`), so they never hijack typing in the search form.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import { Vector3 } from "three";
import type { SearchResponse } from "../api/types";
import { buildGraph, END_COLOR, EXPLORED_COLOR, PATH_COLOR, START_COLOR, type GraphData3D, type Link3D, type Node3D } from "../graph/buildGraph";
import { visibleGraph } from "../graph/style";
import { useLevelAnimation } from "../graph/useLevelAnimation";
import { strings } from "../ui/strings";

const EMPTY_GRAPH: GraphData3D = { nodes: [], links: [] };

// 3d-force-graph sizes its canvas from explicit width()/height() pixel numbers (unlike Sigma, which
// read the container's own CSS size): --graph-height (index.css) still controls how tall the panel
// is, the resize listener below just keeps the renderer in step with it.
const CONTAINER_STYLE = { width: "100%", height: "var(--graph-height, 480px)" } as const;

// World units panned per W/A/S/D press, relative to SHELL_WIDTH (90, see ../graph/buildGraph.ts) so
// one press moves a noticeable but not disorienting fraction of one level's shell.
const WASD_PAN_STEP = 30;
const WASD_PAN: Record<string, readonly [dx: number, dy: number]> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

/** The bits of 3d-force-graph's `.controls()` (a real THREE.OrbitControls at runtime) this file
 * uses. `.controls()` is typed as a bare `object` upstream — see 3d-force-graph.d.ts — because the
 * concrete control type varies with `controlType`; ADR-014 pins `controlType` to the OrbitControls
 * default, so this shape is safe here. */
interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
  listenToKeyEvents: (element: HTMLElement) => void;
}

export default function GraphView({ response }: { response: SearchResponse | null }) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<ForceGraph3DInstance<Node3D, Link3D> | null>(null);
  // The camera framing right after mount (before any pan/rotate/zoom), so "Reset view" has
  // something to fly back to; 3d-force-graph's own default for an as-yet-empty graph.
  const home = useRef<{ x: number; y: number; z: number } | null>(null);
  const graph = useMemo(() => (response ? buildGraph(response) : EMPTY_GRAPH), [response]);
  // The reveal animation must run out to the deepest level *actually drawn* (design: 2026-09-21,
  // fix for "path bi nut giua chung"): `response.levels.length` alone is not that ceiling. A path
  // node absent from every `levels[]` entry (buildGraph.ts's fallback, e.g. under bidirectional
  // BFS where `levels` only reflects one side's frontier) is drawn on the shell for its own path
  // index, which can be >= levels.length -- so capping the animation there left such nodes, and
  // the path links touching them, permanently below the `node.level < visibleLevels` cutoff in
  // ../graph/style.ts and never revealed.
  const levelCount = graph.nodes.reduce((max, node) => Math.max(max, node.level + 1), 0);
  const visible = useLevelAnimation(levelCount, response);
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
      //
      // `controlType: "orbit"` MUST be passed here — 3d-force-graph's own default is "trackball", a
      // different Three.js controls class that has no `.listenToKeyEvents` (that method is
      // OrbitControls-only). Without this, `.listenToKeyEvents` below throws a real TypeError the
      // first time this effect runs — outside the try/catch, so React has no error boundary here and
      // the whole page goes blank (a black screen that "flashes" the moment before the effect fires,
      // then never recovers) — bug found in the browser 2026-09-21, fixed here.
      fg = new ForceGraph3D(element, { controlType: "orbit" }) as unknown as ForceGraph3DInstance<Node3D, Link3D>;
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
    home.current = fg.cameraPosition();
    // The arrow keys' own panning is OrbitControls' built-in behaviour, just off until this is
    // called; scoping it to `element` (never `window`) means it only fires once the canvas itself
    // has focus, same as the WASD handler below.
    (fg.controls() as OrbitControlsLike).listenToKeyEvents(element);
    const resize = (): void => {
      fg.width(element.clientWidth).height(element.clientHeight);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      fg._destructor();
      renderer.current = null;
      home.current = null;
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

  // WASD panning: OrbitControls only ever listens for one fixed key mapping (see the file comment),
  // so the arrow keys go through its own `listenToKeyEvents` above and WASD is done by hand here —
  // move the camera and its orbit target together, sideways/up relative to the camera's own current
  // facing (its world-space right/up axes), so panning still feels right after any rotation.
  function panByKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    const step = WASD_PAN[event.code];
    const fg = renderer.current;
    if (!step || fg === null) return;
    event.preventDefault();
    const camera = fg.camera();
    const controls = fg.controls() as OrbitControlsLike;
    const [dx, dy] = step;
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(dx * WASD_PAN_STEP);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * WASD_PAN_STEP);
    camera.position.add(right).add(up);
    controls.target.add(right).add(up);
    controls.update();
  }

  function resetView(): void {
    const fg = renderer.current;
    if (fg === null || home.current === null) return;
    fg.cameraPosition(home.current, { x: 0, y: 0, z: 0 }, 600); // 600ms fly back, looking at the start (sphere centre)
  }

  if (unavailable) return <p role="note">{strings.graphUnavailable}</p>;
  return (
    <div className="card graph-panel">
      <h2 className="card-title">
        <span className="status-dot status-dot--on" aria-hidden="true" />
        {strings.networkVisualizationTitle}
      </h2>
      <div className="graph-canvas-wrap">
        <div
          ref={container}
          role="img"
          aria-label={strings.graphLabel}
          className="graph-canvas"
          style={CONTAINER_STYLE}
          tabIndex={0}
          onKeyDown={panByKeyboard}
        />
        {response ? <span className="graph-panel-badge">{strings.nodesExplored(explored)}</span> : null}
        <button type="button" className="graph-reset-btn" onClick={resetView}>
          {strings.graphResetView}
        </button>
      </div>
      {response ? (
        <>
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
          <p className="graph-pan-hint">{strings.graphPanHint}</p>
        </>
      ) : null}
    </div>
  );
}
