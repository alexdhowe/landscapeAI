/**
 * Test price book.
 *
 * PLACEHOLDER NUMBERS. Section 7 of the project map calls for real seed
 * data — ~40 SKUs, actual burden/overhead, and 10 historical bids with
 * known quantities. These fixtures use plausible regional figures so the
 * math can be hand-verified; swap in real bid data when it's available and
 * update the expected values in golden.test.ts to match.
 */
import type { DisclosurePolicy, MarginConfig, PriceBook, Quantity, QuantityUnit } from "../types";

export const priceBook: PriceBook = {
  costItems: [
    // materials
    { id: "stone_38_minus", name: "Decorative stone 3/8in minus", kind: "material", unit: "CY", unitCost: 85, wasteFactorPct: 10 },
    { id: "mulch_hardwood", name: "Hardwood mulch", kind: "material", unit: "CY", unitCost: 38, wasteFactorPct: 10 },
    { id: "weed_fabric", name: "Woven weed fabric", kind: "material", unit: "SF", unitCost: 0.25, wasteFactorPct: 5 },
    { id: "edging_steel", name: "Steel edging", kind: "material", unit: "LF", unitCost: 4.5, wasteFactorPct: 5 },
    { id: "shrub_3gal", name: "Shrub, 3 gal container", kind: "material", unit: "EA", unitCost: 28 },
    { id: "planting_soil", name: "Planting soil blend", kind: "material", unit: "CY", unitCost: 45, wasteFactorPct: 10 },
    { id: "boulder_18in", name: "Granite boulder 18in", kind: "material", unit: "EA", unitCost: 95 },
    // labor
    { id: "labor_crew", name: "Landscape crew labor", kind: "labor", unit: "HR", unitCost: 58, burdenPct: 35 },
    // equipment
    { id: "skidsteer", name: "Skid steer w/ operator fuel", kind: "equipment", unit: "HR", unitCost: 45 },
    // disposal
    { id: "disposal_greenwaste", name: "Green waste disposal", kind: "disposal", unit: "CY", unitCost: 60 },
  ],
  assemblies: [
    {
      id: "stone_bed_conversion",
      name: "Mulch-to-stone bed conversion, 3in over fabric",
      unit: "SF",
      components: [
        { costItemId: "stone_38_minus", qtyPerUnit: 0.0093 }, // ~3in lift per SF
        { costItemId: "weed_fabric", qtyPerUnit: 1 },
        { costItemId: "disposal_greenwaste", qtyPerUnit: 0.0062 }, // ~2in of old mulch out
        { costItemId: "labor_crew", productionRate: 20 }, // SF per crew-hour
        { costItemId: "skidsteer", qtyPerUnit: 0.01 },
      ],
    },
    {
      id: "mulch_refresh",
      name: "Mulch bed refresh, 2in top-up",
      unit: "SF",
      components: [
        { costItemId: "mulch_hardwood", qtyPerUnit: 0.0062 },
        { costItemId: "labor_crew", productionRate: 80 },
      ],
    },
    {
      id: "steel_edging",
      name: "Steel bed edging, installed",
      unit: "LF",
      components: [
        { costItemId: "edging_steel", qtyPerUnit: 1 },
        { costItemId: "labor_crew", productionRate: 10 },
      ],
    },
    {
      id: "shrub_install_3gal",
      name: "Shrub installation, 3 gal",
      unit: "EA",
      components: [
        { costItemId: "shrub_3gal", qtyPerUnit: 1 },
        { costItemId: "planting_soil", qtyPerUnit: 0.05 },
        { costItemId: "labor_crew", productionRate: 3 },
      ],
    },
    {
      id: "boulder_place",
      name: "Accent boulder placement",
      unit: "EA",
      components: [
        { costItemId: "boulder_18in", qtyPerUnit: 1 },
        { costItemId: "labor_crew", productionRate: 2 },
        { costItemId: "skidsteer", qtyPerUnit: 0.5 },
      ],
    },
  ],
};

export const marginConfig: MarginConfig = {
  targetGmPct: 45,
  minGmPct: 35,
  contingencyPct: 5,
};

export const bandPolicy: DisclosurePolicy = {
  mode: "band",
  bandWidthPct: 15,
  showUnitRates: false,
  roundTo: 50,
};

export const tiersPolicy: DisclosurePolicy = {
  mode: "tiers",
  bandWidthPct: 15,
  showUnitRates: false,
  roundTo: 50,
};

export const figurePolicy: DisclosurePolicy = {
  mode: "figure",
  bandWidthPct: 15,
  showUnitRates: false,
  roundTo: 10,
};

export function qty(
  value: number,
  unit: QuantityUnit,
  source: Quantity["source"] = "user_drawn",
): Quantity {
  return {
    value,
    unit,
    source,
    confidence: 0.9,
    capturedAt: "2026-08-20T12:00:00.000Z",
  };
}
