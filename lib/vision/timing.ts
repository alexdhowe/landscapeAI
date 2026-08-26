/**
 * What the vision pass cost, on one line, every time it runs.
 *
 * Map section 2's thesis is a customer playing with their own yard inside
 * thirty seconds of landing. The README's timing table measures every leg
 * of that except the one that dominates it, because no session that wrote
 * the table ever had an `ANTHROPIC_API_KEY` in its container — so the
 * model call, which is most of the thirty seconds, has never been a
 * number. Nor has the question that decides whether the refinement pass
 * should exist at all: it is a second call per upload, and nobody has
 * measured it against the first or seen how much of its output survives
 * the merge bounds.
 *
 * Neither of those needs an experiment. They need the app to say what it
 * just spent, so the next real photograph through a real key answers them
 * on its own. That is all this is.
 *
 * The formatting is pure and lives here rather than inline at the call so
 * it can be asserted by a test suite that has no network and no key —
 * the same reason `authConfig()` is split out from the module that calls
 * `NextAuth()`. `classify.ts` measures and logs; this decides the words.
 */
import type { RefinementTally } from "./refine";

/** What became of the second look, and what it cost. */
export type RefinementTiming =
  /** `VISION_REFINE=off`. */
  | { status: "off" }
  /** The first pass found nothing, so there was nothing to correct. */
  | { status: "no-regions" }
  /** Tried and did not finish: the photo would not annotate, or the call threw. */
  | { status: "skipped"; ms: number; reason: string }
  /** Came back, but with no shape for anything we asked about. */
  | { status: "no-shapes"; ms: number }
  | { status: "merged"; ms: number; annotateMs: number; tally: RefinementTally };

export type VisionTiming = {
  firstPassMs: number;
  regions: number;
  refinement: RefinementTiming;
};

/** Everything the segmentation spent, including a second look that failed. */
export function visionTotalMs(timing: VisionTiming): number {
  const second = timing.refinement;
  const spent = second.status === "off" || second.status === "no-regions" ? 0 : second.ms;
  return timing.firstPassMs + spent;
}

/** Milliseconds as seconds, at the precision a thirty-second budget is read in. */
function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

/**
 * An API error is arbitrary text from somewhere else and can be a
 * paragraph. One line of it is what belongs in a log line.
 */
function shortReason(reason: string): string {
  const oneLine = reason.split("\n")[0].trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
}

function refinementPhrase(refinement: RefinementTiming): string {
  switch (refinement.status) {
    case "off":
      return "second look off (VISION_REFINE=off)";
    case "no-regions":
      return "second look not attempted";
    case "skipped":
      return `second look skipped after ${seconds(refinement.ms)} (${shortReason(refinement.reason)})`;
    case "no-shapes":
      return `second look ${seconds(refinement.ms)}, nothing usable came back`;
    case "merged": {
      const { tally } = refinement;
      return [
        `annotate ${seconds(refinement.annotateMs)}`,
        `second look ${seconds(refinement.ms - refinement.annotateMs)}`,
        `outlines ${tally.outlinesAccepted}/${tally.outlinesOffered} kept`,
        // Carried plants are the ones nothing was offered for, moved with
        // their region's own correction. Worth naming: the alternative is a
        // plant stranded outside the region it belongs to.
        `plants ${tally.plantsAccepted}/${tally.plantsOffered} kept` +
          (tally.plantsCarried > 0 ? ` (+${tally.plantsCarried} carried)` : ""),
      ].join(", ");
    }
  }
}

/**
 * The line. Total first, because that is the number with a budget against
 * it; then the legs, because that is where the number comes from.
 */
export function formatVisionTiming(timing: VisionTiming): string {
  const found =
    timing.regions === 1 ? "1 region" : `${timing.regions} regions`;
  return [
    `[vision] segmentation ${seconds(visionTotalMs(timing))}`,
    ` — first pass ${seconds(timing.firstPassMs)}, ${found}`,
    `; ${refinementPhrase(timing.refinement)}`,
  ].join("");
}

/**
 * What the wait was predicted to cost against what it cost.
 *
 * The customer is now shown a countdown, and a countdown is a promise. The
 * per-megapixel term behind it is a prior rather than a measurement (see
 * `lib/vision/estimate.ts`), because every photo run through this so far
 * has been a small web image. This line is how that stops being true:
 * twenty real uploads and the coefficient is arithmetic rather than
 * judgement.
 *
 * Pure, and beside the timing line rather than inside it, because a
 * segmentation that nobody was waiting on — a re-run, a script — has no
 * estimate to compare against.
 */
export function formatEstimateAccuracy(
  estimateMs: number,
  actualMs: number,
  megapixels: number | null,
): string {
  const size = megapixels === null ? "size unknown" : `${megapixels.toFixed(2)} MP`;
  const drift = actualMs - estimateMs;
  const sign = drift >= 0 ? "+" : "−";
  return (
    `[vision] estimate ${seconds(estimateMs)} vs actual ${seconds(actualMs)}` +
    ` (${sign}${seconds(Math.abs(drift))}, ${size})`
  );
}

/**
 * A skipped second look is a problem an operator should see among the
 * warnings; everything else is routine measurement. One line either way,
 * so a run always produces exactly one of these to collect.
 */
export function reportVisionTiming(timing: VisionTiming): void {
  const line = formatVisionTiming(timing);
  if (timing.refinement.status === "skipped") console.warn(line);
  else console.info(line);
}
