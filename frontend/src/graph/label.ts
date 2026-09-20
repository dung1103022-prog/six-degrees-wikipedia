// A node-label drawer for Sigma's `defaultDrawNodeLabel` setting (GraphView.tsx only).
//
// The whole found path lies on one straight ray (buildGraph.ts): every path label would sit on
// the same line and can run into the next one. This staggers each label onto one of three rows,
// chosen by level, so consecutive names do not collide; otherwise it draws like Sigma's own
// default node-label renderer (position, font, colour).
//
// Three rows, always (not just on a narrow canvas): with only two rows, every *third* path node
// (level, level+2, level+4, ...) still shares a row. That was fine at the original stagePadding,
// but GraphView.tsx now widens stagePadding on a wide canvas too (to stop the last label from
// being clipped, see its own comment), which shrinks the fitted graph and pulls same-row labels
// closer together — enough, empirically, to collide two rows apart even on a 1440px canvas. Three
// rows put same-row neighbours four levels apart instead of two, which held up in Chrome at both
// 1440x900 and 390x844 for a 7-node path. The font is still shrunk on a narrow canvas, which
// helps but is not on its own enough to fix the two-row case.
//
// Reimplemented rather than delegated to sigma/rendering's own `drawDiscNodeLabel`: that module
// touches `WebGL2RenderingContext` as soon as it is imported, which breaks the WebGL-free tests of
// ../graph/style.ts and buildGraph.ts (ADR-014) if it became reachable from them. Only the type is
// imported here (erased at compile time, no such side effect); GraphView.tsx is the only importer.
import type { NodeLabelDrawingFunction } from "sigma/rendering";
import type { EdgeAttributes, NodeAttributes } from "./buildGraph";

const COMPACT_CANVAS_WIDTH_PX = 480;
const ROWS = 3;
const COMPACT_FONT_SCALE = 0.72;
const COMPACT_MIN_FONT_PX = 9;

/** Row 0, 1, 2 -> +1, -1, +2 (in units of `lift`): a zigzag, the third row a little further out
 * than the first so it does not sit on the same line as a forced default position. */
function rowOffset(row: number, lift: number): number {
  const magnitude = Math.floor(row / 2) + 1;
  const sign = row % 2 === 0 ? 1 : -1;
  return sign * magnitude * lift;
}

export const drawPathLabel: NodeLabelDrawingFunction<NodeAttributes, EdgeAttributes> = (context, data, settings) => {
  if (!data.label) return;

  const canvasWidth = context.canvas.clientWidth || context.canvas.width / (window.devicePixelRatio || 1);
  const compact = canvasWidth > 0 && canvasWidth < COMPACT_CANVAS_WIDTH_PX;
  const size = compact ? Math.max(COMPACT_MIN_FONT_PX, Math.round(settings.labelSize * COMPACT_FONT_SCALE)) : settings.labelSize;

  context.fillStyle = settings.labelColor.attribute
    ? ((data as Record<string, unknown>)[settings.labelColor.attribute] as string | undefined) ?? settings.labelColor.color ?? "#000"
    : (settings.labelColor.color ?? "#000");
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;

  const level = typeof data.level === "number" ? data.level : 0;
  const lift = data.size + size * 1.1;
  context.save();
  context.translate(0, rowOffset(level % ROWS, lift));
  context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
  context.restore();
};
