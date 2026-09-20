// What is visible while the levels are revealed (SPEC ADR-005: the frontend animates by level).
// Pure functions: `visibleLevels` = how many levels are shown, so level k is visible once k < visibleLevels.
// The highlight of the path (colour, size, z-order) is part of the attributes and is never removed.
// No Sigma import here on purpose (ADR-014): this file is used by graphData.test.ts without WebGL;
// the label-drawing customization that does need Sigma's types lives in ./label.ts instead.
import type { EdgeAttributes, NodeAttributes } from "./buildGraph";

export function nodeDisplay(attributes: NodeAttributes, visibleLevels: number): NodeAttributes & { hidden: boolean } {
  return { ...attributes, hidden: attributes.level >= visibleLevels };
}

/** A path edge appears with its later end (its `level`), i.e. when both ends are revealed. */
export function edgeDisplay(attributes: EdgeAttributes, visibleLevels: number): EdgeAttributes & { hidden: boolean } {
  return { ...attributes, hidden: attributes.level >= visibleLevels };
}
