/**
 * The rule the prompt states and this module enforces: a ground-plane
 * region does not climb the wall behind it.
 *
 * Written against the shape of the failure a real photograph produced —
 * a foundation bed whose polygon reached a third of the way up the brick,
 * and a lawn whose top edge sat on the house.
 */
import { describe, expect, it } from "vitest";

import {
  clampPolygonToGround,
  groundYAt,
  holdRegionsToGround,
  usableGroundLine,
} from "../groundLine";
import type { NormalizedPoint, SegmentedRegion } from "../types";

const LINE: NormalizedPoint[] = [
  [0, 0.6],
  [0.5, 0.55],
  [1, 0.65],
];

function region(
  id: string,
  polygon: NormalizedPoint[],
  extra: Partial<SegmentedRegion> = {},
): SegmentedRegion {
  return {
    id,
    kind: "bed",
    label: id,
    polygon,
    confidence: 0.8,
    ...extra,
  };
}

describe("usableGroundLine", () => {
  it("takes a line that spans enough of the picture", () => {
    expect(usableGroundLine(LINE)).toHaveLength(3);
  });

  it("sorts left to right, because the model is not required to", () => {
    const line = usableGroundLine([
      [0.9, 0.7],
      [0.1, 0.5],
      [0.5, 0.6],
    ])!;
    expect(line.map(([x]) => x)).toEqual([0.1, 0.5, 0.9]);
  });

  it.each([
    ["nothing", undefined],
    ["a single point", [[0.5, 0.5]] as NormalizedPoint[]],
    // One wall's base is not where the ground is across a whole photo, and
    // stretching it sideways clamps against a line nobody drew.
    ["a line spanning a sliver of the width", [[0.4, 0.5], [0.5, 0.5]] as NormalizedPoint[]],
    ["points outside the frame", [[-3, 0.5], [4, 0.5]] as NormalizedPoint[]],
  ])("refuses %s", (_label, input) => {
    expect(usableGroundLine(input)).toBeNull();
  });
});

describe("groundYAt", () => {
  it("interpolates between the points either side", () => {
    expect(groundYAt(LINE, 0.25)).toBeCloseTo(0.575, 6);
    expect(groundYAt(LINE, 0.75)).toBeCloseTo(0.6, 6);
  });

  it("is flat beyond the ends rather than extrapolated", () => {
    // Continuing the last segment's slope off the edge of the photo is a
    // guess that grows with distance, and it guesses toward clamping harder.
    expect(groundYAt(LINE, -1)).toBeCloseTo(0.6, 6);
    expect(groundYAt(LINE, 2)).toBeCloseTo(0.65, 6);
  });

  it("lands on the points themselves", () => {
    for (const [x, y] of LINE) expect(groundYAt(LINE, x)).toBeCloseTo(y, 6);
  });
});

describe("clampPolygonToGround", () => {
  it("pulls a bed that climbed the wall back down to it", () => {
    // The real shape: bottom edge on the mulch, top edge up the brick.
    const clamped = clampPolygonToGround(
      [
        [0.1, 0.30],
        [0.9, 0.32],
        [0.9, 0.72],
        [0.1, 0.70],
      ],
      LINE,
    );
    for (const [x, y] of clamped) {
      expect(y, `x=${x}`).toBeGreaterThanOrEqual(groundYAt(LINE, x) - 1e-9);
    }
    // The bottom edge, which was already on the ground, is untouched.
    expect(clamped[2]).toEqual([0.9, 0.72]);
    expect(clamped[3]).toEqual([0.1, 0.70]);
  });

  it("leaves a region that already respects the ground alone", () => {
    const polygon: NormalizedPoint[] = [
      [0.1, 0.75],
      [0.9, 0.8],
      [0.9, 0.98],
      [0.1, 0.95],
    ];
    expect(clampPolygonToGround(polygon, LINE)).toEqual(polygon);
  });

  it("only ever moves a vertex down", () => {
    const polygon: NormalizedPoint[] = [
      [0.0, 0.1],
      [0.5, 0.9],
      [1.0, 0.2],
    ];
    const clamped = clampPolygonToGround(polygon, LINE);
    clamped.forEach(([, y], i) => expect(y).toBeGreaterThanOrEqual(polygon[i][1]));
  });
});

describe("holdRegionsToGround", () => {
  it("drops a region drawn entirely above the ground line", () => {
    // Nothing to recover: the model outlined a piece of wall.
    const held = holdRegionsToGround(
      [
        region("on-the-wall", [
          [0.2, 0.1],
          [0.8, 0.1],
          [0.8, 0.3],
          [0.2, 0.3],
        ]),
        region("on-the-ground", [
          [0.2, 0.7],
          [0.8, 0.7],
          [0.8, 0.95],
          [0.2, 0.95],
        ]),
      ],
      LINE,
    );
    expect(held.map((r) => r.id)).toEqual(["on-the-ground"]);
  });

  it("keeps everything else about a region it clamps", () => {
    const [held] = holdRegionsToGround(
      [
        region(
          "bed",
          [
            [0.1, 0.2],
            [0.9, 0.2],
            [0.9, 0.9],
            [0.1, 0.9],
          ],
          { existingMaterial: "hardwood mulch", estimatedAreaSf: 300 },
        ),
      ],
      LINE,
    );
    expect(held.existingMaterial).toBe("hardwood mulch");
    expect(held.estimatedAreaSf).toBe(300);
    expect(held.polygon[0][1]).toBeGreaterThan(0.2);
  });

  it("discards a ground line that would destroy most of the segmentation", () => {
    // A line at 0.9 in a photo whose ground starts at 0.6: believing it
    // leaves the customer with slivers. One region drawn up a wall is an
    // outlier worth correcting; all of them means the line is wrong.
    const low: NormalizedPoint[] = [
      [0, 0.92],
      [1, 0.92],
    ];
    const regions = [
      region("lawn", [
        [0.05, 0.6],
        [0.95, 0.6],
        [0.95, 0.88],
        [0.05, 0.88],
      ]),
      region("bed", [
        [0.1, 0.5],
        [0.9, 0.5],
        [0.9, 0.7],
        [0.1, 0.7],
      ]),
      region("walk", [
        [0.4, 0.65],
        [0.6, 0.65],
        [0.6, 0.85],
        [0.4, 0.85],
      ]),
    ];
    expect(holdRegionsToGround(regions, low)).toEqual(regions);
  });

  it("still corrects a single outlier among regions that are fine", () => {
    const regions = [
      region("on-the-wall", [
        [0.2, 0.1],
        [0.8, 0.1],
        [0.8, 0.3],
        [0.2, 0.3],
      ]),
      region("fine-a", [
        [0.05, 0.7],
        [0.5, 0.7],
        [0.5, 0.95],
        [0.05, 0.95],
      ]),
      region("fine-b", [
        [0.5, 0.7],
        [0.95, 0.7],
        [0.95, 0.95],
        [0.5, 0.95],
      ]),
    ];
    expect(holdRegionsToGround(regions, LINE).map((r) => r.id)).toEqual([
      "fine-a",
      "fine-b",
    ]);
  });

  it("touches nothing without a usable ground line", () => {
    // Which is what every segmentation stored before this existed gets.
    const regions = [
      region("as-modelled", [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.5, 0.9],
      ]),
    ];
    expect(holdRegionsToGround(regions, undefined)).toEqual(regions);
    expect(holdRegionsToGround(regions, [[0.4, 0.5], [0.45, 0.5]])).toEqual(regions);
  });
});
