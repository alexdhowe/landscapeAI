/**
 * Reading a bed's depth off the plants standing in it.
 *
 * There is no camera model here and there does not need to be: shrubs in
 * one bed are roughly one size in the world, so how fast their drawn size
 * falls off up the frame *is* the perspective. What is asserted is that
 * the fit recovers a horizon it should, that it refuses every case where
 * the plants cannot support one — because a wrong perspective is far
 * worse than none — and that whatever it hands back is bounded.
 */
import { describe, expect, it } from "vitest";

import type { Planting } from "../../vision/types";
import { depthBands, depthScale, fitGroundPlane } from "../perspective";

/** Plants of one real size on a ground plane with the horizon at 0.25. */
function onPlane(rows: number[], horizon = 0.25, k = 0.12): Planting[] {
  return rows.map((cy, i) => ({
    id: `p${i}`,
    cx: 0.2 + i * 0.1,
    cy,
    rx: k * (cy - horizon) * 1.3,
    ry: k * (cy - horizon),
  }));
}

describe("fitGroundPlane", () => {
  it("recovers the horizon the plants were drawn against", () => {
    const plane = fitGroundPlane(onPlane([0.45, 0.55, 0.62, 0.7]));
    expect(plane).not.toBeNull();
    expect(plane!.horizon).toBeCloseTo(0.25, 4);
  });

  it("recovers it from noisy plants too", () => {
    // Real shrubs are not all one size, and the model's ellipses are a
    // guess at each. The fit only has to land near enough to be useful.
    const plants = onPlane([0.44, 0.52, 0.58, 0.65, 0.72]);
    const jitter = [1.12, 0.9, 1.05, 0.93, 1.08];
    plants.forEach((p, i) => {
      p.ry *= jitter[i];
      p.rx *= jitter[i];
    });
    expect(fitGroundPlane(plants)!.horizon).toBeCloseTo(0.25, 1);
  });

  it("refuses a region with too few plants to fit a line through", () => {
    expect(fitGroundPlane(onPlane([0.5, 0.7]))).toBeNull();
    expect(fitGroundPlane([])).toBeNull();
    expect(fitGroundPlane(undefined)).toBeNull();
  });

  it("refuses a hedge along one wall", () => {
    // All at one depth: the slope through them is reading noise, and a
    // perspective fitted to noise is worse than no perspective.
    expect(fitGroundPlane(onPlane([0.50, 0.51, 0.515, 0.52]))).toBeNull();
  });

  it("refuses a bed whose big plants are at the back", () => {
    // Plants that grow as they recede are telling us about the planting,
    // not about the lens.
    const plants = onPlane([0.45, 0.55, 0.65, 0.75]).map((p, i) => ({
      ...p,
      ry: 0.02 + (3 - i) * 0.01,
    }));
    expect(fitGroundPlane(plants)).toBeNull();
  });

  it("refuses a fit whose horizon lands inside the planting", () => {
    // Scale goes to infinity at the horizon row, so one sitting among the
    // plants is a bad fit rather than a low camera.
    const plants = onPlane([0.45, 0.55, 0.65]).map((p) => ({ ...p, ry: p.ry * 4 }));
    const plane = fitGroundPlane(plants);
    if (plane) expect(plane.horizon).toBeLessThan(0.4);
  });
});

describe("depthScale", () => {
  const plane = { horizon: 0.25 };

  it("is 1 at the row it is measured against", () => {
    expect(depthScale(plane, 0.6, 0.6)).toBe(1);
  });

  it("grows toward the camera and shrinks away from it", () => {
    expect(depthScale(plane, 0.75, 0.6)).toBeGreaterThan(1);
    expect(depthScale(plane, 0.45, 0.6)).toBeLessThan(1);
  });

  it("is the ratio of distance below the horizon", () => {
    // (0.75 − 0.25) / (0.50 − 0.25) = 2, clamped to the ceiling.
    expect(depthScale(plane, 0.75, 0.5)).toBeCloseTo(1.9, 5);
  });

  it("never runs away, however wrong the fit was", () => {
    for (const y of [0.26, 0.5, 0.99]) {
      const scale = depthScale({ horizon: 0.255 }, y, 0.6);
      expect(scale).toBeGreaterThanOrEqual(0.55);
      expect(scale).toBeLessThanOrEqual(1.9);
    }
  });

  it("hands back 1 rather than a negative for a row above the horizon", () => {
    expect(depthScale(plane, 0.1, 0.6)).toBe(1);
  });
});

describe("depthBands", () => {
  it("is one flat band when the photograph said nothing about depth", () => {
    expect(depthBands(null, 0.4, 0.8)).toEqual([
      { top: 0.4, bottom: 0.8, scale: 1 },
    ]);
  });

  it("slices a region into bands that grow toward the camera", () => {
    const bands = depthBands({ horizon: 0.25 }, 0.4, 0.8);
    expect(bands).toHaveLength(3);
    expect(bands[0].scale).toBeLessThan(1);
    expect(bands[2].scale).toBeGreaterThan(1);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].scale).toBeGreaterThan(bands[i - 1].scale);
      // No gaps: a strip of unpainted bed between two bands would be a
      // hole in the material.
      expect(bands[i].top).toBeCloseTo(bands[i - 1].bottom, 10);
    }
  });

  it("covers the region exactly", () => {
    const bands = depthBands({ horizon: 0.25 }, 0.4, 0.8);
    expect(bands[0].top).toBeCloseTo(0.4, 10);
    expect(bands[bands.length - 1].bottom).toBeCloseTo(0.8, 10);
  });

  it("does not divide a region with no height", () => {
    expect(depthBands({ horizon: 0.25 }, 0.5, 0.5)).toHaveLength(1);
  });
});
