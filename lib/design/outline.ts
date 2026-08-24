/**
 * Drawing a region's boundary as the curve it is.
 *
 * The object graph stores a region as a list of vertices, and that list is
 * the artifact — areas, hit testing and every quantity downstream read it,
 * unchanged. What gets *drawn* from it is a view (map section 1), and a
 * polyline through twenty points is the wrong view of a bed edge: a real
 * mulch bed curves, and a chain of straight chords reads as faceted no
 * matter how many vertices the model returns.
 *
 * So the drawn path is smoothed here. Two properties decide how:
 *
 *   **It may never bulge outward.** The complaint that prompted this was
 *   an outline running across the river-rock border of a bed rather than
 *   stopping inside it, and a smoothing scheme that overshoots on convex
 *   turns — a Catmull-Rom spline through the points, say — would put the
 *   swapped material further over that border, not less. Corner cutting
 *   (Chaikin) stays strictly inside the polygon it is cutting, so
 *   smoothing can only ever pull the fill *off* the edging.
 *
 *   **A real corner stays a corner.** A driveway is a rectangle and a step
 *   is square; rounding those is not smoothing, it is being wrong in a
 *   different direction. So a vertex is only cut where the turn is shallow
 *   enough to be part of a curve.
 *
 * Pure. No DOM. Tested in `__tests__/outline.test.ts`.
 */
import type { NormalizedPoint } from "../vision/types";

export type SmoothOptions = {
  /**
   * How many corner-cutting passes. Each one doubles the point count and
   * halves the remaining facet; two is enough to read as a curve at any
   * size this is drawn at, and four would be a lot of path data for a
   * difference nobody can see.
   */
  iterations?: number;
  /**
   * The sharpest turn that still counts as part of a curve, in degrees of
   * deviation from straight. A bed edge sampled every few percent turns a
   * few degrees per vertex; a building corner turns ninety.
   */
  maxTurnDegrees?: number;
};

const DEFAULTS = { iterations: 2, maxTurnDegrees: 75 } satisfies Required<SmoothOptions>;

/** Deviation from straight at `b`, in degrees. 0 is straight on, 180 is a spike. */
function turnDegrees(
  a: NormalizedPoint,
  b: NormalizedPoint,
  c: NormalizedPoint,
): number {
  const inX = b[0] - a[0];
  const inY = b[1] - a[1];
  const outX = c[0] - b[0];
  const outY = c[1] - b[1];
  const inLen = Math.hypot(inX, inY);
  const outLen = Math.hypot(outX, outY);
  // A repeated point has no direction to turn from; treat it as straight
  // so it is cut away rather than preserved as a false corner.
  if (inLen === 0 || outLen === 0) return 0;
  const cos = (inX * outX + inY * outY) / (inLen * outLen);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/**
 * One corner-cutting pass over a closed ring.
 *
 * Each edge contributes its quarter and three-quarter points, which is
 * what keeps the result inside the original. A vertex whose turn is too
 * sharp is kept as-is instead, so the corner survives.
 */
function cutCorners(ring: NormalizedPoint[], maxTurn: number): NormalizedPoint[] {
  const n = ring.length;
  const out: NormalizedPoint[] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];
    if (turnDegrees(prev, curr, next) > maxTurn) {
      out.push(curr);
      continue;
    }
    out.push([
      curr[0] + (prev[0] - curr[0]) * 0.25,
      curr[1] + (prev[1] - curr[1]) * 0.25,
    ]);
    out.push([
      curr[0] + (next[0] - curr[0]) * 0.25,
      curr[1] + (next[1] - curr[1]) * 0.25,
    ]);
  }
  return out;
}

/**
 * The ring to draw for a region, smoothed. Never larger than the polygon
 * it came from, and never rounder at a genuine corner.
 */
export function smoothOutline(
  polygon: readonly NormalizedPoint[],
  options: SmoothOptions = {},
): NormalizedPoint[] {
  const iterations = options.iterations ?? DEFAULTS.iterations;
  const maxTurn = options.maxTurnDegrees ?? DEFAULTS.maxTurnDegrees;
  // Below four points there is no curve to find — a triangle is corners.
  if (polygon.length < 4 || iterations < 1) return [...polygon];
  let ring: NormalizedPoint[] = [...polygon];
  for (let i = 0; i < iterations; i++) ring = cutCorners(ring, maxTurn);
  return ring;
}

/**
 * An SVG path for a closed ring, in whatever coordinate space the caller
 * scales into. Straight segments between already-smoothed points: the
 * curve is in the point list, not in the path commands, so what is drawn
 * and what is masked cannot disagree.
 */
export function closedPathData(
  ring: readonly NormalizedPoint[],
  width: number,
  height: number,
): string {
  if (ring.length === 0) return "";
  const parts = ring.map(
    ([x, y], i) => `${i === 0 ? "M" : "L"}${(x * width).toFixed(2)},${(y * height).toFixed(2)}`,
  );
  return `${parts.join(" ")} Z`;
}
