/**
 * The ruler a photograph carries.
 *
 * A swapped material used to be drawn at a fixed fraction of the frame,
 * which drew a 1.5in river rock about twelve times life size on the
 * first real bed anybody checked. What is asserted here is that the two rulers
 * already in the data — the region's reported area, and failing that the
 * plants standing in it — produce a scale, that a nonsense ruler is
 * refused rather than believed, and that the compression that keeps two
 * materials distinguishable never inverts them.
 */
import { describe, expect, it } from "vitest";

import type { NormalizedPoint } from "../../vision/types";
import {
  assumedPixelsPerFoot,
  pixelsPerFoot,
  polygonAreaPx,
  renderedGaugePx,
} from "../scale";

/** The demo bed: about 5.8% of the frame, reported at 300 sf. */
const BED: NormalizedPoint[] = [
  [0.05, 0.58],
  [0.45, 0.55],
  [0.47, 0.7],
  [0.04, 0.73],
];

describe("polygonAreaPx", () => {
  it("measures a rectangle", () => {
    const square: NormalizedPoint[] = [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.25, 0.75],
    ];
    expect(polygonAreaPx(square, 800, 600)).toBeCloseTo(400 * 300, 5);
  });

  it("does not care which way round the vertices go", () => {
    expect(polygonAreaPx([...BED].reverse(), 1600, 1200)).toBeCloseTo(
      polygonAreaPx(BED, 1600, 1200),
      5,
    );
  });

  it("is zero for something that is not a polygon", () => {
    expect(polygonAreaPx([[0.1, 0.1]], 1600, 1200)).toBe(0);
  });
});

describe("pixelsPerFoot", () => {
  it("reads the scale off the region's own reported area", () => {
    const scale = pixelsPerFoot({ polygon: BED, estimatedAreaSf: 300 });
    // √(px² ÷ sf) for this bed at the reference frame, 1600x1200.
    expect(scale).toBeCloseTo(20, 0);
  });

  it("says a bigger bed in the same pixels is further away", () => {
    const near = pixelsPerFoot({ polygon: BED, estimatedAreaSf: 120 })!;
    const far = pixelsPerFoot({ polygon: BED, estimatedAreaSf: 900 })!;
    expect(near).toBeGreaterThan(far);
  });

  it("falls back to the plants when the model estimated no area", () => {
    // Three shrubs of about 3ft across: the ruler of last resort.
    const scale = pixelsPerFoot({
      polygon: BED,
      plantings: [
        { id: "a", cx: 0.11, cy: 0.645, rx: 0.02, ry: 0.026 },
        { id: "b", cx: 0.23, cy: 0.635, rx: 0.02, ry: 0.026 },
      ],
    });
    expect(scale).not.toBeNull();
    expect(scale!).toBeGreaterThan(10);
    expect(scale!).toBeLessThan(40);
  });

  it("refuses a ruler that produces nonsense rather than believing it", () => {
    // A model that guessed 40,000 sf for one bed, or 0.5.
    expect(pixelsPerFoot({ polygon: BED, estimatedAreaSf: 400_000 })).toBeNull();
    expect(pixelsPerFoot({ polygon: BED, estimatedAreaSf: 0.2 })).toBeNull();
  });

  it("has nothing to say about a region with neither ruler", () => {
    expect(pixelsPerFoot({ polygon: BED })).toBeNull();
  });

  it("prefers the area to the plants where it has both", () => {
    const both = pixelsPerFoot({
      polygon: BED,
      estimatedAreaSf: 300,
      plantings: [{ id: "a", cx: 0.11, cy: 0.645, rx: 0.001, ry: 0.001 }],
    });
    expect(both).toBeCloseTo(20, 0);
  });
});

describe("renderedGaugePx", () => {
  const perFoot = 20;
  const gauge = (inches: number) => renderedGaugePx(inches, perFoot, 1600);

  it("draws a bigger stone bigger, always", () => {
    expect(gauge(1.5)).toBeGreaterThan(gauge(0.75));
    expect(gauge(0.75)).toBeGreaterThan(gauge(0.375));
  });

  it("keeps the finest material visible rather than physically correct", () => {
    // A 3/8in chip at this distance is half a pixel. Drawn at half a
    // pixel it is a grey wash, and the customer is choosing between it
    // and river rock — so the fine end is lifted.
    const physical = (perFoot * 0.375) / 12;
    expect(physical).toBeLessThan(1);
    expect(gauge(0.375)).toBeGreaterThan(2);
  });

  it("never goes back to the boulders", () => {
    // The bug: 29px per stone on a 1600px frame. Nothing may reach it,
    // at any distance or any gauge.
    for (const perFoot of [4, 17.5, 60, 160]) {
      for (const inches of [0.375, 0.75, 1.5, 6]) {
        expect(renderedGaugePx(inches, perFoot, 1600)).toBeLessThan(19);
      }
    }
  });

  it("scales with the frame it is drawn into", () => {
    expect(renderedGaugePx(1.5, perFoot, 800)).toBeCloseTo(gauge(1.5) / 2, 5);
  });
});

describe("assumedPixelsPerFoot", () => {
  it("is a front yard's worth of frame, not a fraction of it", () => {
    // Forty feet across a 1600px photo. Wrong by a factor of two at
    // worst, where the fixed frame fraction it replaces was wrong by
    // thirteen.
    expect(assumedPixelsPerFoot()).toBeCloseTo(40, 5);
  });
});
