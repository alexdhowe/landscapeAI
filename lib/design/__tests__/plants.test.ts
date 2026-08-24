/**
 * What a plant choice is worth, and when it is worth nothing.
 *
 * The two rules that keep a per-plant swap from putting nonsense on a
 * rep's quote: a choice only counts while the plant is still in the
 * design, and only for an option this contractor's book can install.
 */
import { describe, expect, it } from "vitest";

import { plantMetaBySku, wiPriceBook } from "../../../seed/pricebook.seed";
import { plantOptionsFor } from "../../catalog/plants";
import type { SegmentedRegion } from "../../vision/types";
import {
  plantAssemblyCounts,
  plantScopeLines,
  resolvePlantChoices,
} from "../plants";

const CATALOG = plantOptionsFor(wiPriceBook, plantMetaBySku);
const BOXWOOD = "plantsku_plant_boxwood_green_velvet";
const HOSTA = "plantsku_plant_hosta_patriot";

function region(
  id: string,
  kind: SegmentedRegion["kind"],
  plantIds: string[],
): SegmentedRegion {
  return {
    id,
    kind,
    label: id,
    polygon: [
      [0.1, 0.6],
      [0.9, 0.6],
      [0.9, 0.9],
      [0.1, 0.9],
    ],
    plantings: plantIds.map((pid, i) => ({
      id: pid,
      cx: 0.2 + i * 0.2,
      cy: 0.75,
      rx: 0.05,
      ry: 0.05,
    })),
    confidence: 0.9,
  };
}

const FOUNDATION = region("foundation", "foundation_planting", ["f1", "f2", "f3"]);
const BED = region("bed", "bed", ["b1"]);

describe("resolvePlantChoices", () => {
  it("resolves a choice to its plant, its region and a job type", () => {
    const [choice] = resolvePlantChoices([FOUNDATION], { f2: BOXWOOD }, CATALOG);
    expect(choice.planting.id).toBe("f2");
    expect(choice.region.id).toBe("foundation");
    expect(choice.option.skuId).toBe("plant_boxwood_green_velvet");
    expect(choice.jobType).toBe("foundation_planting_refresh");
  });

  it("prices replanting a bed as bed renovation", () => {
    const [choice] = resolvePlantChoices([BED], { b1: HOSTA }, CATALOG);
    expect(choice.jobType).toBe("bed_renovation");
  });

  it("drops a choice for a plant this segmentation no longer has", () => {
    // Re-segmenting a photo produces new plants; a stored choice can
    // outlive the plant it named. Nothing puts a line item on the rep's
    // quote for a shrub nobody can point at.
    expect(
      resolvePlantChoices([FOUNDATION], { gone_plant_9: BOXWOOD }, CATALOG),
    ).toEqual([]);
  });

  it("drops a choice for an option this price book cannot install", () => {
    expect(
      resolvePlantChoices([FOUNDATION], { f1: "plantsku_plant_unicorn" }, CATALOG),
    ).toEqual([]);
    // Including one the browser could have sent from a stale catalog.
    const thinner = CATALOG.filter((o) => o.id !== BOXWOOD);
    expect(resolvePlantChoices([FOUNDATION], { f1: BOXWOOD }, thinner)).toEqual([]);
  });

  it("ignores plants standing in a region with no planting job type", () => {
    const lawn = region("lawn", "turf", ["t1"]);
    expect(resolvePlantChoices([lawn], { t1: BOXWOOD }, CATALOG)).toEqual([]);
  });

  it("is empty for a design nobody has replanted", () => {
    expect(resolvePlantChoices([FOUNDATION], undefined, CATALOG)).toEqual([]);
    expect(resolvePlantChoices([FOUNDATION], {}, CATALOG)).toEqual([]);
  });

  it("returns choices in region order, then in the order the plants were found", () => {
    const choices = resolvePlantChoices(
      [FOUNDATION, BED],
      { b1: HOSTA, f3: BOXWOOD, f1: BOXWOOD },
      CATALOG,
    );
    expect(choices.map((c) => c.planting.id)).toEqual(["f1", "f3", "b1"]);
  });
});

describe("plantScopeLines", () => {
  it("counts repeats rather than repeating a line", () => {
    // "3 × Boxwood" is a design; three identical lines is a bug.
    const choices = resolvePlantChoices(
      [FOUNDATION],
      { f1: BOXWOOD, f2: BOXWOOD, f3: BOXWOOD },
      CATALOG,
    );
    expect(plantScopeLines(choices)).toEqual(["3 × Boxwood 'Green Velvet'"]);
  });

  it("names a single plant without a count", () => {
    const choices = resolvePlantChoices([FOUNDATION], { f1: BOXWOOD }, CATALOG);
    expect(plantScopeLines(choices)).toEqual(["Boxwood 'Green Velvet'"]);
  });
});

describe("plantAssemblyCounts", () => {
  it("is one install assembly per plant, counted", () => {
    const choices = resolvePlantChoices(
      [FOUNDATION, BED],
      { f1: BOXWOOD, f2: BOXWOOD, b1: HOSTA },
      CATALOG,
    );
    expect([...plantAssemblyCounts(choices)]).toEqual([
      ["install_plant_boxwood_green_velvet", 2],
      ["install_plant_hosta_patriot", 1],
    ]);
  });
});
