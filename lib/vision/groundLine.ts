/**
 * Holding ground-plane regions to the ground.
 *
 * The segmentation prompt has always said "only outline ground-plane
 * landscape areas — never the house walls, roof, sky". The first real
 * photograph put through it came back with a foundation bed whose polygon
 * climbed a third of the way up the brick facade and a front lawn whose
 * top edge sat on the wall above it. Saying a rule in a prompt is not
 * enforcing it.
 *
 * So the model is asked for one extra thing — the line where vertical
 * surfaces meet the ground, left to right — and every region vertex above
 * that line is pulled down onto it. Placing a polyline is a much easier
 * task than placing a polygon, and being wrong about it is cheap: this
 * only ever moves a vertex *down*, so a ground line that is too high
 * changes nothing and a region that already respects it is untouched.
 *
 * Pure. No I/O. Tested in `__tests__/groundLine.test.ts`.
 */
import type { NormalizedPoint, SegmentedRegion } from "./types";

/**
 * A ground line worth using: at least two points, all inside the frame,
 * spanning enough of the width to be about the picture rather than one
 * corner of it.
 *
 * Below this span the line is dropped rather than extrapolated — a model
 * that located the base of one wall has not told us where the ground is
 * across the whole photo, and stretching it sideways would clamp regions
 * against a line nobody drew.
 */
const MIN_SPAN_X = 0.35;

export function usableGroundLine(
  points: readonly NormalizedPoint[] | undefined,
): NormalizedPoint[] | null {
  if (!points || points.length < 2) return null;
  const inFrame = points.filter(
    ([x, y]) =>
      Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1,
  );
  if (inFrame.length < 2) return null;
  // Left to right, so lookup is a walk rather than a search. The model is
  // asked for them in order; it is not required to comply.
  const sorted = [...inFrame].sort((a, b) => a[0] - b[0]);
  const span = sorted[sorted.length - 1][0] - sorted[0][0];
  if (span < MIN_SPAN_X) return null;
  return sorted;
}

/**
 * The ground's y at a given x: linear between the two points either side,
 * flat beyond the ends.
 *
 * Flat rather than extrapolated on purpose. Continuing the slope of the
 * last segment off the edge of a photo is a guess that grows with distance,
 * and it guesses in the direction that clamps hardest.
 */
export function groundYAt(line: readonly NormalizedPoint[], x: number): number {
  if (x <= line[0][0]) return line[0][1];
  const last = line[line.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    if (x <= x1) {
      const run = x1 - x0;
      // Two points at the same x: no segment to interpolate across.
      if (run <= 0) return Math.max(y0, y1);
      return y0 + ((y1 - y0) * (x - x0)) / run;
    }
  }
  return last[1];
}

/**
 * Pull every vertex above the ground line down onto it.
 *
 * A region left entirely flat by this — every vertex on the line, so it
 * encloses nothing — is dropped by the caller rather than rendered as a
 * sliver, because that is a region the model placed wholly on a wall and
 * there is nothing to recover.
 */
export function clampPolygonToGround(
  polygon: readonly NormalizedPoint[],
  line: readonly NormalizedPoint[],
): NormalizedPoint[] {
  return polygon.map(([x, y]) => {
    const ground = groundYAt(line, x);
    return [x, Math.max(y, ground)] as NormalizedPoint;
  });
}

/** Twice the area of a polygon — sign ignored, winding order irrelevant here. */
function doubleArea(polygon: readonly NormalizedPoint[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum);
}

/**
 * A region flattened to nothing was drawn entirely above the ground line.
 * The threshold is deliberately tiny — this is "encloses no pixels", not
 * "is small".
 */
const MIN_DOUBLE_AREA = 1e-6;

/**
 * How much of a region the clamp is allowed to take.
 *
 * This is the whole guard, and it is per region rather than across the
 * segmentation, because the damage this does is per region.
 *
 * The clamp was built for a bed whose *top* edge strayed onto the brick
 * while its bottom edge sat on the mulch. That region has real area below
 * the line, keeps it, and comes back corrected. A region with almost
 * nothing below the line is a different animal: clamping does not correct
 * it, it deletes it.
 *
 * And there is a whole category of region that is legitimately, permanently
 * above the ground line — **a raised bed**. A bed held up by a retaining
 * wall sits above the point where that wall meets the ground, by
 * definition, in every photograph ever taken of one. No ground line can be
 * drawn that makes it otherwise.
 *
 * Two real photographs of the same yard proved the cost of not knowing
 * that. In one the second pass's ground line flattened a 25.5% bed to a
 * 0.2% ribbon (fixed separately, in `mergeRefinement`). In the other the
 * *first* pass's line — which traced the sweep of the wall cap, dropping to
 * y=0.98 at mid-frame — flattened a 26-vertex, 22.3% bed to nothing at all.
 * Both times the model had it right, said so, and even reported the
 * `raised_bed` and `retaining_wall` that explain why: 0.88 and 0.93
 * confidence. We destroyed the outline anyway.
 *
 * So: a clamp that would leave a region with less than this share of its
 * area does not run for that region. It is the same principle the module
 * always claimed — a correction for an outlier, not a rewrite — applied
 * where it actually bites.
 *
 * The cost is that a region genuinely drawn up a wall is no longer dropped.
 * That case is hypothetical; this one has now happened twice on the only
 * two real photographs anybody has run. A stray region a customer can see
 * and ignore beats their actual bed disappearing.
 */
const MIN_SHARE_KEPT = 0.25;

/**
 * Apply the ground line to a whole segmentation.
 *
 * Every region comes back — corrected where the clamp is a correction,
 * untouched where it would be a demolition. With no usable ground line
 * nothing is touched, which is also what every segmentation stored before
 * this existed gets.
 */
export function holdRegionsToGround<T extends SegmentedRegion>(
  regions: readonly T[],
  groundLine: readonly NormalizedPoint[] | undefined,
): T[] {
  const line = usableGroundLine(groundLine);
  if (!line) return [...regions];
  return regions.map((region) => {
    const polygon = clampPolygonToGround(region.polygon, line);
    const before = doubleArea(region.polygon);
    const after = doubleArea(polygon);
    if (after < MIN_DOUBLE_AREA) return region;
    if (before > 0 && after / before < MIN_SHARE_KEPT) return region;
    return { ...region, polygon };
  });
}
