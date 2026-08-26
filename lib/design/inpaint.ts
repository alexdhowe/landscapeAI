/**
 * Filling the hole a removed plant leaves, out of the photograph itself.
 *
 * ---------------------------------------------------------------------
 * The approach this replaced, and why
 * ---------------------------------------------------------------------
 * The first answer was to stop treating a cleared bed as a photograph and
 * repaint it whole in a procedural material. It was wrong in two ways
 * that only showed up in front of a real yard:
 *
 *   **It painted a bed the customer did not choose.** Guessing the mulch
 *   from the model's description and drawing it edge to edge changes
 *   everything the customer was looking at in order to fix the one thing
 *   they asked about.
 *
 *   **It could not reach past the bed.** A material fill is clipped to
 *   the region outline, and a shrub is not: the half of it standing
 *   against the brick, or leaning over the lawn, survived the repaint.
 *   The plant was "removed" and most of it was still there.
 *
 * ---------------------------------------------------------------------
 * What this does instead
 * ---------------------------------------------------------------------
 * Clone-stamping, the way a retoucher would: the hole is filled with the
 * photograph's own pixels. Nothing else on the picture is touched, and
 * because the hole is the plant's own ellipse rather than the bed, it
 * reaches wherever the plant did — over grass, against a wall, into the
 * sky.
 *
 * ---------------------------------------------------------------------
 * Why the pixels come from a patch and not from "just beside"
 * ---------------------------------------------------------------------
 * The obvious clone stamp is to draw the whole photograph shifted by a
 * plant's width, so what lands in the hole is what was next to it. Two
 * things killed that, and both were visible on the first render:
 *
 *   **A shift shorter than the hole samples the hole.** Sliding by a
 *   plant-and-a-half still leaves a third of the hole reading its own
 *   pixels, so a shrub was "removed" and a blurred shrub appeared in its
 *   place. Nothing shorter than twice the hole works, in any direction.
 *
 *   **Twice the hole leaves the bed.** A foundation planting is a strip
 *   about as tall as the shrubs standing in it, and the shrubs are spaced
 *   about their own width apart. Two hole-widths up is the brick; two
 *   down is the lawn; two sideways is the next shrub. There is no
 *   direction where a whole hole's worth of clean bed sits waiting.
 *
 * So the fill is tiled from a *patch* instead: the largest piece of this
 * region that is inside the outline and clear of every plant, preferring
 * one near the hole, and repeated across it. Mulch, gravel and turf are
 * stochastic, so a repeat reads as more of the same material rather than
 * as a pattern — and a patch small enough to fit between two shrubs still
 * exists in beds where no whole-hole donor does.
 *
 * ---------------------------------------------------------------------
 * The part of a plant that was never over the bed
 * ---------------------------------------------------------------------
 * A shrub taller than its bed stands against whatever is behind it, and
 * filling that with mulch is the same mistake the repaint made. So the
 * slice of the hole above the region's outline is filled from further
 * above, and the slice below it from further below: brick stays brick,
 * lawn stays lawn, sky stays sky. Those two are ordinary directional
 * donors, reaching past the hole rather than into it.
 *
 * This module is that arithmetic. The compositing is in `PhotoCanvas`,
 * where the masks and the pattern live.
 *
 * Pure. Ellipses and an outline in, offsets out.
 */
import type { NormalizedPoint, Planting } from "../vision/types";

/**
 * How far out a plant's ellipse counts as "still the plant", when asking
 * whether a piece of photograph is clean. A little wider than the hole
 * itself, because a sample taken off a shrub's outermost leaves is a
 * sample that smears them across the fill.
 */
const OCCUPIED_MARGIN = 1.3;

/**
 * How much bigger than the plant the hole is cut, and how much smaller it
 * settles for.
 *
 * The two ways to be wrong here are not equal. Cutting wide costs a ring
 * of clean bed, which is refilled with clean bed and cannot be seen.
 * Cutting narrow leaves a rim of shrub standing around the fill, which is
 * the whole complaint. So the hole is cut generously — a segmentation
 * that under-sizes an ellipse is a normal failure, and this is what
 * absorbs it.
 *
 * The one thing it must not do is eat a plant that is staying, so the
 * ladder is walked down until it clears them.
 */
const HOLE_MARGINS = [1.3, 1.2, 1.12];

/** The narrowest of those, and the shape everything falls back to. */
const HOLE_MARGIN = HOLE_MARGINS[HOLE_MARGINS.length - 1];

/**
 * The smallest piece of ground worth sampling, as a fraction of the
 * frame's width. Under this it is a handful of pixels and any fill made
 * from it is noise.
 *
 * Deliberately low, because a crowded bed genuinely has nothing bigger:
 * four shrubs in a strip barely taller than they are leave slivers, and a
 * fill from a sliver still beats leaving the shrub standing. What keeps a
 * sliver from reading as a stamped pattern is magnification, below —
 * which is the fix for the hatched patch a real bed produced, not a
 * higher floor here.
 */
const MIN_PATCH = 0.005;

/**
 * How many times a tile may repeat across a hole before the repeat itself
 * becomes the thing you see.
 *
 * Where the region has nothing bigger to offer, the tile is drawn
 * magnified rather than repeated more often. Ground blown up to twice its
 * size is ground; ground stamped six times is a pattern. Past three the
 * softness starts to show against the sharp bed around it, so that is
 * where magnifying stops and repeating resumes.
 */
const MAX_REPEATS = 2;
const MAX_MAGNIFY = 3;

/** How finely the region is searched for clean ground. */
const GRID = 44;

/**
 * How much further it is worth walking for a bigger patch, as a multiple
 * of the extra size. Near matters — the bed is not one colour end to end —
 * but a patch twice the size is worth crossing most of a bed for, because
 * size is what decides whether the fill reads as material or as tiling.
 */
const PATCH_BONUS = 6;

/**
 * How far a patch may be taken from, as a fraction of the frame.
 *
 * A bed is not one colour end to end. Half of it is in the sun and half
 * under the tree, and a big clean patch of the sunlit half is exactly
 * what the size bonus above will reach across a bed to grab — which puts
 * a bright square in a shaded bed, and a bright square is the "random
 * artifact" a real yard reported. Bigger is better only while the light
 * is the same light, and near is the only proxy for that available here.
 */
const MAX_PATCH_DISTANCE = 0.16;

/** Nothing reaches further than this fraction of the frame, in any sense. */
const MAX_REACH = 0.3;

/** Clear of the hole by this much before a donor counts as clean. */
const CLEARANCE = 0.008;

/**
 * How much of a clean circle a square inside it can use. The tile is a
 * rectangle and the clearance is a radius, so a tile drawn at the full
 * radius would put its corners on the very plant it was avoiding.
 */
const CORNER = Math.SQRT1_2;

/** A piece of the photograph to tile the hole with, in normalized units. */
export type Patch = {
  /** Centre of the patch in the source photograph. */
  cx: number;
  cy: number;
  /** Half-width and half-height. Square in normalized units. */
  r: number;
};

/**
 * What one hole needs.
 *
 * `patch` is the ground it is tiled from, or null where this region has no
 * clean ground at all. `above` and `below` are how far to reach for the
 * slices of the hole that were never over the region — null when the plant
 * sat wholly inside its outline and there is no such slice.
 */
export type HolePlan = {
  planting: Planting;
  /** How far past the plant's own ellipse to cut the hole. */
  margin: number;
  patch: Patch | null;
  /** How much to blow the patch up before tiling it. 1 is life size. */
  magnify: number;
  above: number | null;
  below: number | null;
};

/** Is this point inside the polygon? Ray casting, in normalized space. */
function insidePolygon(polygon: readonly NormalizedPoint[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance from a point to a segment, in normalized space. */
function distanceToSegment(
  a: NormalizedPoint,
  b: NormalizedPoint,
  x: number,
  y: number,
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - a[0], y - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq),
  );
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

/** How far this point is from the outline, or 0 if it is outside it. */
function insetFromOutline(
  polygon: readonly NormalizedPoint[],
  x: number,
  y: number,
): number {
  if (!insidePolygon(polygon, x, y)) return 0;
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    best = Math.min(best, distanceToSegment(polygon[j], polygon[i], x, y));
  }
  return best;
}

/**
 * How far this point is from a plant, or 0 if it is on one — never more.
 *
 * The exact distance from a point to an ellipse is a quartic. The usual
 * cheap stand-in walks in along the ray to the centre, and it is wrong in
 * the direction that matters here: it reads long, so a tile sized by it
 * puts its corners on the shrub. Measuring in the space where the ellipse
 * is a unit circle and scaling back by the *shorter* radius reads short
 * instead, which costs a few pixels of tile and never costs a leaf.
 */
function clearOfPlant(plant: Planting, x: number, y: number): number {
  const rx = plant.rx * OCCUPIED_MARGIN;
  const ry = plant.ry * OCCUPIED_MARGIN;
  const t = Math.hypot((x - plant.cx) / rx, (y - plant.cy) / ry);
  if (t <= 1) return 0;
  return (t - 1) * Math.min(rx, ry);
}

/** How far the nearest thing that is not clean ground is from here. */
function clearanceAt(
  polygon: readonly NormalizedPoint[],
  plants: readonly Planting[],
  x: number,
  y: number,
): number {
  let best = insetFromOutline(polygon, x, y);
  if (best === 0) return 0;
  best = Math.min(best, x, 1 - x, y, 1 - y);
  for (const plant of plants) {
    best = Math.min(best, clearOfPlant(plant, x, y));
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Every piece of clean ground in this region, with how big it is.
 *
 * Computed once for the region rather than once per hole: the grid does
 * not change when the customer clears another plant, and a bed of eight
 * shrubs would otherwise search it eight times.
 */
export function cleanGround(
  polygon: readonly NormalizedPoint[],
  plants: readonly Planting[],
): Patch[] {
  if (polygon.length < 3) return [];
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const found: Patch[] = [];
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const x = minX + ((maxX - minX) * i) / GRID;
      const y = minY + ((maxY - minY) * j) / GRID;
      const r = clearanceAt(polygon, plants, x, y) * CORNER;
      if (r >= MIN_PATCH) found.push({ cx: x, cy: y, r: Math.min(r, MAX_REACH) });
    }
  }
  return found;
}

/**
 * The patch this hole should be tiled from: near, and big.
 *
 * A patch bigger than the hole is no better than one exactly its size —
 * it tiles once either way — so size stops counting at the hole's own
 * radius, and past that only nearness decides.
 */
export function patchFor(
  planting: Planting,
  ground: readonly Patch[],
  margin: number = HOLE_MARGIN,
): Patch | null {
  const want = Math.max(planting.rx, planting.ry) * margin;
  const distanceTo = (patch: Patch) =>
    Math.hypot(patch.cx - planting.cx, patch.cy - planting.cy);
  // Near enough to be lit the same way, if this region has anything that
  // near. A bed that does not is a bed where the nearest thing wins.
  const near = ground.filter((patch) => distanceTo(patch) <= MAX_PATCH_DISTANCE);
  const candidates = near.length > 0 ? near : ground;
  let best: Patch | null = null;
  let bestScore = Infinity;
  for (const patch of candidates) {
    const score = distanceTo(patch) - PATCH_BONUS * Math.min(patch.r, want);
    if (score < bestScore) {
      bestScore = score;
      best = patch;
    }
  }
  return best;
}

/**
 * The widest hole that does not reach a plant which is staying.
 *
 * Sampled around the rim rather than solved: the exact condition for two
 * ellipses to touch is a quartic, and sixteen points around the edge is
 * both accurate enough at this scale and obvious enough to read.
 */
function marginFor(planting: Planting, staying: readonly Planting[]): number {
  if (staying.length === 0) return HOLE_MARGINS[0];
  for (const margin of HOLE_MARGINS) {
    let clear = true;
    for (let i = 0; i < 16 && clear; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const x = planting.cx + Math.cos(angle) * planting.rx * margin;
      const y = planting.cy + Math.sin(angle) * planting.ry * margin;
      for (const other of staying) {
        const dx = (x - other.cx) / other.rx;
        const dy = (y - other.cy) / other.ry;
        if (dx * dx + dy * dy <= 1) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return margin;
  }
  return HOLE_MARGIN;
}

/** How far the patch has to be blown up to stay under the repeat cap. */
export function magnifyFor(
  planting: Planting,
  patch: Patch | null,
  margin: number,
): number {
  if (!patch) return 1;
  const hole = Math.max(planting.rx, planting.ry) * margin;
  return Math.min(MAX_MAGNIFY, Math.max(1, hole / (patch.r * MAX_REPEATS)));
}

/** Where a vertical line through `x` enters and leaves the outline. */
function verticalExtent(
  polygon: readonly NormalizedPoint[],
  x: number,
): { top: number; bottom: number } | null {
  let top = Infinity;
  let bottom = -Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (xi > x === xj > x) continue;
    const y = yi + ((yj - yi) * (x - xi)) / (xj - xi);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return top === Infinity ? null : { top, bottom };
}

/**
 * How far up and down to reach for the slices of the hole that were never
 * over this region.
 *
 * The reach has to clear the whole slice *and* the hole, or the donor
 * brings the plant back with it: enough to put the far edge of the slice
 * past the far edge of the hole, plus a little. Off the top or bottom of
 * the photograph there are no pixels, so that direction goes unfilled
 * rather than smeared — the plant was standing against nothing we can see.
 */
function outsideReach(
  planting: Planting,
  polygon: readonly NormalizedPoint[],
  margin: number,
): { above: number | null; below: number | null } {
  const extent = verticalExtent(polygon, planting.cx);
  if (!extent) return { above: null, below: null };
  const holeTop = planting.cy - planting.ry * margin;
  const holeBottom = planting.cy + planting.ry * margin;
  let above: number | null = null;
  let below: number | null = null;
  if (holeTop < extent.top - CLEARANCE) {
    const reach = extent.top - holeTop + CLEARANCE;
    if (reach <= MAX_REACH && holeTop - reach >= 0) above = reach;
  }
  if (holeBottom > extent.bottom + CLEARANCE) {
    const reach = holeBottom - extent.bottom + CLEARANCE;
    if (reach <= MAX_REACH && holeBottom + reach <= 1) below = reach;
  }
  return { above, below };
}

/**
 * Where each hole gets its pixels.
 *
 * `allPlantings` is every plant in the region, including the ones coming
 * out: ground under a shrub that is also being removed is not clean
 * ground, and tiling from it would fill one hole with another.
 */
export function planHoles(
  holes: readonly Planting[],
  allPlantings: readonly Planting[],
  polygon: readonly NormalizedPoint[],
): HolePlan[] {
  if (holes.length === 0) return [];
  const ground = cleanGround(polygon, allPlantings);
  const going = new Set(holes.map((plant) => plant.id));
  const staying = allPlantings.filter((plant) => !going.has(plant.id));
  return holes.map((planting) => {
    const margin = marginFor(planting, staying);
    const patch = patchFor(planting, ground, margin);
    return {
      planting,
      margin,
      patch,
      magnify: magnifyFor(planting, patch, margin),
      ...outsideReach(planting, polygon, margin),
    };
  });
}

/**
 * The plants whose holes this region has to fill.
 *
 * A plant that was taken out leaves one where it stood. So does one that
 * was moved: its old spot has to become bed again before its own pixels
 * are stamped down somewhere else — and that holds even if it is also
 * being replaced, because the replacement is drawn at the *new* spot.
 *
 * A plant that was only replaced leaves no hole: something is drawn over
 * it, in the same place, at the same size.
 */
export function holesToFill(
  plantings: readonly Planting[],
  input: { cleared: ReadonlySet<string>; moved: ReadonlySet<string> },
): Planting[] {
  return plantings.filter(
    (plant) => input.cleared.has(plant.id) || input.moved.has(plant.id),
  );
}
