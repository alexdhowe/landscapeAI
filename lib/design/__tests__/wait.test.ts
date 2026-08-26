/**
 * The wait's arithmetic.
 *
 * What is asserted here is not "the bar is accurate" — it cannot be, the
 * estimate behind it is fitted to three measurements. It is that the bar
 * cannot say anything untrue while being wrong: it never claims a pass
 * has finished when the server has not said so, it never stalls, it never
 * counts below zero, and it says "taking longer than usual" rather than a
 * number once the number has stopped meaning anything.
 */
import { describe, expect, it } from "vitest";

import { readableRemaining, waitView } from "../wait";

const ESTIMATE = { firstPassMs: 56_000, refineMs: 95_000, totalMs: 151_000 };

const reading = (elapsedMs: number) =>
  waitView({ elapsedMs, stage: "reading" as const, estimate: ESTIMATE });

const refining = (elapsedMs: number, firstPassMs = 56_000) =>
  waitView({ elapsedMs, stage: "refining" as const, estimate: ESTIMATE, firstPassMs });

describe("waitView", () => {
  it("starts empty and fills through the first pass", () => {
    expect(reading(0).fraction).toBe(0);
    expect(reading(28_000).fraction).toBeGreaterThan(0.1);
    expect(reading(28_000).fraction).toBeLessThan(reading(50_000).fraction);
  });

  it("never claims the first pass is done while the stage says it is running", () => {
    // The first pass owns 56/151 of the bar. However far past its
    // estimate it runs, the bar stays inside that share: the boundary
    // moves only when the server says the pass landed.
    const share = ESTIMATE.firstPassMs / ESTIMATE.totalMs;
    for (const elapsed of [56_000, 90_000, 200_000, 900_000]) {
      expect(reading(elapsed).fraction).toBeLessThan(share);
    }
  });

  it("keeps creeping past its own estimate rather than stalling", () => {
    const at = [60_000, 90_000, 150_000, 400_000].map((ms) => reading(ms).fraction);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
  });

  it("jumps to the boundary when the server says the first pass landed", () => {
    const share = ESTIMATE.firstPassMs / ESTIMATE.totalMs;
    const justBefore = reading(55_000).fraction;
    const justAfter = refining(56_100).fraction;
    expect(justBefore).toBeLessThan(share);
    expect(justAfter).toBeGreaterThanOrEqual(share);
  });

  it("never fills completely while anything is still running", () => {
    expect(refining(1_000_000).fraction).toBeLessThan(1);
    expect(reading(1_000_000).fraction).toBeLessThan(1);
  });

  it("re-sizes the remaining time from the first pass that actually happened", () => {
    // A first pass that took twice as long says the rest will too, so the
    // countdown at the same elapsed time is longer.
    const onTime = refining(60_000, 56_000).remainingMs!;
    const slow = refining(60_000, 112_000).remainingMs!;
    expect(slow).toBeGreaterThan(onTime);
  });

  it("stops counting down instead of going negative", () => {
    expect(refining(151_000).remainingMs).toBeNull();
    expect(refining(400_000).remainingMs).toBeNull();
    expect(refining(148_000).remainingMs).toBeNull();
  });

  it("says a long overrun is a long overrun", () => {
    expect(refining(150_000).overdue).toBe(false);
    expect(refining(160_000).overdue).toBe(false);
    expect(refining(260_000).overdue).toBe(true);
  });

  it("gives the whole bar to the first pass where there is no second one", () => {
    const noRefine = { firstPassMs: 56_000, refineMs: 0, totalMs: 56_000 };
    const view = waitView({ elapsedMs: 55_000, stage: "reading", estimate: noRefine });
    expect(view.fraction).toBeGreaterThan(0.9);
  });
});

describe("readableRemaining", () => {
  it("is coarse while the estimate is a guess", () => {
    expect(readableRemaining(150_000)).toBe("about 3 minutes");
    expect(readableRemaining(95_000)).toBe("about 2 minutes");
  });

  it("becomes a real countdown in the last ninety seconds", () => {
    expect(readableRemaining(80_000)).toBe("1:20");
    expect(readableRemaining(45_000)).toBe("0:45");
    expect(readableRemaining(9_000)).toBe("0:09");
  });
});
