/**
 * How big a foot of ground is, in this photograph.
 *
 * ---------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------
 * A swapped material was drawn at a gauge fixed as a fraction of the
 * frame: one period every 29 pixels of a 1600px photo, whatever the photo
 * showed. On a bed the model measured at 300 sf that is a "1.5 inch washed
 * river rock" drawn **about twelve times life size** — stones the size of
 * dinner plates. The owner's word for it was "goofy", and goofy is
 * exactly right: nothing about the colour or the lighting is wrong, the
 * stones are just enormous, and a person reads that instantly without
 * being able to name it.
 *
 * The frame fraction was never a scale. It could not be: a photo taken
 * from a front walk and one taken across a parking lot show wildly
 * different amounts of ground in the same 1600 pixels.
 *
 * ---------------------------------------------------------------------
 * Two rulers, both already in the data
 * ---------------------------------------------------------------------
 * 1. **The region's own area.** The segmentation reports
 *    `estimated_area_sf` for every region — the model's honest guess at
 *    the ground it covers, from door widths, siding courses and walkway
 *    widths. Against the polygon's area in pixels that is a scale:
 *    √(px² ÷ sf) pixels to the foot.
 * 2. **The plants.** Failing that, the plant ellipses are a ruler of last
 *    resort: a shrub in a front bed is about three feet across, so the
 *    mean reported radius is about one and a half feet.
 *
 * Using `estimated_area_sf` this way needs saying out loud, because the
 * schema calls it a QA signal and nothing else: it is a rough number, it
 * is not billable, and it must never be shown to a customer or priced
 * from. Drawing with it violates none of that. §1's "the image is a view,
 * never the artifact" is precisely the licence — a rough scale is the
 * right input to a picture and the wrong input to an invoice.
 *
 * Pure — geometry in, a number out.
 */
import type { NormalizedPoint, Planting } from "../vision/types";

/** The reference frame every constant here is written against. */
const REFERENCE_WIDTH = 1600;

/**
 * A shrub's radius, in feet, for the fallback ruler.
 *
 * Boxwood, yew, spirea, a clump of daylilies: a front-bed plant is about
 * three feet across far more often than it is one or ten. Only used when
 * the model gave no area estimate, and only to pick a texture's gauge.
 */
const TYPICAL_PLANT_RADIUS_FT = 1.5;

/**
 * What a yard photo is assumed to show when neither ruler answers.
 *
 * A front yard framed to include the beds, the lawn and some driveway is
 * around forty feet across. Wrong for some photos and wrong by a factor
 * of two at worst, where the fixed frame fraction it replaces was wrong
 * by a factor of thirteen.
 */
const ASSUMED_FRAME_FEET = 40;

/**
 * The range a photograph of a yard can plausibly be at, in pixels per
 * foot at the reference width. Below it the "yard" is a satellite view;
 * above it, a close-up of one shrub. Either means a ruler has produced
 * nonsense — a model that guessed 10,000 sf for a bed, a photo of
 * something that is not a yard — and nonsense is worse than the
 * assumption, because it is confident.
 */
const MIN_PIXELS_PER_FOOT = 4;
const MAX_PIXELS_PER_FOOT = 160;

/** Polygon area in square pixels, from normalized coordinates. */
export function polygonAreaPx(
  polygon: readonly NormalizedPoint[],
  width: number,
  height: number,
): number {
  if (polygon.length < 3) return 0;
  let twice = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    twice +=
      polygon[j][0] * width * (polygon[i][1] * height) -
      polygon[i][0] * width * (polygon[j][1] * height);
  }
  return Math.abs(twice / 2);
}

/**
 * Pixels per foot of ground in this region, or null if neither ruler
 * gives a plausible answer.
 *
 * Expressed at the reference width, so a caller working in a differently
 * sized frame scales it themselves — the two are the same photograph and
 * one number should not depend on which copy of it is being drawn.
 */
export function pixelsPerFoot(region: {
  polygon: readonly NormalizedPoint[];
  estimatedAreaSf?: number;
  plantings?: readonly Planting[];
}): number | null {
  const height = REFERENCE_WIDTH * 0.75;
  const plausible = (value: number): number | null =>
    Number.isFinite(value) && value >= MIN_PIXELS_PER_FOOT && value <= MAX_PIXELS_PER_FOOT
      ? value
      : null;

  if (region.estimatedAreaSf && region.estimatedAreaSf > 0) {
    const areaPx = polygonAreaPx(region.polygon, REFERENCE_WIDTH, height);
    const fromArea = plausible(Math.sqrt(areaPx / region.estimatedAreaSf));
    if (fromArea !== null) return fromArea;
  }

  const plants = region.plantings ?? [];
  if (plants.length > 0) {
    // The mean of both radii, so an ellipse squashed by perspective is
    // read as the plant it is rather than as two different plants.
    const meanRadiusPx =
      plants.reduce(
        (sum, plant) => sum + (plant.rx * REFERENCE_WIDTH + plant.ry * height) / 2,
        0,
      ) / plants.length;
    return plausible(meanRadiusPx / TYPICAL_PLANT_RADIUS_FT);
  }

  return null;
}

/** The fallback, when a region carries neither ruler. */
export function assumedPixelsPerFoot(): number {
  return REFERENCE_WIDTH / ASSUMED_FRAME_FEET;
}

/**
 * The size a material's grain is *drawn* at, in pixels of the frame.
 *
 * Not the physical size, and the difference is deliberate. A 3/8in
 * granite chip in a bed photographed from the street is half a pixel
 * across: physically correct and useless, because the customer is
 * choosing between granite chips and river rock and the picture has to
 * show them a difference. So the gauge is compressed rather than scaled —
 * `k · physical^0.6` — which keeps the ordering (river rock always
 * coarser than granite, always) while lifting the fine end into
 * visibility and holding the coarse end down.
 *
 * The compression only ever *enlarges* a fine material; it never draws
 * anything larger than life, and the ceiling is well under the 29px that
 * caused this. What it costs is literal accuracy about grain size, which
 * a photograph at this distance cannot carry anyway. What it buys is a
 * picture where two materials look like two materials.
 */
export function renderedGaugePx(
  gaugeInches: number,
  pixelsPerFootAtReference: number,
  frameWidth: number,
): number {
  const physical = (pixelsPerFootAtReference * gaugeInches) / 12;
  const compressed = 3 * Math.pow(Math.max(physical, 0.01), 0.6);
  const bounded = Math.min(18, Math.max(2.5, compressed));
  return (bounded * frameWidth) / REFERENCE_WIDTH;
}
