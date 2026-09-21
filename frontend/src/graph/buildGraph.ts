// The data of the drawing (SPEC ADR-014, Q-14 — mở lại và chốt lại ở v2.17: đồ thị 3D xoay được),
// built from SearchResponse.levels and .path ONLY: no BFS of its own and no API call. Pure: no
// 3d-force-graph, no Three.js, no WebGL.
//
//  * a node per name of `levels`; `level` is its BFS depth (levels[k] = discovered at depth k);
//  * the only links are those of the found path, directed and in path order: the response does not
//    say which node discovered which, so nothing else is drawn as a link;
//  * layout (design: 2026-09-21; zigzag chosen over a straight line, 2026-09-21 follow-up): the
//    start sits exactly at the centre of the sphere. Every other node — path or explored alike — has
//    one FIXED spot on the spherical *shell* that belongs to its own level (shell k never overlaps
//    shell k+1, so depth still reads as the graph is rotated), from a deterministic hash of the
//    node's own name. The found path is just the sequence of links between those fixed spots, so it
//    zigzags from shell to shell instead of running along one straight ray — the path is no longer a
//    special case of the layout, only of the colouring/sizing (see nodeOf). Layout, colours and
//    sizes are the implementation's choice and not part of any contract.
import type { SearchResponse } from "../api/types";

// Four semantic roles (design: sixth-degree.ranisaro.com-DESIGN.md, "Legend / Status Indicators"),
// all derived from data already in SearchResponse — nothing here runs a BFS or calls the API:
//   start    = path[0]
//   end      = path[last] (path[0] again when the path is a single node: start wins, see nodeOf)
//   path     = the other nodes/links of the found path
//   explored = every other node that `levels` lists
export type NodeRole = "start" | "end" | "path" | "explored";

/** A node of the 3D graph (3d-force-graph's NodeObject, `id` = the person's canonical name). `x/y/z`
 * are also mirrored onto `fx/fy/fz` (fixed position): buildGraph is the only layout engine here, so
 * the force simulation must never move a node from where this file put it. */
export interface Node3D {
  id: string;
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  val: number;
  color: string;
  level: number;
  onPath: boolean;
  role: NodeRole;
  /** The name shown on hover, for every node (design: 2026-09-21) — not only path nodes. */
  label: string;
}

/** A link of the 3D graph (3d-force-graph's LinkObject): `source`/`target` are node ids. */
export interface Link3D {
  id: string;
  source: string;
  target: string;
  color: string;
  /** The level of the later end: the link appears together with it (see ../graph/style.ts). */
  level: number;
}

export interface GraphData3D {
  nodes: Node3D[];
  links: Link3D[];
}

// A level's nodes sit on the spherical shell [k * SHELL_WIDTH, k * SHELL_WIDTH + SHELL_WIDTH *
// SHELL_FILL); SHELL_FILL < 1 leaves a gap so no two consecutive shells can ever overlap, whatever
// the hash gives. Applies to every node of that level — path and explored alike (see `placeOnShell`).
export const SHELL_WIDTH = 90;
const SHELL_FILL = 0.88;
const NODE_VAL = 1;
const PATH_NODE_VAL = 5;
// exported so the legend swatches match the drawing exactly (design: Start/End/Path/Explored)
export const START_COLOR = "#10B981";
export const END_COLOR = "#EF4444";
export const PATH_COLOR = "#6366F1";
export const EXPLORED_COLOR = "#A855F7";

// A small deterministic hash of a string into [0, 1) (FNV-1a, then normalised). Not cryptographic —
// only used to place a node on its shell so the same response always draws the same way.
function hashUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** A node's one fixed spot on its level's spherical shell: the radius is jittered inside the shell
 * band, the two angles are hashed independently and combined with an inverse-cosine colatitude so
 * points spread evenly over the *whole* sphere surface (not just its equator, the way a plain
 * 2D-angle-in-3D would). Used for every node of a level — path and explored are laid out identically;
 * only the start is special-cased (see buildGraph), so it sits exactly at the sphere's centre. */
function placeOnShell(name: string, shellIndex: number): { x: number; y: number; z: number } {
  const shellMin = shellIndex * SHELL_WIDTH;
  const shellSpan = SHELL_WIDTH * SHELL_FILL;
  const radius = shellMin + hashUnit(`r:${name}`) * shellSpan;
  const theta = 2 * Math.PI * hashUnit(`theta:${name}`); // azimuth, full circle
  const phi = Math.acos(1 - 2 * hashUnit(`phi:${name}`)); // colatitude, uniform over the sphere
  return { x: radius * Math.sin(phi) * Math.cos(theta), y: radius * Math.sin(phi) * Math.sin(theta), z: radius * Math.cos(phi) };
}

export function buildGraph(response: SearchResponse): GraphData3D {
  const nodes: Node3D[] = [];
  const nodeById = new Map<string, Node3D>();
  const links: Link3D[] = [];

  const addNode = (node: Node3D): void => {
    nodes.push(node);
    nodeById.set(node.id, node);
  };

  const pathNames = response.path.map((person) => person.name);
  const onPath = new Set(pathNames);
  const startName = pathNames[0];
  const endName = pathNames[pathNames.length - 1];
  const role = (name: string): NodeRole => {
    if (name === startName) return "start"; // wins over "end" when the path is a single node
    if (name === endName) return "end";
    return onPath.has(name) ? "path" : "explored";
  };
  // The start is the one node placed by hand, at the exact centre (radius 0): everything else,
  // path or explored, gets its fixed spot from `placeOnShell` — see the file comment above.
  const positionOf = (name: string, r: NodeRole, shellIndex: number): { x: number; y: number; z: number } =>
    r === "start" ? { x: 0, y: 0, z: 0 } : placeOnShell(name, shellIndex);

  response.levels.forEach((level, k) => {
    // A name is drawn once (SPEC I-2): the first level that lists it wins.
    const members = level.nodes.filter((name, i) => !nodeById.has(name) && level.nodes.indexOf(name) === i);
    members.forEach((name) => {
      const r = role(name);
      const { x, y, z } = positionOf(name, r, k);
      addNode(nodeOf(name, onPath.has(name), r, k, x, y, z));
    });
  });

  // `levels` always lists the path (SPEC §4.3-4.4); if it did not, the node is still drawn, on the
  // shell for its own position in the path (its BFS level is unknown, so the path index stands in).
  pathNames.forEach((name, i) => {
    if (nodeById.has(name)) return;
    const r = role(name);
    const { x, y, z } = positionOf(name, r, i);
    addNode(nodeOf(name, true, r, i, x, y, z));
  });

  for (let i = 0; i + 1 < pathNames.length; i++) {
    const from = pathNames[i]!;
    const to = pathNames[i + 1]!;
    if (from === to || links.some((link) => link.source === from && link.target === to)) continue;
    links.push({
      id: `path:${i}`,
      source: from,
      target: to,
      color: PATH_COLOR,
      level: Math.max(nodeById.get(from)!.level, nodeById.get(to)!.level),
    });
  }

  return { nodes, links };
}

const ROLE_COLOR: Record<Exclude<NodeRole, "explored">, string> = {
  start: START_COLOR,
  end: END_COLOR,
  path: PATH_COLOR,
};

function nodeOf(name: string, onPath: boolean, role: NodeRole, level: number, x: number, y: number, z: number): Node3D {
  const color = onPath ? ROLE_COLOR[role as Exclude<NodeRole, "explored">] : EXPLORED_COLOR;
  const val = onPath ? PATH_NODE_VAL : NODE_VAL;
  return { id: name, x, y, z, fx: x, fy: y, fz: z, val, color, level, onPath, role, label: name };
}
