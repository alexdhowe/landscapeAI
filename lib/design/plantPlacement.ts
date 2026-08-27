/**
 * Where a plant is, once the customer has had a say.
 *
 * The segmentation says where a plant *stands*; the design says where it
 * should *go*. Those are different facts and both are kept — the same
 * split a corrected outline lives under — so this is the one place that
 * resolves them into the single position everything draws and prices
 * from.
 *
 * ---------------------------------------------------------------------
 * Why a plant cannot be dropped just anywhere
 * ---------------------------------------------------------------------
 * A plant dragged onto the driveway is not a design, it is a mistake the
 * customer will not notice until a rep is standing in their yard. So a
 * move is confined to the region the plant belongs to — and confined
 * *here*, in a pure function the route calls before it writes, rather
 * than in the canvas: a browser can be told anything, and the outline is
 * what the crew will work to.
 *
 * The confinement is a nudge, not a rejection. A drop a little outside
 * the bed is what a fingertip on a phone does, and answering it by
 * refusing the move would read as the drag not working. It lands on the
 * nearest point inside instead.
 *
 * Pure. Geometry in, geometry out.
 */
import type { NormalizedPoint, Planting } from "../vision/types";

/** Where this plant is drawn and priced: moved if moved, else reported. */
export function plantPosition(
  planting: Planting,
  plantPositions: Record<string, NormalizedPoint> | undefined,
): NormalizedPoint {
  return plantPositions?.[planting.id] ?? [planting.cx, planting.cy];
}

/** Has the customer moved this plant at all? */
export function isPlantMoved(
  planting: Planting,
  plantPositions: Record<string, NormalizedPoint> | undefined,
): boolean {
  const moved = plantPositions?.[planting.id];
  if (!moved) return false;
  // A drag that ends where it started is not a move, and must not bill a
  // transplant. A tenth of a percent of the frame is under a pixel on a
  // 1600px photo: a tap, not a decision.
  return Math.hypot(moved[0] - planting.cx, moved[1] - planting.cy) > 0.001;
}

/** Is this point inside the polygon? Ray casting, in normalized space. */
export function isInsidePolygon(
  polygon: readonly NormalizedPoint[],
  point: NormalizedPoint,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** The closest point to `point` on the segment `a`–`b`. */
function closestOnSegment(
  a: NormalizedPoint,
  b: NormalizedPoint,
  point: NormalizedPoint,
): NormalizedPoint {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return a;
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq),
  );
  return [a[0] + t * dx, a[1] + t * dy];
}

/**
 * The nearest point inside the region, or the point itself if it already
 * is.
 *
 * A polygon with fewer than three vertices cannot contain anything, so
 * the point comes back untouched: a region that degenerate is a bug
 * upstream, and refusing to move a plant is not the place to report it.
 */
export function confineToRegion(
  polygon: readonly NormalizedPoint[],
  point: NormalizedPoint,
): NormalizedPoint {
  if (polygon.length < 3) return point;
  if (isInsidePolygon(polygon, point)) return point;
  let best = polygon[0];
  let bestDistance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const candidate = closestOnSegment(polygon[j], polygon[i], point);
    const distance = Math.hypot(candidate[0] - point[0], candidate[1] - point[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  // A hair inside rather than exactly on the line: a plant centred on the
  // boundary reads as half out of the bed, and the next read of
  // `isInsidePolygon` on an exact edge point is a coin toss.
  const toward = nudgeToward(polygon, best);
  return toward;
}

/** Pull a boundary point a little way toward the region's middle. */
function nudgeToward(
  polygon: readonly NormalizedPoint[],
  point: NormalizedPoint,
): NormalizedPoint {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of polygon) {
    cx += x;
    cy += y;
  }
  cx /= polygon.length;
  cy /= polygon.length;
  const dx = cx - point[0];
  const dy = cy - point[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return point;
  const step = Math.min(0.004, length);
  return [point[0] + (dx / length) * step, point[1] + (dy / length) * step];
}

/**
 * Which region a customer dropped a plant into.
 *
 * Decided here rather than in the browser, and decided from the outline
 * rather than from whatever the pointer happened to be over: the drop
 * lands on a photograph with a mask and a texture and a handful of
 * buttons on top of it, and none of those are the design. `plantable`
 * comes in from the caller because what counts as a plantable region is
 * the catalog's business, not geometry's.
 *
 * A drop a little outside every bed still finds one, for the same reason
 * `confineToRegion` nudges rather than refuses — a fingertip on a phone
 * misses by a few pixels, and refusing reads as the drag not working.
 * A drop nowhere near a bed finds nothing, and nothing is added.
 */
export function regionAtPoint<
  T extends { id: string; polygon: readonly NormalizedPoint[] },
>(
  regions: readonly T[],
  point: NormalizedPoint,
  plantable: (region: T) => boolean,
  reach = 0.05,
): T | null {
  const candidates = regions.filter(plantable);
  for (const region of candidates) {
    if (isInsidePolygon(region.polygon, point)) return region;
  }
  let best: T | null = null;
  let bestDistance = reach;
  for (const region of candidates) {
    if (region.polygon.length < 3) continue;
    let distance = Infinity;
    for (let i = 0, j = region.polygon.length - 1; i < region.polygon.length; j = i++) {
      distance = Math.min(
        distance,
        distanceToSegment(region.polygon[j], region.polygon[i], point),
      );
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = region;
    }
  }
  return best;
}

/** Distance from a point to a segment, in normalized space. */
function distanceToSegment(
  a: NormalizedPoint,
  b: NormalizedPoint,
  point: NormalizedPoint,
): number {
  const closest = closestOnSegment(a, b, point);
  return Math.hypot(closest[0] - point[0], closest[1] - point[1]);
}
