import { describe, expect, it } from "vitest";

import type { Quantity } from "@/lib/pricing/types";
import { getTypologyBand } from "@/lib/pricing/typology";
import { wiBandPolicy, wiTypologyConfig } from "@/seed/pricebook.seed";

import type { RegionSelection } from "../types";
import {
  assemblyQuantityForRegion,
  measuredBandForSelections,
  type RegionMeasurement,
} from "../measured";

const NOW = () => "2026-08-21T00:00:00Z";

function drawn(value: number, unit: "SF" | "LF"): Quantity {
  return { value, unit, source: "user_drawn", confidence: 0.85, capturedAt: NOW() };
}

function measurement(areaSf: number, perimeterLf: number): RegionMeasurement {
  return { areaSf: drawn(areaSf, "SF"), perimeterLf: drawn(perimeterLf, "LF") };
}

const stoneSelection: Record<string, RegionSelection> = {
  bed_1: { surfaceOptionId: "surface_stone_river_rock", addonOptionIds: ["addon_steel_edging"] },
};

describe("measuredBandForSelections", () => {
  it("returns null when nothing is selected", () => {
    expect(
      measuredBandForSelections({}, { bed_1: measurement(300, 80) }, "residential", wiTypologyConfig, wiBandPolicy, NOW),
    ).toBeNull();
  });

  it("returns null when no selected region is measured", () => {
    expect(
      measuredBandForSelections(stoneSelection, {}, "residential", wiTypologyConfig, wiBandPolicy, NOW),
    ).toBeNull();
  });

  it("narrows the band: a P50-sized measured job sits strictly inside the typology band", () => {
    const typology = getTypologyBand("mulch_to_stone", "residential", wiTypologyConfig, NOW);
    const measured = measuredBandForSelections(
      stoneSelection,
      { bed_1: measurement(300, 80) }, // exactly the P50 distribution
      "residential",
      wiTypologyConfig,
      wiBandPolicy,
      NOW,
    );
    expect(measured).not.toBeNull();
    expect(measured!.basis).toBe("measured");
    expect(measured!.low).toBeGreaterThan(typology.low);
    expect(measured!.high).toBeLessThan(typology.high);
    expect(measured!.high - measured!.low).toBeLessThan(typology.high - typology.low);
    expect(measured!.jobType).toBe("mulch_to_stone");
    expect(measured!.totalMeasuredAreaSf).toBe(300);
    expect(measured!.measuredRegionIds).toEqual(["bed_1"]);
    expect(measured!.unmeasuredRegionIds).toEqual([]);
  });

  it("tracks quantity: a bigger yard prices higher than a smaller one", () => {
    const small = measuredBandForSelections(
      stoneSelection, { bed_1: measurement(150, 50) }, "residential", wiTypologyConfig, wiBandPolicy, NOW,
    )!;
    const large = measuredBandForSelections(
      stoneSelection, { bed_1: measurement(900, 180) }, "residential", wiTypologyConfig, wiBandPolicy, NOW,
    )!;
    expect(large.low).toBeGreaterThan(small.low);
    expect(large.high).toBeGreaterThan(small.high);
  });

  it("prices a partly measured design as one whole and lists the unmeasured region", () => {
    const selections: Record<string, RegionSelection> = {
      ...stoneSelection,
      bed_2: { surfaceOptionId: "surface_mulch_hardwood", addonOptionIds: [] },
    };
    const partial = measuredBandForSelections(
      selections, { bed_1: measurement(300, 80) }, "residential", wiTypologyConfig, wiBandPolicy, NOW,
    )!;
    const onlyMeasured = measuredBandForSelections(
      stoneSelection, { bed_1: measurement(300, 80) }, "residential", wiTypologyConfig, wiBandPolicy, NOW,
    )!;
    expect(partial.unmeasuredRegionIds).toEqual(["bed_2"]);
    // The unmeasured mulch bed still contributes (at typology P50), so the
    // combined band sits above the measured-only one.
    expect(partial.low).toBeGreaterThan(onlyMeasured.low);
  });

  it("carries the internal estimate in exactly one field, so callers can strip it", () => {
    const measured = measuredBandForSelections(
      stoneSelection, { bed_1: measurement(300, 80) }, "residential", wiTypologyConfig, wiBandPolicy, NOW,
    )!;
    // Since Phase 5 the result includes the engine estimate (frozen into the
    // lead snapshot). It is the ONLY internal field: everything else remains
    // customer-safe, and routes must serve only the customerPayload built in
    // lib/design/quote.ts — never this object whole.
    expect(Object.keys(measured).sort()).toEqual(
      [
        "basis",
        "currency",
        "estimate",
        "high",
        "jobType",
        "low",
        "measuredRegionIds",
        "scope",
        "totalMeasuredAreaSf",
        "unmeasuredRegionIds",
      ].sort(),
    );
    const { estimate, ...customerSafe } = measured;
    expect(estimate.sellPrice).toBeGreaterThan(0);
    const json = JSON.stringify(customerSafe);
    for (const forbidden of ["unitCost", "burden", "margin", "directCost", "totalCost", "sellPrice"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe("assemblyQuantityForRegion", () => {
  it("uses the drawn area for SF assemblies and the drawn perimeter for LF assemblies", () => {
    const m = measurement(412, 96);
    const area = assemblyQuantityForRegion(
      "stone_bed_conversion", "mulch_to_stone", m, "residential", wiTypologyConfig, NOW(),
    );
    expect(area).toMatchObject({ value: 412, unit: "SF", source: "user_drawn", confidence: 0.85 });
    const edge = assemblyQuantityForRegion(
      "steel_edging_install", "mulch_to_stone", m, "residential", wiTypologyConfig, NOW(),
    );
    expect(edge).toMatchObject({ value: 96, unit: "LF", source: "user_drawn" });
  });

  it("scales plant counts from measured area by typology density, labeled typology", () => {
    // bed_renovation residential: shrubs P50 = 10 over P50 bed area 350 SF.
    // A measured 700 SF bed should suggest 20 shrubs.
    const qty = assemblyQuantityForRegion(
      "install_plant_hydrangea_annabelle",
      "bed_renovation",
      measurement(700, 110),
      "residential",
      wiTypologyConfig,
      NOW(),
    );
    expect(qty).toMatchObject({ value: 20, unit: "EA", source: "typology" });
    expect(qty!.confidence).toBeLessThan(0.85);
  });

  it("falls back to typology P50 for an unmeasured region", () => {
    const qty = assemblyQuantityForRegion(
      "stone_bed_conversion", "mulch_to_stone", undefined, "residential", wiTypologyConfig, NOW(),
    );
    expect(qty).toMatchObject({ value: 300, unit: "SF", source: "typology" });
  });

  it("prices non-recipe EA assemblies (accent boulders) at one each", () => {
    const qty = assemblyQuantityForRegion(
      "boulder_place_18", "bed_renovation", measurement(300, 80), "residential", wiTypologyConfig, NOW(),
    );
    expect(qty).toMatchObject({ value: 1, unit: "EA" });
  });

  it("returns null for an assembly the price book does not know", () => {
    expect(
      assemblyQuantityForRegion("no_such_assembly", "bed_renovation", undefined, "residential", wiTypologyConfig, NOW()),
    ).toBeNull();
  });
});
