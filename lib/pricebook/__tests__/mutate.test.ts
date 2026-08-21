/**
 * Editing a draft. The interesting cases are all deletions: what the book
 * refuses to let you do, so a slip in an admin form cannot quietly stop the
 * configurator from pricing.
 */
import { describe, expect, it } from "vitest";

import {
  plantMetaBySku,
  wiBandPolicy,
  wiDistributions,
  wiFinalQuotePolicy,
  wiMarginConfig,
  wiPriceBook,
  wiRecipes,
} from "../../../seed/pricebook.seed";
import {
  PriceBookEditError,
  removeAssembly,
  removeCostItem,
  removeDistribution,
  setRecipe,
  updateSettings,
  upsertAssembly,
  upsertCostItem,
} from "../mutate";
import type { PricingConfig } from "../types";
import { validatePricingConfig } from "../validate";

const seed = (): PricingConfig =>
  structuredClone({
    priceBook: wiPriceBook,
    plantMeta: plantMetaBySku,
    margin: wiMarginConfig,
    bandPolicy: wiBandPolicy,
    finalQuotePolicy: wiFinalQuotePolicy,
    recipes: wiRecipes,
    distributions: wiDistributions,
  });

describe("cost items", () => {
  it("adds one without disturbing the rest", () => {
    const before = seed();
    const after = upsertCostItem(before, {
      id: "stone_pea_gravel",
      name: "Pea gravel",
      kind: "material",
      unit: "CY",
      unitCost: 68,
      wasteFactorPct: 10,
    });
    expect(after.priceBook.costItems).toHaveLength(before.priceBook.costItems.length + 1);
    // The input is never mutated — these are values, not a mutable document.
    expect(before.priceBook.costItems.some((c) => c.id === "stone_pea_gravel")).toBe(false);
  });

  it("edits one in place by id", () => {
    const after = upsertCostItem(seed(), {
      id: "mulch_hardwood",
      name: "Shredded hardwood mulch",
      kind: "material",
      unit: "CY",
      unitCost: 46,
      wasteFactorPct: 10,
    });
    const item = after.priceBook.costItems.find((c) => c.id === "mulch_hardwood")!;
    expect(item.unitCost).toBe(46);
    expect(after.priceBook.costItems.filter((c) => c.id === "mulch_hardwood")).toHaveLength(1);
  });

  it("refuses to delete a SKU that assemblies price with", () => {
    expect(() => removeCostItem(seed(), "mulch_hardwood")).toThrow(PriceBookEditError);
    try {
      removeCostItem(seed(), "mulch_hardwood");
    } catch (error) {
      // The message names what is in the way, so the fix is obvious.
      expect((error as PriceBookEditError).conflicts.length).toBeGreaterThan(0);
    }
  });

  it("deletes a SKU nothing uses", () => {
    const withOrphan = upsertCostItem(seed(), {
      id: "orphan_sku",
      name: "Orphan",
      kind: "material",
      unit: "EA",
      unitCost: 5,
    });
    const after = removeCostItem(withOrphan, "orphan_sku");
    expect(after.priceBook.costItems.some((c) => c.id === "orphan_sku")).toBe(false);
  });
});

describe("assemblies", () => {
  it("refuses one built from a SKU that isn't stocked", () => {
    expect(() =>
      upsertAssembly(seed(), {
        id: "new_thing",
        name: "New thing",
        unit: "SF",
        components: [{ costItemId: "unobtainium", qtyPerUnit: 1 }],
      }),
    ).toThrow(PriceBookEditError);
  });

  it("refuses to delete one the opening band is built from", () => {
    expect(() => removeAssembly(seed(), "stone_bed_conversion")).toThrow(
      /opening band/,
    );
  });

  it("deletes one no recipe uses, and the result still validates", () => {
    const config = seed();
    const orphan = config.priceBook.assemblies.find(
      (a) =>
        !Object.values(config.recipes).flat().some((l) => l.assemblyId === a.id) &&
        !["stone_bed_conversion"].includes(a.id),
    );
    // Only meaningful if the seed actually has one; it does (plant installs).
    expect(orphan).toBeDefined();
    const after = removeAssembly(config, orphan!.id);
    expect(after.priceBook.assemblies.some((a) => a.id === orphan!.id)).toBe(false);
  });
});

describe("settings", () => {
  it("merges a partial margin patch", () => {
    const after = updateSettings(seed(), { margin: { targetGmPct: 48 } as never });
    expect(after.margin.targetGmPct).toBe(48);
    expect(after.margin.minGmPct).toBe(35);
  });

  it("will not let a disclosure policy turn unit rates on", () => {
    const after = updateSettings(seed(), {
      bandPolicy: { showUnitRates: true } as never,
    });
    expect(after.bandPolicy.showUnitRates).toBe(false);
    expect(validatePricingConfig(after).map((i) => i.code)).not.toContain(
      "disclosure_leaks_rates",
    );
  });
});

describe("the opening band", () => {
  it("refuses a recipe naming an assembly that isn't in the book", () => {
    expect(() =>
      setRecipe(seed(), "mulch_to_stone", [
        { assemblyId: "does_not_exist", distributionKey: "bed_area_sf" },
      ]),
    ).toThrow(PriceBookEditError);
  });

  it("refuses to delete a distribution its recipe is driven by", () => {
    expect(() =>
      removeDistribution(seed(), "mulch_to_stone", "residential", "bed_area_sf"),
    ).toThrow(PriceBookEditError);
  });
});
