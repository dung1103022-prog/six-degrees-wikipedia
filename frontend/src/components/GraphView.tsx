// Sigma.js + Graphology drawing of a SearchResponse (SPEC ADR-014, Q-14). It draws what the response holds
// (`levels`, `path`) and nothing else: no BFS, no API call. The levels appear one after the other
// (ADR-005) and the found path is highlighted. The data is built in ../graph (pure, tested without WebGL).
import { useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
import { EdgeArrowProgram, type EdgeProgramType } from "sigma/rendering";
import type { SearchResponse } from "../api/types";
import { buildGraph, type EdgeAttributes, type NodeAttributes } from "../graph/buildGraph";
import { edgeDisplay, nodeDisplay } from "../graph/style";
import { useLevelAnimation } from "../graph/useLevelAnimation";
import { strings } from "../ui/strings";

// Sigma refuses a container without a height, so the size is fixed here.
const CONTAINER_STYLE = { width: "100%", height: 480, border: "1px solid #d9dde3", borderRadius: 4 } as const;

export default function GraphView({ response }: { response: SearchResponse }) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null);
  const graph = useMemo(() => buildGraph(response), [response]);
  const visible = useLevelAnimation(response.levels.length, response);
  const [unavailable, setUnavailable] = useState(false);

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
  return <div ref={container} role="img" aria-label={strings.graphLabel} style={CONTAINER_STYLE} />;
}
