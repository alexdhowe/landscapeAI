/**
 * How much bigger things are at the front of a bed than at the back.
 *
 * ---------------------------------------------------------------------
 * The problem
 * ---------------------------------------------------------------------
 * A swapped material is drawn at one gauge for the whole region — one
 * stone size, edge to edge. A bed is not edge to edge: it recedes. On the
 * first real photograph a bed ran twelve feet from the lawn to the porch
 * and the stones at the near edge came out the same size as the stones
 * six feet further away, which reads as carpet laid over the picture
 * rather than as ground going away from you. The gauge fix two sessions
 * back got the *average* size right and this is the other half of the
 * same report: "maybe the scaling or the angle doesn't match".
 *
 * ---------------------------------------------------------------------
 * The photograph already carries the answer
 * ---------------------------------------------------------------------
 * There is no camera model here, no focal length, no height. There does
 * not need to be. The segmentation reports the plants standing in the
 * region as ellipses, and shrubs in one bed are roughly one size in the
 * world — so **how their drawn size falls off as they go up the frame is
 * the perspective**, measured off the customer's own photograph.
 *
 * Under a pinhole camera looking at a ground plane, a thing of fixed real
 * size appears with a height proportional to its distance below the
 * horizon line in the image. So fitting a straight line through
 * (centre, radius) and asking where it crosses zero gives the horizon,
 * and from there every row of the picture has a scale.
 *
 * On the first bed this was tried against — ten plants, three tulip
 * clumps and seven boxwoods — the fit put the horizon at 0.29 of frame
 * height, which lands on the porch floor line where a standing
 * photographer's eye level belongs.
 *
 * ---------------------------------------------------------------------
 * When it refuses
 * ---------------------------------------------------------------------
 * A fit needs plants, spread out, that actually shrink with distance.
 * Fewer than three, or all at one depth, or a line that says things grow
 * as they recede, and there is nothing here worth believing: the region
 * gets one gauge, exactly as before. A wrong perspective is far worse
 * than none, so the scale it hands back is clamped either way.
 *
 * Pure. Ellipses in, a number per row out.
 */
import type { Planting } from "../vision/types";

/** The fewest plants worth fitting a line through. */
const MIN_PLANTS = 3;

/**
 * How far apart the nearest and furthest plant have to be, as a fraction
 * of frame height. Below this the fit is reading noise: a hedge along one
 * wall is all at one depth, and the slope through it means nothing.
 */
const MIN_SPREAD = 0.04;

/**
 * How far above the closest plant the horizon must land. A horizon that
 * comes out inside the planting is not a horizon, it is a bad fit, and
 * the scale it implies goes to infinity at that row.
 */
const MIN_CLEARANCE = 0.05;

/** Nothing is drawn smaller or larger than this against the region mean. */
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.9;

/** The ground plane a photograph implies, as one number: the horizon row. */
export type GroundPlane = {
  /** Normalized image row where things of any size vanish to nothing. */
  horizon: number;
};

/**
 * Fit a ground plane to the plants standing in a region, or null when the
 * plants cannot support one.
 */
export function fitGroundPlane(
  plantings: readonly Planting[] | undefined,
): GroundPlane | null {
  const plants = plantings ?? [];
  if (plants.length < MIN_PLANTS) return null;

  const rows = plants.map((plant) => plant.cy);
  const spread = Math.max(...rows) - Math.min(...rows);
  if (spread < MIN_SPREAD) return null;

  // Least squares of drawn half-height against row: ry = slope·cy + base.
  const n = plants.length;
  const meanY = rows.reduce((a, b) => a + b, 0) / n;
  const meanR = plants.reduce((a, p) => a + p.ry, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (const plant of plants) {
    covariance += (plant.cy - meanY) * (plant.ry - meanR);
    variance += (plant.cy - meanY) ** 2;
  }
  if (variance === 0) return null;
  const slope = covariance / variance;
  // Plants that do not grow as they come toward the camera are not
  // telling us about perspective — they are telling us this bed has big
  // plants at the back, which is a fact about the bed and not the lens.
  if (slope <= 0) return null;

  const horizon = meanY - meanR / slope;
  if (!Number.isFinite(horizon)) return null;
  if (horizon > Math.min(...rows) - MIN_CLEARANCE) return null;
  return { horizon };
}

/**
 * How much bigger a thing at row `y` is than the same thing at `reference`.
 *
 * Distance below the horizon, as a ratio. Clamped hard: a fit is an
 * estimate off ten ellipses, and a stone drawn twice life size at the
 * front of a bed is a worse mistake than one drawn at the average.
 */
export function depthScale(
  plane: GroundPlane,
  y: number,
  reference: number,
): number {
  const here = y - plane.horizon;
  const there = reference - plane.horizon;
  if (here <= 0 || there <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, here / there));
}

/** One horizontal slice of a region, and the scale the material takes in it. */
export type DepthBand = {
  /** Normalized rows this band covers. */
  top: number;
  bottom: number;
  /** Multiplier on the region's gauge inside it. */
  scale: number;
};

/**
 * Slice a region into bands of equal depth.
 *
 * Horizontal slices, because rows of a photograph *are* lines of equal
 * depth on a ground plane. Each gets the material at its own size and the
 * grain is stochastic, so where two bands meet there is a change of scale
 * and no seam to see. Three is enough to read as recession and few enough
 * that the geometry stays cheap; the count is fixed rather than derived
 * because a band per hundred pixels would be a lot of stones to draw for
 * a difference nobody can point at.
 */
export function depthBands(
  plane: GroundPlane | null,
  top: number,
  bottom: number,
  count = 3,
): DepthBand[] {
  const middle = (top + bottom) / 2;
  if (!plane || bottom <= top) {
    return [{ top, bottom, scale: 1 }];
  }
  const bands: DepthBand[] = [];
  for (let i = 0; i < count; i++) {
    const bandTop = top + ((bottom - top) * i) / count;
    const bandBottom = top + ((bottom - top) * (i + 1)) / count;
    bands.push({
      top: bandTop,
      bottom: bandBottom,
      scale: depthScale(plane, (bandTop + bandBottom) / 2, middle),
    });
  }
  return bands;
}
