/**
 * The edit history.
 *
 * Revisions are immutable, so the diff between two of them IS what
 * happened — there is no audit log that can drift from the rows. What these
 * tests hold it to is that the diff says the sentence a contractor wants:
 * "mulch went from $38 to $46", not "cost_items changed".
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
import { describeChange, diffPricingConfig } from "../diff";
import type { PricingConfig } from "../types";

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

describe("diffPricingConfig", () => {
  it("reports nothing when nothing changed", () => {
    expect(diffPricingConfig(seed(), seed())).toEqual([]);
  });

  it("reports a price change field by field", () => {
    const before = seed();
    const after = seed();
    after.priceBook.costItems.find((c) => c.id === "mulch_hardwood")!.unitCost = 46;

    const changes = diffPricingConfig(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "changed",
      entity: "Cost item",
      key: "mulch_hardwood",
      fields: [{ field: "unitCost", before: 38, after: 46 }],
    });
    expect(describeChange(changes[0])).toBe(
      'Cost item "Shredded hardwood mulch": unitCost 38 → 46',
    );
  });

  it("reports additions and removals", () => {
    const before = seed();
    const after = seed();
    after.priceBook.costItems.push({
      id: "stone_pea_gravel",
      name: "Pea gravel",
      kind: "material",
      unit: "CY",
      unitCost: 68,
    });
    after.priceBook.costItems = after.priceBook.costItems.filter(
      (c) => c.id !== "boulder_24in",
    );

    const changes = diffPricingConfig(before, after);
    expect(changes.find((c) => c.key === "stone_pea_gravel")?.kind).toBe("added");
    expect(changes.find((c) => c.key === "boulder_24in")?.kind).toBe("removed");
  });

  it("treats a component reorder as a real change — line order is part of the bid", () => {
    const before = seed();
    const after = seed();
    const assembly = after.priceBook.assemblies.find((a) => a.components.length > 1)!;
    assembly.components.reverse();

    const changes = diffPricingConfig(before, after);
    const change = changes.find((c) => c.key === assembly.id);
    expect(change?.kind).toBe("changed");
    expect(change?.fields.map((f) => f.field)).toContain("components");
  });

  it("reports margin and disclosure changes separately from the book", () => {
    const before = seed();
    const after = seed();
    after.margin.targetGmPct = 48;
    after.bandPolicy.roundTo = 250;

    const changes = diffPricingConfig(before, after);
    expect(changes.find((c) => c.entity === "Margin")?.fields).toEqual([
      { field: "targetGmPct", before: 45, after: 48 },
    ]);
    expect(changes.find((c) => c.key === "bandPolicy")?.fields).toEqual([
      { field: "roundTo", before: 100, after: 250 },
    ]);
  });

  it("reports a distribution change, which is how the opening band moves", () => {
    const before = seed();
    const after = seed();
    after.distributions.mulch_to_stone.residential.bed_area_sf = {
      unit: "SF",
      p25: 175,
      p50: 320,
      p75: 560,
    };

    const changes = diffPricingConfig(before, after);
    const change = changes.find((c) => c.entity === "Distribution")!;
    expect(change.kind).toBe("changed");
    expect(change.key).toBe("mulch_to_stone.residential.bed_area_sf");
  });

  it("does not confuse an absent optional field with a changed one", () => {
    const before = seed();
    const after = seed();
    // burdenPct is absent on materials in both; that is not a change.
    const material = after.priceBook.costItems.find((c) => c.kind === "material")!;
    material.name = material.name;
    expect(diffPricingConfig(before, after)).toEqual([]);
  });
});
