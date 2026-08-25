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
  it("leaves a region wholly above the line alone rather than deleting it", () => {
    // This used to drop it, on the theory that the model had outlined a
    // piece of wall and there was nothing to recover. Two real photographs
    // of the same yard said otherwise: a bed held up by a retaining wall
    // sits above the point where that wall meets the ground, always, and
    // the clamp annihilated a 26-vertex bed covering 22.3% of the frame.
    // A stray region a customer can see and ignore beats their actual bed
    // vanishing.
    const raised = region("raised-bed", [
      [0.2, 0.1],
      [0.8, 0.1],
      [0.8, 0.3],
      [0.2, 0.3],
    ]);
    const held = holdRegionsToGround(
      [
        raised,
        region("on-the-ground", [
          [0.2, 0.7],
          [0.8, 0.7],
          [0.8, 0.95],
          [0.2, 0.95],
        ]),
      ],
      LINE,
    );
    expect(held.map((r) => r.id)).toEqual(["raised-bed", "on-the-ground"]);
    expect(held[0].polygon).toEqual(raised.polygon);
  });

  it("does not clamp a region it would gut", () => {
    // The real shape of the failure: the ground line traced the sweep of a
    // wall cap down to y=0.98 at mid-frame, and the bed behind it had
    // essentially no area below that. Clamping is a correction, not a
    // demolition, so it does not run here.
    const bed = region("raised-bed", [
      [0.25, 0.24],
      [0.9, 0.5],
      [0.9, 0.6],
      [0.25, 0.75],
    ]);
    const sweeping: NormalizedPoint[] = [
      [0, 0.26],
      [0.2, 0.55],
      [0.55, 1],
      [1, 0.84],
    ];
    const [held] = holdRegionsToGround([bed], sweeping);
    expect(held.polygon).toEqual(bed.polygon);
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

  it("still does the job it was built for", () => {
    // The failure this module exists for: a foundation bed whose TOP edge
    // strayed a third of the way up the brick while its bottom edge sat on
    // the mulch. It has real area below the line, so it keeps it and comes
    // back corrected — the guard above must not swallow this case.
    const climbing = region("bed-up-the-brick", [
      [0.1, 0.25],
      [0.9, 0.27],
      [0.9, 0.92],
      [0.1, 0.9],
    ]);
    const fine = region("fine", [
      [0.05, 0.7],
      [0.5, 0.7],
      [0.5, 0.95],
      [0.05, 0.95],
    ]);
    const held = holdRegionsToGround([climbing, fine], LINE);
    expect(held.map((r) => r.id)).toEqual(["bed-up-the-brick", "fine"]);
    for (const [x, y] of held[0].polygon) {
      expect(y, `x=${x}`).toBeGreaterThanOrEqual(groundYAt(LINE, x) - 1e-9);
    }
    // Untouched regions stay byte-identical.
    expect(held[1].polygon).toEqual(fine.polygon);
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
