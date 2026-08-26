/**
 * The wait estimate.
 *
 * Two of the three coefficients behind it were fitted to real
 * measurements, so the first thing asserted here is that they still
 * reproduce them: a 0.2 MP photo measured 56.2 s of first pass and 95.6 s
 * of second, for 152 s in total. If someone retunes the constants without
 * meaning to, that is the test that says so.
 *
 * The rest is about not lying to a customer: an estimate exists for a
 * photo nobody can size, it is bigger for a bigger photo, and it does not
 * quietly include a second pass on a deployment that has turned one off.
 */
import { describe, expect, it } from "vitest";

import { estimateSegmentation, refineEstimateFrom } from "../estimate";

/** The photo every measurement in the README was taken on: 410x487. */
const MEASURED_PIXELS = 410 * 487;

describe("estimateSegmentation", () => {
  it("reproduces the one segmentation anybody has timed end to end", () => {
    const estimate = estimateSegmentation(MEASURED_PIXELS, { refine: true });
    // Measured: 56.2s first pass, 95.6s second, 152s total.
    expect(estimate.firstPassMs / 1000).toBeCloseTo(56.0, 1);
    expect(estimate.refineMs / 1000).toBeCloseTo(95.2, 1);
    expect(estimate.totalMs / 1000).toBeCloseTo(151.2, 1);
  });

  it("is the first pass alone where the second one is off", () => {
    const estimate = estimateSegmentation(MEASURED_PIXELS, { refine: false });
    expect(estimate.refineMs).toBe(0);
    expect(estimate.totalMs).toBe(estimate.firstPassMs);
  });

  it("asks for more time for a bigger photo", () => {
    const small = estimateSegmentation(400 * 300, { refine: true });
    const phone = estimateSegmentation(1600 * 1200, { refine: true });
    expect(phone.totalMs).toBeGreaterThan(small.totalMs);
  });

  it("still gives a number for a photo whose header nobody could read", () => {
    const unknown = estimateSegmentation(null, { refine: true });
    // Assumed to be a phone photo at the storage cap, so the estimate is
    // generous rather than short — a wait that finishes early is the
    // forgivable direction.
    const phone = estimateSegmentation(1600 * 1200, { refine: true }).totalMs;
    expect(unknown.totalMs).toBeGreaterThan(phone * 0.95);
    expect(unknown.totalMs).toBeLessThanOrEqual(phone);
  });

  it("treats a nonsense pixel count as no pixel count", () => {
    expect(estimateSegmentation(0, { refine: true }).totalMs).toBe(
      estimateSegmentation(null, { refine: true }).totalMs,
    );
    expect(estimateSegmentation(-5, { refine: true }).totalMs).toBe(
      estimateSegmentation(null, { refine: true }).totalMs,
    );
  });
});

describe("refineEstimateFrom", () => {
  it("sizes the second pass from what the first one actually took", () => {
    // The measured pair: a 56.2s first pass and a 95.6s second.
    expect(refineEstimateFrom(56_200) / 1000).toBeCloseTo(95.5, 0);
  });

  it("agrees with the up-front estimate when the first pass runs to time", () => {
    const estimate = estimateSegmentation(MEASURED_PIXELS, { refine: true });
    expect(refineEstimateFrom(estimate.firstPassMs)).toBe(estimate.refineMs);
  });
});
