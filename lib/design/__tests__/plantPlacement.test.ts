/**
 * Where a plant ends up once the customer has dragged it.
 *
 * Two facts have to stay apart: where the segmentation saw the plant, and
 * where the design puts it. What is asserted here is that the second wins
 * when it exists, that a drag which went nowhere is not a move — a
 * transplant is billed off that answer — and that a drop outside the bed
 * lands back inside it, because a plant on the driveway is a mistake
 * nobody notices until a crew is standing in the yard.
 */
import { describe, expect, it } from "vitest";

import type { NormalizedPoint, Planting } from "../../vision/types";
import {
  confineToRegion,
  isDragTravel,
  isInsidePolygon,
  isPlantMoved,
  plantPosition,
  regionAtPoint,
} from "../plantPlacement";

const SHRUB: Planting = { id: "p1", cx: 0.3, cy: 0.6, rx: 0.04, ry: 0.04 };

const BED: NormalizedPoint[] = [
  [0.1, 0.5],
  [0.5, 0.5],
  [0.5, 0.7],
  [0.1, 0.7],
];

describe("plantPosition", () => {
  it("uses where the photo saw it, with nothing else to go on", () => {
    expect(plantPosition(SHRUB, undefined)).toEqual([0.3, 0.6]);
    expect(plantPosition(SHRUB, {})).toEqual([0.3, 0.6]);
  });

  it("uses where the customer put it, once they have", () => {
    expect(plantPosition(SHRUB, { p1: [0.4, 0.65] })).toEqual([0.4, 0.65]);
  });

  it("is not confused by another plant's move", () => {
    expect(plantPosition(SHRUB, { p2: [0.4, 0.65] })).toEqual([0.3, 0.6]);
  });
});

describe("isPlantMoved", () => {
  it("is false for a plant nobody has touched", () => {
    expect(isPlantMoved(SHRUB, undefined)).toBe(false);
  });

  it("is false for a drag that ended where it started", () => {
    // A tap that wobbled. Under a pixel on a 1600px photo, and billing a
    // transplant for it would put a line on the estimate for nothing.
    expect(isPlantMoved(SHRUB, { p1: [0.3, 0.6] })).toBe(false);
    expect(isPlantMoved(SHRUB, { p1: [0.3004, 0.6002] })).toBe(false);
  });

  it("is true once the plant has actually gone somewhere", () => {
    expect(isPlantMoved(SHRUB, { p1: [0.32, 0.6] })).toBe(true);
  });
});

describe("isInsidePolygon", () => {
  it("knows the middle from the outside", () => {
    expect(isInsidePolygon(BED, [0.3, 0.6])).toBe(true);
    expect(isInsidePolygon(BED, [0.3, 0.9])).toBe(false);
    expect(isInsidePolygon(BED, [0.7, 0.6])).toBe(false);
  });
});

describe("confineToRegion", () => {
  it("leaves a drop that landed in the bed alone", () => {
    expect(confineToRegion(BED, [0.3, 0.6])).toEqual([0.3, 0.6]);
  });

  it("pulls a drop just outside back in, rather than refusing it", () => {
    // A fingertip on a phone overshoots. Refusing would read as the drag
    // not working, so it lands on the nearest ground instead.
    const landed = confineToRegion(BED, [0.3, 0.78]);
    expect(isInsidePolygon(BED, landed)).toBe(true);
    expect(landed[0]).toBeCloseTo(0.3, 1);
  });

  it("pulls a drop a long way outside back in too", () => {
    const landed = confineToRegion(BED, [0.95, 0.05]);
    expect(isInsidePolygon(BED, landed)).toBe(true);
  });

  it("lands inside the line rather than on it", () => {
    // A plant centred on the boundary reads as half out of the bed, and
    // the next test of an exact edge point is a coin toss.
    const landed = confineToRegion(BED, [0.3, 1]);
    expect(landed[1]).toBeLessThan(0.7);
  });

  it("hands back a degenerate outline untouched", () => {
    // A region with two vertices cannot contain anything. That is a bug
    // upstream, and refusing to move a plant is not how to report it.
    expect(confineToRegion([[0.1, 0.1], [0.2, 0.2]], [0.9, 0.9])).toEqual([0.9, 0.9]);
  });
});

describe("regionAtPoint", () => {
  const bed = { id: "bed", polygon: BED, plantable: true };
  const walk = {
    id: "walk",
    polygon: [
      [0.6, 0.5],
      [0.9, 0.5],
      [0.9, 0.7],
      [0.6, 0.7],
    ] as NormalizedPoint[],
    plantable: false,
  };
  const plantable = (r: { plantable: boolean }) => r.plantable;

  it("finds the bed a plant was dropped into", () => {
    expect(regionAtPoint([bed, walk], [0.3, 0.6], plantable)?.id).toBe("bed");
  });

  it("will not drop a plant on the walkway", () => {
    // What counts as plantable is the catalog's business, not geometry's,
    // so it comes in from the caller — but a walkway is never it.
    expect(regionAtPoint([walk], [0.7, 0.6], plantable)).toBeNull();
  });

  it("catches a drop that landed just outside a bed", () => {
    // Same reason confineToRegion nudges rather than refuses: a fingertip
    // on a phone misses by a few pixels and refusing reads as broken.
    expect(regionAtPoint([bed], [0.3, 0.72], plantable)?.id).toBe("bed");
  });

  it("finds nothing for a drop nowhere near a bed", () => {
    expect(regionAtPoint([bed], [0.3, 0.99], plantable)).toBeNull();
  });

  it("finds nothing when the photo has no plantable region at all", () => {
    expect(regionAtPoint([walk], [0.7, 0.6], plantable)).toBeNull();
    expect(regionAtPoint([], [0.3, 0.6], plantable)).toBeNull();
  });
});

describe("isDragTravel", () => {
  // The frame is the photograph as rendered, and it is not a fixed size:
  // about 1600px wide on a phone in portrait, and about 435px on a
  // 1440x900 laptop once the desktop height cap applies.
  const phone = { width: 1600, height: 2133 };
  const laptop = { width: 435, height: 580 };

  it("calls a press that did not move a tap", () => {
    expect(isDragTravel([0.5, 0.5], [0.5, 0.5], phone)).toBe(false);
  });

  it("on a large frame, uses the fraction: ~7px on a 1600px photo", () => {
    // 6px across: under. 9px: over.
    expect(isDragTravel([0.5, 0.5], [0.5 + 6 / 1600, 0.5], phone)).toBe(false);
    expect(isDragTravel([0.5, 0.5], [0.5 + 9 / 1600, 0.5], phone)).toBe(true);
  });

  it("on a small frame, the pixel floor is what decides", () => {
    // 0.0045 of a 435px frame is under 2px, which is inside the movement
    // of an ordinary click — this is the bug the floor exists for. A
    // 3px press must still be a tap.
    expect(isDragTravel([0.5, 0.5], [0.5 + 3 / 435, 0.5], laptop)).toBe(false);
    expect(isDragTravel([0.5, 0.5], [0.5 + 7 / 435, 0.5], laptop)).toBe(true);
  });

  it("measures real distance, so a diagonal press counts both axes", () => {
    // 4px right and 4px down is 5.7px travelled: over the floor, where
    // neither axis alone would be.
    expect(isDragTravel([0.5, 0.5], [0.5 + 4 / 435, 0.5 + 4 / 580], laptop)).toBe(true);
  });

  it("is symmetric — direction does not decide", () => {
    const a: [number, number] = [0.5, 0.5];
    const b: [number, number] = [0.5 + 20 / 435, 0.5];
    expect(isDragTravel(a, b, laptop)).toBe(isDragTravel(b, a, laptop));
  });

  it("refuses to decide on a frame with no size", () => {
    // Before the photo has laid out there is no scale to judge against,
    // and guessing would move a plant the customer only pressed.
    expect(isDragTravel([0, 0], [1, 1], { width: 0, height: 0 })).toBe(false);
  });
});
