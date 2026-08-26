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
  moveScopeLines,
  plantAssemblyCounts,
  plantMoveCount,
  plantRemovalCount,
  plantScopeLines,
  removalScopeLines,
  resolvePlantChoices,
  resolvePlantMoves,
  resolvePlantRemovals,
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

describe("resolvePlantRemovals", () => {
  it("resolves a cleared plant to its region and a job type", () => {
    const [removal] = resolvePlantRemovals([FOUNDATION], ["f2"], undefined);
    expect(removal.planting.id).toBe("f2");
    expect(removal.region.id).toBe("foundation");
    expect(removal.jobType).toBe("foundation_planting_refresh");
  });

  it("drops a removal for a plant this segmentation no longer has", () => {
    // Same rule as a swap, and for the same reason: a stale id must never
    // bill the crew for digging up a shrub nobody can point at.
    expect(resolvePlantRemovals([FOUNDATION], ["gone"], undefined)).toEqual([]);
  });

  it("does not bill a removal for a plant that was replaced instead", () => {
    // The store keeps these exclusive — one decision about one plant — but
    // a reader that trusted that and was wrong would bill the removal
    // twice over, once here and once inside the replacement.
    expect(resolvePlantRemovals([FOUNDATION], ["f2"], { f2: BOXWOOD })).toEqual([]);
  });

  it("has nothing to resolve when nothing was cleared", () => {
    expect(resolvePlantRemovals([FOUNDATION], undefined, undefined)).toEqual([]);
    expect(resolvePlantRemovals([FOUNDATION], [], undefined)).toEqual([]);
  });
});

describe("plantRemovalCount", () => {
  it("is one shrub_removal per plant taken out", () => {
    const removals = resolvePlantRemovals([FOUNDATION], ["f1", "f3"], undefined);
    expect([...plantRemovalCount(removals, true)]).toEqual([["shrub_removal", 2]]);
  });

  it("prices nothing where the book cannot price a removal", () => {
    // The engine throws on an assembly the book does not hold. A
    // contractor who deletes it stops being offered removals; a project
    // cleared before they did must not throw the whole estimate.
    const removals = resolvePlantRemovals([FOUNDATION], ["f1"], undefined);
    expect([...plantRemovalCount(removals, false)]).toEqual([]);
  });
});

describe("removalScopeLines", () => {
  it("counts them, in the customer's words rather than the assembly's", () => {
    const two = resolvePlantRemovals([FOUNDATION], ["f1", "f3"], undefined);
    expect(removalScopeLines(two)).toEqual(["2 existing plants taken out"]);
    const one = resolvePlantRemovals([FOUNDATION], ["f1"], undefined);
    expect(removalScopeLines(one)).toEqual(["1 existing plant taken out"]);
  });

  it("says nothing when nothing came out", () => {
    expect(removalScopeLines([])).toEqual([]);
  });
});

describe("resolvePlantMoves", () => {
  it("resolves a moved plant to its region and a job type", () => {
    const [move] = resolvePlantMoves([FOUNDATION], { f2: [0.5, 0.8] }, undefined);
    expect(move.planting.id).toBe("f2");
    expect(move.region.id).toBe("foundation");
    expect(move.to).toEqual([0.5, 0.8]);
    expect(move.jobType).toBe("foundation_planting_refresh");
  });

  it("is not a move when the plant came back to where it started", () => {
    // A tap that wobbled, or a "put it back". Neither is crew time.
    expect(resolvePlantMoves([FOUNDATION], { f2: [0.4, 0.75] }, undefined)).toEqual([]);
  });

  it("does not move a plant that was taken out", () => {
    // Cleared wins: a plant that is leaving the site has nowhere to be,
    // and billing a transplant for it would bill for lifting it twice.
    expect(resolvePlantMoves([FOUNDATION], { f2: [0.5, 0.8] }, ["f2"])).toEqual([]);
  });

  it("drops a move for a plant this segmentation no longer has", () => {
    expect(resolvePlantMoves([FOUNDATION], { gone: [0.5, 0.8] }, undefined)).toEqual([]);
  });

  it("has nothing to resolve when nothing was moved", () => {
    expect(resolvePlantMoves([FOUNDATION], undefined, undefined)).toEqual([]);
    expect(resolvePlantMoves([FOUNDATION], {}, undefined)).toEqual([]);
  });

  it("still moves a plant that is also being replaced", () => {
    // Two decisions about one plant: what goes there, and where it goes.
    // The crew lifts what is standing there whatever goes back in.
    const moves = resolvePlantMoves([FOUNDATION], { f2: [0.5, 0.8] }, undefined);
    expect(moves).toHaveLength(1);
  });
});

describe("plantMoveCount", () => {
  it("is one transplant per plant moved", () => {
    const moves = resolvePlantMoves(
      [FOUNDATION],
      { f1: [0.5, 0.8], f3: [0.3, 0.85] },
      undefined,
    );
    expect([...plantMoveCount(moves, true)]).toEqual([["shrub_transplant", 2]]);
  });

  it("prices nothing where the book cannot price a transplant", () => {
    // Same guard as a removal: the engine throws on an assembly the book
    // does not hold, and a contractor who deletes it must not break the
    // estimate of a project somebody already rearranged.
    const moves = resolvePlantMoves([FOUNDATION], { f1: [0.5, 0.8] }, undefined);
    expect([...plantMoveCount(moves, false)]).toEqual([]);
  });
});

describe("moveScopeLines", () => {
  it("counts them, in the customer's words rather than the assembly's", () => {
    const two = resolvePlantMoves(
      [FOUNDATION],
      { f1: [0.5, 0.8], f3: [0.3, 0.85] },
      undefined,
    );
    expect(moveScopeLines(two)).toEqual(["2 plants moved"]);
    const one = resolvePlantMoves([FOUNDATION], { f1: [0.5, 0.8] }, undefined);
    expect(moveScopeLines(one)).toEqual(["1 plant moved"]);
  });

  it("says nothing when nothing moved", () => {
    expect(moveScopeLines([])).toEqual([]);
  });
});
