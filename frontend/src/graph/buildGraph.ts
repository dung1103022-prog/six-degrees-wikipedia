// The data of the drawing (SPEC ADR-014, Q-14), built from SearchResponse.levels and .path ONLY:
// no BFS of its own and no API call. Pure: no Sigma, no WebGL.
//
//  * a node per name of `levels`; `level` is its BFS depth (levels[k] = discovered at depth k);
//  * the only edges are those of the found path, directed and in path order: the response does not say
//    which node discovered which, so nothing else is drawn as an edge;
//  * layout: concentric rings, one per level, the start in the centre; the whole path lies on one ray
//    (a straight highlighted line), the other nodes of a ring are spread evenly around it.
//    Layout, colours and sizes are the implementation's choice and not part of any contract.
import Graph from "graphology";
import type { SearchResponse } from "../api/types";

export interface NodeAttributes {
  x: number;
  y: number;
  size: number;
  color: string;
  zIndex: number;
  level: number;
  onPath: boolean;
  label?: string;
  forceLabel?: boolean;
}

export interface EdgeAttributes {
  size: number;
  color: string;
  type: "arrow";
  zIndex: number;
  /** The level of the later end: the edge appears together with it. */
  level: number;
  onPath: true;
}

export const RING_SPACING = 100;
const NODE_SIZE = 2;
const PATH_NODE_SIZE = 8;
const NODE_COLOR = "#8da0b5";
const PATH_COLOR = "#e4572e";
const PATH_EDGE_SIZE = 3;

export function buildGraph(response: SearchResponse): Graph<NodeAttributes, EdgeAttributes> {
  const graph = new Graph<NodeAttributes, EdgeAttributes>({ type: "directed", multi: false, allowSelfLoops: false });
  const pathNames = response.path.map((person) => person.name);
  const onPath = new Set(pathNames);

  response.levels.forEach((level, k) => {
    // A name is drawn once (SPEC I-2): the first level that lists it wins.
    const members = level.nodes.filter((name, i) => !graph.hasNode(name) && level.nodes.indexOf(name) === i);
    // The path node(s) of this ring come first, so that they sit at angle 0.
    const ordered = [...members.filter((n) => onPath.has(n)), ...members.filter((n) => !onPath.has(n))];
    ordered.forEach((name, i) => {
      const angle = (2 * Math.PI * i) / ordered.length;
      graph.addNode(name, nodeAttributes(name, onPath.has(name), k, k * RING_SPACING * Math.cos(angle), k * RING_SPACING * Math.sin(angle)));
    });
  });

  // `levels` always lists the path (SPEC §4.3-4.4); if it did not, the node is still drawn, on the path's ray.
  pathNames.forEach((name, i) => {
    if (graph.hasNode(name)) return;
    const angle = -0.05;
    graph.addNode(name, nodeAttributes(name, true, i, i * RING_SPACING * Math.cos(angle), i * RING_SPACING * Math.sin(angle)));
  });

  for (let i = 0; i + 1 < pathNames.length; i++) {
    const from = pathNames[i]!;
    const to = pathNames[i + 1]!;
    if (from === to || graph.hasDirectedEdge(from, to)) continue;
    graph.addDirectedEdgeWithKey(`path:${i}`, from, to, {
      size: PATH_EDGE_SIZE,
      color: PATH_COLOR,
      type: "arrow",
      zIndex: 1,
      level: Math.max(graph.getNodeAttribute(from, "level"), graph.getNodeAttribute(to, "level")),
      onPath: true,
    });
  }
  return graph;
}

function nodeAttributes(name: string, onPath: boolean, level: number, x: number, y: number): NodeAttributes {
  return onPath
    ? { x, y, size: PATH_NODE_SIZE, color: PATH_COLOR, zIndex: 1, level, onPath, label: name, forceLabel: true }
    : { x, y, size: NODE_SIZE, color: NODE_COLOR, zIndex: 0, level, onPath };
}
