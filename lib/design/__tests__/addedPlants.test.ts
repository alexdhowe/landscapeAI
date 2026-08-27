/**
 * Plants the customer put in that the photograph never had.
 *
 * The verb that makes the other three worth having: until a customer can
 * put a plant in an empty spot, the design is a rearrangement of whatever
 * the camera happened to see. What is asserted is that it prices as the
 * install it is, that the two guardrails every other plant decision keeps
 * hold here too — an option id a browser made up buys nothing, and a plant
 * in a bed the segmentation no longer finds is ignored rather than priced
 * — and that a plant is drawn at the size it will actually be.
 */
import { describe, expect, it } from "vitest";

import { plantMetaBySku, wiPriceBook } from "../../../seed/pricebook.seed";
import { plantOptionsFor } from "../../catalog/plants";
import type { Planting, SegmentedRegion } from "../../vision/types";
import {
  addedPlantEllipse,
  addedScopeLines,
  plantAspect,
  resolveAddedPlants,
} from "../addedPlants";
import { plantAssemblyCounts, plantScopeLines } from "../plants";
import type { AddedPlant } from "../types";

const CATALOG = plantOptionsFor(wiPriceBook, plantMetaBySku);
const BOXWOOD = CATALOG[0];
const OTHER = CATALOG[1];

const BED: SegmentedRegion = {
  id: "bed",
  kind: "bed",
  label: "Bed",
  polygon: [
    [0.1, 0.5],
    [0.9, 0.5],
    [0.9, 0.8],
    [0.1, 0.8],
  ],
  confidence: 0.9,
};

const LAWN: SegmentedRegion = { ...BED, id: "lawn", kind: "turf", label: "Lawn" };

const added = (id: string, regionId: string, optionId: string): AddedPlant => ({
  id,
  regionId,
  optionId,
  at: [0.5, 0.65],
});

describe("resolveAddedPlants", () => {
  it("resolves a plant to its region, its option and a job type", () => {
    const [plant] = resolveAddedPlants(
      [BED],
      [added("a1", "bed", BOXWOOD.id)],
      CATALOG,
    );
    expect(plant.region.id).toBe("bed");
    expect(plant.option.id).toBe(BOXWOOD.id);
    expect(plant.jobType).toBe("bed_renovation");
  });

  it("drops a plant whose bed this segmentation no longer has", () => {
    // Re-segmenting replaces the regions. A stale one must never put a
    // line item on the rep's quote for a bed nobody can point at.
    expect(resolveAddedPlants([BED], [added("a1", "gone", BOXWOOD.id)], CATALOG))
      .toEqual([]);
  });

  it("drops a plant this price book cannot install", () => {
    // The catalog is the guardrail: the engine throws on an assembly the
    // book does not hold, so an id a browser made up must buy nothing.
    expect(resolveAddedPlants([BED], [added("a1", "bed", "made_up")], CATALOG))
      .toEqual([]);
  });

  it("ignores a plant standing in a region with no planting job type", () => {
    expect(resolveAddedPlants([LAWN], [added("a1", "lawn", BOXWOOD.id)], CATALOG))
      .toEqual([]);
  });

  it("has nothing to resolve for a design nobody has planted into", () => {
    expect(resolveAddedPlants([BED], undefined, CATALOG)).toEqual([]);
    expect(resolveAddedPlants([BED], [], CATALOG)).toEqual([]);
  });
});

describe("what an added plant is worth", () => {
  it("is one install assembly each, counted", () => {
    const plants = resolveAddedPlants(
      [BED],
      [
        added("a1", "bed", BOXWOOD.id),
        added("a2", "bed", BOXWOOD.id),
        added("a3", "bed", OTHER.id),
      ],
      CATALOG,
    );
    const counts = plantAssemblyCounts(plants);
    expect(counts.get(BOXWOOD.assemblyId)).toBe(2);
    expect(counts.get(OTHER.assemblyId)).toBe(1);
  });

  it("names the plants the way a customer recognises their design", () => {
    const plants = resolveAddedPlants(
      [BED],
      [added("a1", "bed", BOXWOOD.id), added("a2", "bed", BOXWOOD.id)],
      CATALOG,
    );
    expect(plantScopeLines(plants)).toEqual([`2 × ${BOXWOOD.label}`]);
  });

  it("counts them under the band in the customer's words", () => {
    const one = resolveAddedPlants([BED], [added("a1", "bed", BOXWOOD.id)], CATALOG);
    expect(addedScopeLines(one)).toEqual(["1 plant added"]);
    const two = resolveAddedPlants(
      [BED],
      [added("a1", "bed", BOXWOOD.id), added("a2", "bed", OTHER.id)],
      CATALOG,
    );
    expect(addedScopeLines(two)).toEqual(["2 plants added"]);
  });

  it("says nothing when nothing was added", () => {
    expect(addedScopeLines([])).toEqual([]);
  });
});

describe("addedPlantEllipse", () => {
  const base = {
    perFoot: 40,
    frameWidth: 1600,
    frameHeight: 1200,
    depth: 1,
    aspect: 0.72,
  };

  it("draws a plant at the width it grows to", () => {
    // A five-foot spread at 40 px/ft is 200px across, so 100px of radius
    // on a 1600px frame.
    const { rx } = addedPlantEllipse({ ...base, spreadFt: 5 });
    expect(rx * 1600).toBeCloseTo(100, 5);
  });

  it("draws a bigger plant bigger", () => {
    const small = addedPlantEllipse({ ...base, spreadFt: 2 });
    const large = addedPlantEllipse({ ...base, spreadFt: 6 });
    expect(large.rx / small.rx).toBeCloseTo(3, 5);
  });

  it("draws the same plant bigger at the front of a bed", () => {
    // The whole reason to drop a plant on a photograph: "will it fit"
    // depends on where in the bed it goes.
    const back = addedPlantEllipse({ ...base, spreadFt: 4, depth: 0.7 });
    const front = addedPlantEllipse({ ...base, spreadFt: 4, depth: 1.4 });
    expect(front.rx / back.rx).toBeCloseTo(2, 5);
  });

  it("keeps the drawn shape square in pixels, not in fractions", () => {
    // Normalized units are anisotropic. A plant that ignored that comes
    // out stretched on any photo that is not square.
    const { rx, ry } = addedPlantEllipse({ ...base, spreadFt: 4, aspect: 1 });
    expect(rx * 1600).toBeCloseTo(ry * 1200, 5);
  });

  it("refuses to draw a plug, or something the size of the yard", () => {
    expect(addedPlantEllipse({ ...base, spreadFt: 0 }).rx).toBeGreaterThan(0);
    expect(addedPlantEllipse({ ...base, spreadFt: 400 }).rx).toBeLessThanOrEqual(0.28);
  });
});

describe("plantAspect", () => {
  const squat = (n: number): Planting[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      cx: 0.2 + i * 0.1,
      cy: 0.6,
      rx: 0.05,
      ry: 0.025,
    }));

  it("measures how squat this photograph draws a plant", () => {
    expect(plantAspect(squat(5))).toBeCloseTo(0.5, 5);
  });

  it("falls back where two ellipses agreeing is not a measurement", () => {
    expect(plantAspect(squat(2))).toBeCloseTo(0.72, 5);
    expect(plantAspect([])).toBeCloseTo(0.72, 5);
    expect(plantAspect(undefined)).toBeCloseTo(0.72, 5);
  });

  it("refuses a nonsense ratio rather than believing it", () => {
    const silly = squat(4).map((p) => ({ ...p, ry: p.rx * 9 }));
    expect(plantAspect(silly)).toBeLessThanOrEqual(1.6);
  });
});
