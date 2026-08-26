/**
 * The arithmetic behind the wait.
 *
 * Two facts have to be reconciled here and they pull in opposite
 * directions. The vision call runs 55–170 seconds, so the customer needs a
 * bar that moves and a number that counts down or they cannot tell working
 * from hung. And the only honest source for either is an estimate, which
 * will sometimes be wrong.
 *
 * The rules below are what keep a wrong estimate from becoming a lie:
 *
 * - **A bar never claims a stage is finished.** Within a stage it
 *   approaches that stage's share of the bar and never arrives; only the
 *   server saying "the first pass landed" moves it across a boundary. So a
 *   bar sitting at 47% means the first pass is genuinely still running,
 *   whatever the estimate thought.
 * - **A bar never stalls.** Past its estimate it keeps closing the
 *   remaining gap, asymptotically, so an overrun looks slow rather than
 *   broken. `1 − 0.06·est/elapsed` is continuous with the linear part at
 *   the estimate and approaches the boundary without touching it.
 * - **A countdown that has run out says so.** It does not go negative, it
 *   does not sit at "1 second", and past a margin the copy stops
 *   predicting and starts reassuring.
 * - **The estimate improves.** Once the first pass has actually happened
 *   the remaining time is derived from what it took, not from the pixel
 *   count it was guessed from.
 *
 * Pure — elapsed time in, a view out. No clock: the caller owns the
 * ticking, which is also what makes this testable.
 */
import type { SegmentationEstimate } from "../vision/estimate";
import type { SegmentationStage } from "./types";

export type WaitView = {
  /** How full the bar is, 0–1. Never 1 while anything is still running. */
  fraction: number;
  /**
   * Milliseconds left, or null once the estimate has run out. Null is a
   * different thing to say than zero and the copy says it differently.
   */
  remainingMs: number | null;
  /** Past the estimate by enough that saying so is better than a number. */
  overdue: boolean;
  stage: SegmentationStage;
};

/** How far through a stage its elapsed time puts it: 0–1, never 1. */
function progressWithin(elapsedMs: number, estimateMs: number): number {
  if (estimateMs <= 0) return 0.94;
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed <= estimateMs) return 0.94 * (elapsed / estimateMs);
  return 1 - 0.06 * (estimateMs / elapsed);
}

/**
 * Where a wait is, given how long it has been going and what the server
 * last said about it.
 */
export function waitView(input: {
  elapsedMs: number;
  stage: SegmentationStage;
  estimate: SegmentationEstimate;
  /** What the first pass actually took, once the server has said. */
  firstPassMs?: number;
}): WaitView {
  const { elapsedMs, stage, estimate } = input;
  const firstPassMs = input.firstPassMs ?? estimate.firstPassMs;
  const totalMs = Math.max(1, firstPassMs + estimate.refineMs);
  // The first pass's share of the bar. With no second pass it owns all of
  // it, which is why a `VISION_REFINE=off` deployment still gets a bar
  // that fills rather than one that stops halfway.
  const firstShare = estimate.refineMs > 0 ? firstPassMs / totalMs : 1;

  const fraction =
    stage === "reading"
      ? firstShare * progressWithin(elapsedMs, estimate.firstPassMs)
      : firstShare +
        (1 - firstShare) * progressWithin(elapsedMs - firstPassMs, estimate.refineMs);

  const left = totalMs - elapsedMs;
  return {
    fraction: Math.min(0.995, Math.max(0, fraction)),
    // Under five seconds is not worth counting down: "4 seconds left"
    // followed by twenty more is worse than "any moment now".
    remainingMs: left > 5_000 ? left : null,
    overdue: elapsedMs > totalMs * 1.35 + 15_000,
    stage,
  };
}

/**
 * A duration as a customer reads one.
 *
 * Coarse at the top, precise at the bottom, and that split is deliberate.
 * A two-minute wait announced to the second invites the customer to check
 * the arithmetic against the clock, and an estimate fitted to three
 * measurements does not survive that; "about 2 minutes" is both truer and
 * calmer. Inside the last ninety seconds it becomes a real countdown,
 * because by then it is derived from the first pass's measured time
 * rather than from a pixel count, and a ticking number is what makes the
 * end of a long wait feel like an end.
 */
export function readableRemaining(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds >= 90) return `about ${Math.max(2, Math.round(seconds / 60))} minutes`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds - minutes * 60).padStart(2, "0")}`;
}
