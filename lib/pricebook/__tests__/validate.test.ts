/**
 * The publish gate.
 *
 * A draft is free to be broken. Publishing is the moment it starts pricing
 * real estimates, so what this file asserts is the list of ways a
 * contractor can no longer shoot themselves in the foot.
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
import type { PricingConfig } from "../types";
import { canPublish, validatePricingConfig } from "../validate";

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

const errors = (config: PricingConfig) =>
  validatePricingConfig(config).filter((i) => i.severity === "error");
const codes = (config: PricingConfig) => errors(config).map((i) => i.code);

describe("the shipped seed book", () => {
  it("is publishable as it stands", () => {
    const issues = validatePricingConfig(seed());
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(canPublish(issues)).toBe(true);
  });
});

describe("the catalog is the guardrail", () => {
  it("refuses to publish a book missing an assembly the configurator offers", () => {
    const config = seed();
    config.priceBook.assemblies = config.priceBook.assemblies.filter(
      (a) => a.id !== "stone_bed_conversion",
    );
    // Recipes reference it too, so both alarms should fire — but the one
    // that matters is the customer-facing option that would now be
    // unpriceable.
    expect(codes(config)).toContain("catalog_orphaned_assembly");
    expect(canPublish(validatePricingConfig(config))).toBe(false);
  });

  it("refuses to publish a book missing a SKU the configurator names", () => {
    const config = seed();
    config.priceBook.costItems = config.priceBook.costItems.filter(
      (c) => c.id !== "stone_river_rock",
    );
    expect(codes(config)).toContain("catalog_orphaned_sku");
  });
});

describe("assemblies and components", () => {
  it("refuses a component pointing at a SKU that isn't stocked", () => {
    const config = seed();
    config.priceBook.assemblies[0].components[0].costItemId = "unobtainium";
    expect(codes(config)).toContain("component_unknown_sku");
  });

  it("refuses a component that sets both a quantity and a production rate, or neither", () => {
    const both = seed();
    both.priceBook.assemblies[0].components[0] = {
      costItemId: both.priceBook.costItems[0].id,
      qtyPerUnit: 1,
      productionRate: 2,
    };
    expect(codes(both)).toContain("component_rate_ambiguous");

    const neither = seed();
    neither.priceBook.assemblies[0].components[0] = {
      costItemId: neither.priceBook.costItems[0].id,
    };
    expect(codes(neither)).toContain("component_rate_ambiguous");
  });

  it("refuses a zero or negative production rate — it divides into the quantity", () => {
    const config = seed();
    const target = config.priceBook.assemblies.find((a) =>
      a.components.some((c) => c.productionRate !== undefined),
    )!;
    target.components.find((c) => c.productionRate !== undefined)!.productionRate = 0;
    expect(codes(config)).toContain("component_rate_invalid");
  });

  it("refuses an empty assembly, which would price at zero", () => {
    const config = seed();
    config.priceBook.assemblies[0].components = [];
    expect(codes(config)).toContain("assembly_empty");
  });

  it("refuses duplicate SKU ids", () => {
    const config = seed();
    config.priceBook.costItems.push({ ...config.priceBook.costItems[0] });
    expect(codes(config)).toContain("sku_duplicate");
  });
});

describe("margin", () => {
  it("refuses a floor above the target", () => {
    const config = seed();
    config.margin = { targetGmPct: 30, minGmPct: 45, contingencyPct: 5 };
    expect(codes(config)).toContain("margin_floor_above_target");
  });

  it("refuses a margin of 100% or more, which has no finite sell price", () => {
    const config = seed();
    config.margin = { targetGmPct: 100, minGmPct: 10, contingencyPct: 5 };
    expect(codes(config)).toContain("margin_target_invalid");
  });
});

describe("disclosure", () => {
  it("refuses a policy that would leak unit rates to a customer", () => {
    const config = seed();
    // @ts-expect-error — the type forbids it; the validator is the runtime guard.
    config.bandPolicy.showUnitRates = true;
    expect(codes(config)).toContain("disclosure_leaks_rates");
  });

  it("refuses a rounding increment of zero", () => {
    const config = seed();
    config.bandPolicy.roundTo = 0;
    expect(codes(config)).toContain("round_to_invalid");
  });

  it("refuses tier mode with fewer than two tiers", () => {
    const config = seed();
    config.bandPolicy = { ...config.bandPolicy, mode: "tiers", tierMultipliers: [] };
    expect(codes(config)).toContain("tiers_missing");
  });
});

describe("the opening band", () => {
  it("refuses a recipe line whose distribution is missing for a market context", () => {
    const config = seed();
    delete config.distributions.mulch_to_stone.hoa_commercial.bed_area_sf;
    expect(codes(config)).toContain("recipe_unknown_distribution");
  });

  it("refuses percentiles that are out of order", () => {
    const config = seed();
    config.distributions.mulch_to_stone.residential.bed_area_sf = {
      unit: "SF",
      p25: 900,
      p50: 300,
      p75: 550,
    };
    expect(codes(config)).toContain("distribution_unordered");
  });
});

describe("warnings do not block a publish", () => {
  it("flags a SKU nothing uses without refusing it — that is a contractor mid-thought", () => {
    const config = seed();
    config.priceBook.costItems.push({
      id: "new_thing_being_priced",
      name: "Something being costed out",
      kind: "material",
      unit: "EA",
      unitCost: 10,
    });
    const issues = validatePricingConfig(config);
    expect(issues.map((i) => i.code)).toContain("sku_unused");
    expect(canPublish(issues)).toBe(true);
  });

  it("sorts errors ahead of warnings", () => {
    const config = seed();
    config.priceBook.assemblies[0].components = [];
    config.priceBook.costItems.push({
      id: "unused_thing",
      name: "Unused",
      kind: "material",
      unit: "EA",
      unitCost: 1,
    });
    const issues = validatePricingConfig(config);
    const firstWarning = issues.findIndex((i) => i.severity === "warning");
    const lastError = issues.map((i) => i.severity).lastIndexOf("error");
    expect(lastError).toBeLessThan(firstWarning);
  });
});
