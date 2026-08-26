/**
 * How long this photo's segmentation is going to take.
 *
 * The vision call runs 55–170 seconds and the wait was designed for six.
 * A customer watching a band of light travel down their photograph for two
 * minutes has no way to tell working from hung, and the honest fix is not
 * to make the call faster — that trade is settled, and settled the other
 * way (README, "The other number") — but to say how long it will be.
 *
 * ---------------------------------------------------------------------
 * Where the numbers come from
 * ---------------------------------------------------------------------
 * Three measurements exist, all from `[vision] segmentation …` lines on a
 * 410×487 photo (0.2 MP): a first pass of 56.2 s, 68.8 s and 75.5 s, and
 * one second pass of 95.6 s against a 56.2 s first pass.
 *
 * `FIRST_PASS_BASE_MS` and `REFINE_RATIO` are fitted to those: 54 s + 10 s
 * per megapixel puts a 0.2 MP photo at 56 s, and 1.7× puts its second
 * pass at 95.2 s, for a total of 151 s against the 152 s measured.
 *
 * `PER_MEGAPIXEL_MS` is the one number here that is a **prior rather than
 * a measurement**, because every photo anyone has run through this has
 * been a small web image. It is deliberately small. What dominates this
 * call is output tokens — up to 16,000 of polygon coordinates — and the
 * number of regions in a yard is set by the yard, not by the pixel count;
 * the API also resizes anything over ~1568px on its long edge before the
 * model sees it, so a stored photo at our 1600px cap is barely larger to
 * the model than one at 1200. A per-megapixel term that is too large
 * shows the customer four minutes for a two-minute wait, which is its own
 * kind of lie.
 *
 * It is calibratable without guessing: every real segmentation logs what
 * it was estimated at against what it took (`lib/vision/timing.ts`), so
 * twenty real uploads settle this coefficient by arithmetic.
 *
 * Pure — no clock, no env, no I/O — so the browser can predict the wait
 * with the same function the server does.
 */

/** What the two passes are expected to cost, in milliseconds. */
export type SegmentationEstimate = {
  firstPassMs: number;
  /** 0 when the refinement pass is off. */
  refineMs: number;
  totalMs: number;
};

/** Fitted: a 0.2 MP photo's first pass measured 56.2 s. */
const FIRST_PASS_BASE_MS = 54_000;

/** A prior, not a measurement. See the module docblock. */
const PER_MEGAPIXEL_MS = 10_000;

/** Fitted: 95.6 s of second pass against a 56.2 s first pass. */
const REFINE_RATIO = 1.7;

/**
 * What a photo of unknown size is assumed to be.
 *
 * Everything is normalised to 1600px on its long edge before it is
 * stored, so the common case is a phone photo at 1600×1200. Assuming that
 * rather than something small means an unknown photo is over-estimated
 * rather than under-estimated, and a wait that finishes early is the
 * forgivable direction.
 */
const ASSUMED_MEGAPIXELS = 1.9;

/**
 * The estimate for a photo.
 *
 * `pixels` is the stored photo's pixel count, or null when nothing could
 * read it — a format whose header this build cannot parse is not a reason
 * to show no estimate at all.
 */
export function estimateSegmentation(
  pixels: number | null,
  options: { refine: boolean },
): SegmentationEstimate {
  const megapixels =
    pixels && pixels > 0 ? pixels / 1_000_000 : ASSUMED_MEGAPIXELS;
  const firstPassMs = Math.round(
    FIRST_PASS_BASE_MS + PER_MEGAPIXEL_MS * megapixels,
  );
  const refineMs = options.refine ? Math.round(firstPassMs * REFINE_RATIO) : 0;
  return { firstPassMs, refineMs, totalMs: firstPassMs + refineMs };
}

/**
 * The estimate again, once the first pass has actually happened.
 *
 * The first pass is the best possible measurement of how fast this photo,
 * this model and this network are today, so the moment it lands the
 * remaining wait stops being a prediction from pixel count and becomes
 * one from a stopwatch. This is what keeps a countdown honest through the
 * long half of the wait.
 */
export function refineEstimateFrom(firstPassMs: number): number {
  return Math.round(firstPassMs * REFINE_RATIO);
}
