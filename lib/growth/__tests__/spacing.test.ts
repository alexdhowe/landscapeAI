/**
 * Phase 3.5 — spacing validation tests, including the map's acceptance
 * case: shrubs placed at 18 inches with a 4-foot mature spread must fire a
 * crowding warning with a corrected count.
 */
import { describe, expect, it } from "vitest";
import type { PlantPlacement } from "../types";
import {
  recommendedSpacingFt,
  suggestRowCorrection,
  validateSpacing,
} from "../spacing";
import { plantMetaBySku } from "../../../seed/pricebook.seed";

/** Spirea 'Goldflame': 4 ft mature spread, medium growth — the acceptance SKU. */
const SPIREA = "plant_spirea_goldflame";

function row(skuId: string, count: number, spacingFt: number): PlantPlacement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${skuId}_${i}`,
    skuId,
    xFt: i * spacingFt,
    yFt: 0,
  }));
}

describe("acceptance: 18 in spacing on a 4 ft mature spread", () => {
  const placements = row(SPIREA, 5, 1.5);
  const report = validateSpacing(placements, plantMetaBySku);

  it("fires a crowding warning", () => {
    expect(report.ok).toBe(false);
    expect(report.warnings.length).toBeGreaterThan(0);
    const adjacent = report.warnings.find(
      (w) => w.aId === `${SPIREA}_0` && w.bId === `${SPIREA}_1`,
    );
    expect(adjacent).toBeDefined();
    expect(adjacent!.distanceFt).toBeCloseTo(1.5, 10);
    expect(adjacent!.matureSeparationFt).toBe(4);
    // year-5 spread is 3.2 ft (medium → 0.8), so overlap = 3.2 - 1.5
    expect(adjacent!.overlapAtEvalYearFt).toBeCloseTo(1.7, 10);
  });

  it("reports when the crowding sets in", () => {
    // Required separation: 1.2 ft at install (0.3), 1.6 ft at year 1 (0.4) —
    // an 18 in spacing is fine on day one and crowded by year 1.
    const adjacent = report.warnings[0];
    expect(adjacent.crowdsByYear).toBe(1);
  });

  it("suggests a corrected count and spacing for the run", () => {
    const correction = report.corrections.find((c) => c.skuId === SPIREA);
    expect(correction).toBeDefined();
    // 5 plants at 1.5 ft occupy a 6 ft run; at 4 ft mature spread only
    // floor(6/4)+1 = 2 fit, spaced evenly 6 ft apart.
    expect(correction!.currentCount).toBe(5);
    expect(correction!.rowLengthFt).toBeCloseTo(6, 10);
    expect(correction!.correctedCount).toBe(2);
    expect(correction!.correctedSpacingFt).toBeCloseTo(6, 10);
    expect(correction!.correctedSpacingFt).toBeGreaterThanOrEqual(
      recommendedSpacingFt(plantMetaBySku[SPIREA]),
    );
  });
});

describe("validateSpacing", () => {
  it("passes plants placed at recommended (mature-spread) spacing", () => {
    const report = validateSpacing(row(SPIREA, 5, 4), plantMetaBySku);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
    expect(report.corrections).toHaveLength(0);
  });

  it("flags cross-SKU crowding but only corrects multi-plant runs", () => {
    const placements: PlantPlacement[] = [
      { id: "h1", skuId: "plant_hydrangea_annabelle", xFt: 0, yFt: 0 },
      { id: "s1", skuId: SPIREA, xFt: 3, yFt: 0 },
    ];
    const report = validateSpacing(placements, plantMetaBySku);
    // year-5 requirement: (5 × 0.95 + 4 × 0.8) / 2 = 3.975 ft > 3 ft placed
    expect(report.ok).toBe(false);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].matureSeparationFt).toBeCloseTo(4.5, 10);
    // one plant per SKU — no run to correct
    expect(report.corrections).toHaveLength(0);
  });

  it("uses true 2D distance, not axis distance", () => {
    const placements: PlantPlacement[] = [
      { id: "a", skuId: SPIREA, xFt: 0, yFt: 0 },
      { id: "b", skuId: SPIREA, xFt: 3, yFt: 4 }, // 5 ft apart
    ];
    expect(validateSpacing(placements, plantMetaBySku).ok).toBe(true);
  });

  it("skips placements whose SKU has no plant metadata (boulders, etc.)", () => {
    const placements: PlantPlacement[] = [
      { id: "b1", skuId: "boulder_18in", xFt: 0, yFt: 0 },
      { id: "b2", skuId: "boulder_18in", xFt: 0.5, yFt: 0 },
    ];
    expect(validateSpacing(placements, plantMetaBySku).ok).toBe(true);
  });

  it("honors a custom evaluation year", () => {
    // 18 in spacing is not yet crowded at install (1.2 ft required)…
    const atInstall = validateSpacing(row(SPIREA, 2, 1.5), plantMetaBySku, {
      evaluationYear: 0,
    });
    expect(atInstall.ok).toBe(true);
    // …but is at year 5 (the default).
    expect(atInstall.evaluationYear).toBe(0);
    expect(validateSpacing(row(SPIREA, 2, 1.5), plantMetaBySku).ok).toBe(false);
  });
});

describe("suggestRowCorrection", () => {
  it("never suggests tighter spacing than the mature spread", () => {
    const meta = plantMetaBySku[SPIREA];
    for (const [count, spacing] of [
      [3, 1],
      [7, 2],
      [10, 3.9],
    ] as const) {
      const fix = suggestRowCorrection(SPIREA, row(SPIREA, count, spacing), meta);
      expect(fix.correctedSpacingFt).toBeGreaterThanOrEqual(meta.matureSpreadFt);
      expect(fix.correctedCount).toBeLessThanOrEqual(count);
    }
  });
});
