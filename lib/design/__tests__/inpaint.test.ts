/**
 * Where a hole gets its pixels.
 *
 * The sliding donor this replaced looked reasonable and ghosted on the
 * first two real beds it met, in two different ways, and both are the
 * reason the search here is what it is: a row of evenly spaced shrubs,
 * where sliding sideways lands on the next shrub, and a bed barely taller
 * than the plants in it, where sliding up and down leaves the bed for the
 * brick above and the lawn below. What is asserted is that a fill is
 * never taken off a plant, never taken from outside the region it is
 * filling, and that the slices of a plant that were never over the bed are
 * filled from what was actually behind them.
 */
import { describe, expect, it } from "vitest";

import type { NormalizedPoint, Planting } from "../../vision/types";
import { cleanGround, holesToFill, patchFor, planHoles } from "../inpaint";

/**
 * The demo foundation planting, which is the awkward case: a strip about
 * as tall as its shrubs, with the shrubs about their own width apart.
 */
const BED: NormalizedPoint[] = [
  [0.5, 0.52],
  [0.95, 0.5],
  [0.96, 0.64],
  [0.51, 0.66],
];

const ROW: Planting[] = [
  { id: "p1", cx: 0.57, cy: 0.585, rx: 0.04, ry: 0.045 },
  { id: "p2", cx: 0.67, cy: 0.58, rx: 0.042, ry: 0.048 },
  { id: "p3", cx: 0.78, cy: 0.575, rx: 0.045, ry: 0.05 },
  { id: "p4", cx: 0.89, cy: 0.57, rx: 0.04, ry: 0.045 },
];

/** A wide open bed with one small plant in the middle of it. */
const OPEN: NormalizedPoint[] = [
  [0.1, 0.4],
  [0.9, 0.4],
  [0.9, 0.9],
  [0.1, 0.9],
];
const LONE: Planting = { id: "lone", cx: 0.5, cy: 0.65, rx: 0.03, ry: 0.03 };

/** Is this point on a plant, by the module's own definition of "on"? */
function onPlant(plant: Planting, x: number, y: number): boolean {
  const dx = (x - plant.cx) / (plant.rx * 1.3);
  const dy = (y - plant.cy) / (plant.ry * 1.3);
  return dx * dx + dy * dy <= 1;
}

function insideBed(polygon: readonly NormalizedPoint[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

describe("cleanGround", () => {
  it("finds ground in a bed that has room", () => {
    expect(cleanGround(OPEN, [LONE]).length).toBeGreaterThan(0);
  });

  it("finds ground even in a bed that is mostly shrub", () => {
    // The case a sliding donor could not serve: no whole shrub's worth of
    // clean bed exists here, but pieces of one do.
    expect(cleanGround(BED, ROW).length).toBeGreaterThan(0);
  });

  it("never offers a patch that overlaps a plant", () => {
    for (const patch of cleanGround(BED, ROW)) {
      for (const plant of ROW) {
        // Every corner of the tile, not just its middle: half a tile of
        // shrub is still a shrub in the fill.
        for (const x of [patch.cx - patch.r, patch.cx + patch.r]) {
          for (const y of [patch.cy - patch.r, patch.cy + patch.r]) {
            expect(onPlant(plant, x, y)).toBe(false);
          }
        }
      }
    }
  });

  it("never offers a patch that leaves the region", () => {
    for (const patch of cleanGround(BED, ROW)) {
      for (const x of [patch.cx - patch.r, patch.cx + patch.r]) {
        for (const y of [patch.cy - patch.r, patch.cy + patch.r]) {
          expect(insideBed(BED, x, y)).toBe(true);
        }
      }
    }
  });

  it("has nothing to offer a region with no outline", () => {
    expect(cleanGround([[0.1, 0.1]], [])).toEqual([]);
  });

  it("has nothing to offer a bed buried under one huge plant", () => {
    const smothered: Planting = { id: "big", cx: 0.5, cy: 0.65, rx: 0.6, ry: 0.4 };
    expect(cleanGround(OPEN, [smothered])).toEqual([]);
  });
});

describe("patchFor", () => {
  it("prefers ground near the hole, all else equal", () => {
    const ground = [
      { cx: 0.2, cy: 0.65, r: 0.04 },
      { cx: 0.55, cy: 0.65, r: 0.04 },
    ];
    expect(patchFor(LONE, ground)?.cx).toBe(0.55);
  });

  it("will walk across a bed for a patch that is big enough to matter", () => {
    // A tile a third of the hole's size tiles nine times and reads as a
    // pattern; one the hole's own size tiles once and reads as material.
    const ground = [
      { cx: 0.55, cy: 0.65, r: 0.008 },
      { cx: 0.62, cy: 0.65, r: 0.04 },
    ];
    expect(patchFor(LONE, ground)?.cx).toBe(0.62);
  });

  it("stops paying for size once the tile covers the hole", () => {
    // Twice the hole tiles exactly as often as once the hole: nearer wins.
    const ground = [
      { cx: 0.55, cy: 0.65, r: 0.04 },
      { cx: 0.85, cy: 0.65, r: 0.2 },
    ];
    expect(patchFor(LONE, ground)?.cx).toBe(0.55);
  });

  it("returns nothing when there is no clean ground", () => {
    expect(patchFor(LONE, [])).toBeNull();
  });
});

describe("planHoles", () => {
  it("gives every hole somewhere to draw from", () => {
    const plans = planHoles(ROW, ROW, BED);
    expect(plans).toHaveLength(4);
    for (const plan of plans) expect(plan.patch).not.toBeNull();
  });

  it("does not tile one hole from a plant that is also coming out", () => {
    // Clearing the whole row must not fill one shrub's hole with another.
    for (const plan of planHoles(ROW, ROW, BED)) {
      const patch = plan.patch!;
      for (const plant of ROW) {
        expect(onPlant(plant, patch.cx, patch.cy)).toBe(false);
      }
    }
  });

  it("reaches above the bed for the part of a plant that stood above it", () => {
    // A shrub taller than the strip it stands in: the top of it was never
    // over mulch, it was over whatever is behind the bed.
    const shallow: NormalizedPoint[] = [
      [0.4, 0.6],
      [0.9, 0.6],
      [0.9, 0.7],
      [0.4, 0.7],
    ];
    const tall: Planting = { id: "tall", cx: 0.65, cy: 0.64, rx: 0.05, ry: 0.08 };
    const [plan] = planHoles([tall], [tall], shallow);
    expect(plan.above).not.toBeNull();
    // Far enough that the donor clears the hole: otherwise the shrub
    // comes back with the pixels meant to bury it.
    const holeTop = tall.cy - tall.ry * 1.12;
    expect(plan.above!).toBeGreaterThan(shallow[0][1] - holeTop);
  });

  it("reaches below the bed for the part of a plant that overhangs it", () => {
    const shallow: NormalizedPoint[] = [
      [0.4, 0.6],
      [0.9, 0.6],
      [0.9, 0.7],
      [0.4, 0.7],
    ];
    const tall: Planting = { id: "tall", cx: 0.65, cy: 0.64, rx: 0.05, ry: 0.08 };
    const [plan] = planHoles([tall], [tall], shallow);
    expect(plan.below).not.toBeNull();
    const holeBottom = tall.cy + tall.ry * 1.12;
    expect(plan.below!).toBeGreaterThan(holeBottom - shallow[2][1]);
  });

  it("asks for neither when the plant sat wholly inside its bed", () => {
    const [plan] = planHoles([LONE], [LONE], OPEN);
    expect(plan.above).toBeNull();
    expect(plan.below).toBeNull();
  });

  it("refuses to reach off the top of the photograph", () => {
    // A plant against the sky: there are no pixels above the frame, and
    // an image drawn past it would leave the shrub showing.
    const sky: NormalizedPoint[] = [
      [0.3, 0.02],
      [0.7, 0.02],
      [0.7, 0.3],
      [0.3, 0.3],
    ];
    const tall: Planting = { id: "tall", cx: 0.5, cy: 0.02, rx: 0.05, ry: 0.05 };
    const [plan] = planHoles([tall], [tall], sky);
    expect(plan.above).toBeNull();
  });

  it("plans nothing when nothing is coming out", () => {
    expect(planHoles([], ROW, BED)).toEqual([]);
  });
});

describe("the hole's own size", () => {
  it("cuts wider than the plant, so an under-sized ellipse still clears", () => {
    // A model that draws the ellipse smaller than the shrub is an
    // ordinary failure, and a hole cut to the ellipse leaves a rim of
    // shrub around the fill. Over-cutting refills bed with bed.
    const [plan] = planHoles([LONE], [LONE], OPEN);
    expect(plan.margin).toBeGreaterThan(1.12);
  });

  it("stops short of a plant that is staying", () => {
    // The one thing a generous hole must not do is erase a shrub the
    // customer is keeping.
    const keeper: Planting = { id: "keep", cx: 0.567, cy: 0.65, rx: 0.03, ry: 0.03 };
    const [plan] = planHoles([LONE], [LONE, keeper], OPEN);
    expect(plan.margin).toBeLessThan(1.3);
    // And whatever it settled on really does clear the keeper.
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const x = LONE.cx + Math.cos(angle) * LONE.rx * plan.margin;
      const y = LONE.cy + Math.sin(angle) * LONE.ry * plan.margin;
      const dx = (x - keeper.cx) / keeper.rx;
      const dy = (y - keeper.cy) / keeper.ry;
      expect(dx * dx + dy * dy).toBeGreaterThan(1);
    }
  });

  it("does not shrink for a neighbour that is coming out too", () => {
    const neighbour: Planting = { id: "n", cx: 0.567, cy: 0.65, rx: 0.03, ry: 0.03 };
    const plans = planHoles([LONE, neighbour], [LONE, neighbour], OPEN);
    expect(plans[0].margin).toBeGreaterThan(1.12);
  });
});

describe("holesToFill", () => {
  const none = new Set<string>();

  it("fills for a plant taken out", () => {
    const holes = holesToFill(ROW, { cleared: new Set(["p2"]), moved: none });
    expect(holes.map((p) => p.id)).toEqual(["p2"]);
  });

  it("fills for a plant that moved, because its old spot is empty now", () => {
    const holes = holesToFill(ROW, { cleared: none, moved: new Set(["p3"]) });
    expect(holes.map((p) => p.id)).toEqual(["p3"]);
  });

  it("leaves a plant that was only replaced alone", () => {
    // Something is drawn over it, in the same place, at the same size.
    expect(holesToFill(ROW, { cleared: none, moved: none })).toEqual([]);
  });
});
