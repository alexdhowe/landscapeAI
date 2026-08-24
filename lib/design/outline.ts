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


/**
 * Twice the signed area. Positive or negative tells us which way the ring
 * winds, which is the only way to know which side of an edge is "inside".
 */
function signedDoubleArea(ring: readonly NormalizedPoint[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum;
}

/**
 * Pull a ring inward by a fixed distance.
 *
 * Used for the material fill, not for the outline. A bed is edged with
 * cobbles or steel or brick, the traced boundary lands on or near that
 * edging, and the two ways to be wrong are not equally bad: material
 * stopping a hair short of the edging is what a real bed looks like, and
 * material painted across the customer's own stone border is the thing
 * they notice immediately. So the fill sits just inside the line.
 *
 * Each vertex moves along its angle bisector. That is exact for a convex
 * corner and good enough everywhere else at the distances this is used at
 * — a fraction of a percent of the frame. Anything larger wants a real
 * polygon offset with self-intersection handling, so the amount is capped
 * rather than trusted.
 */
const MAX_INSET = 0.02;

export function insetOutline(
  ring: readonly NormalizedPoint[],
  amount: number,
): NormalizedPoint[] {
  const distance = Math.min(Math.abs(amount), MAX_INSET);
  if (ring.length < 3 || distance === 0) return [...ring];
  // Which way is in: flip the normal for a ring wound the other way, or
  // this pushes outward and does the opposite of its job.
  const winding = signedDoubleArea(ring) > 0 ? 1 : -1;
  const n = ring.length;
  return ring.map((curr, i) => {
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    // Unit normals of the two edges meeting here, pointing inward. The
    // sign is the one thing to get right: image coordinates put y downward,
    // so the normal that is "left of travel" in maths is the outward one
    // here, and an inset with the sign flipped pushes the fill further
    // over the border it exists to keep off.
    const edge = (a: NormalizedPoint, b: NormalizedPoint) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len === 0) return null;
      return [(-dy / len) * winding, (dx / len) * winding] as const;
    };
    const inNormal = edge(prev, curr);
    const outNormal = edge(curr, next);
    const normals = [inNormal, outNormal].filter((v): v is readonly [number, number] => v !== null);
    if (normals.length === 0) return [curr[0], curr[1]] as NormalizedPoint;
    let nx = 0;
    let ny = 0;
    for (const [x, y] of normals) {
      nx += x;
      ny += y;
    }
    const len = Math.hypot(nx, ny);
    if (len === 0) return [curr[0], curr[1]] as NormalizedPoint;
    // A sharp corner needs to travel further along the bisector to end up
    // `distance` from both edges; the bisector's own length says how much,
    // and it is capped so a spike does not fly across the shape.
    const scale = Math.min(3, 1 / Math.max(0.34, len / normals.length));
    return [
      curr[0] + (nx / len) * distance * scale,
      curr[1] + (ny / len) * distance * scale,
    ] as NormalizedPoint;
  });
}


/**
 * The outline to use for a region: the customer's correction if they made
 * one, otherwise what the segmentation produced.
 *
 * One function, because there are five places that draw a region — the
 * customer's canvas, its mask, its hit target, the rep's canvas and the
 * marker placement — and a correction that reached four of them would be
 * worse than one that reached none.
 */
export function effectiveOutline(
  region: { id: string; polygon: NormalizedPoint[] },
  adjusted: Record<string, NormalizedPoint[]> | undefined,
): NormalizedPoint[] {
  return adjusted?.[region.id] ?? region.polygon;
}

/** How much of the frame a correction may not exceed, in points. */
export const MAX_OUTLINE_POINTS = 400;

/**
 * Is this something a region outline may be set to?
 *
 * The browser is not trusted with this: an outline reaches the rep's
 * screen and the frozen snapshot, so it has to be a real closed shape
 * inside the picture before it is stored.
 */
export function isUsableOutline(value: unknown): value is NormalizedPoint[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_OUTLINE_POINTS) {
    return false;
  }
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) return false;
    const [x, y] = point;
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  }
  // A ring that encloses nothing is not an outline, however many points
  // it has — three points on one line, or every point the same.
  return Math.abs(signedDoubleArea(value as NormalizedPoint[])) > 1e-6;
}
