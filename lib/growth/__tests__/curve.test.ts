/**
 * Phase 3.5 — growth curve tests.
 *
 * The curve tables are nursery rule-of-thumb placeholders (see curve.ts),
 * so most assertions check shape and self-consistency; interpolation cases
 * pin exact hand-calculated fractions.
 */
import { describe, expect, it } from "vitest";
import type { GrowthRateClass } from "../../catalog/types";
import {
  fractionOfMatureSize,
  growthCurvePoints,
  renderSpec,
  sizeAtYear,
  treeRenderState,
} from "../curve";
import { plantMetaBySku, plantSkus } from "../../../seed/pricebook.seed";

const classes: GrowthRateClass[] = ["slow", "medium", "fast"];

describe("fractionOfMatureSize", () => {
  it("is monotonically non-decreasing and capped at 1 for every class", () => {
    for (const cls of classes) {
      let prev = 0;
      for (let year = 0; year <= 20; year += 0.5) {
        const f = fractionOfMatureSize(cls, year);
        expect(f).toBeGreaterThanOrEqual(prev);
        expect(f).toBeLessThanOrEqual(1);
        prev = f;
      }
    }
  });

  it("reaches full maturity exactly at each class's final anchor year", () => {
    for (const cls of classes) {
      const points = growthCurvePoints[cls];
      const [finalYear] = points[points.length - 1];
      expect(fractionOfMatureSize(cls, finalYear)).toBe(1);
      expect(fractionOfMatureSize(cls, finalYear - 1)).toBeLessThan(1);
    }
  });

  it("faster classes are further along at every early year", () => {
    for (const year of [1, 2, 3, 5]) {
      expect(fractionOfMatureSize("fast", year)).toBeGreaterThan(
        fractionOfMatureSize("medium", year),
      );
      expect(fractionOfMatureSize("medium", year)).toBeGreaterThan(
        fractionOfMatureSize("slow", year),
      );
    }
  });

  it("interpolates linearly between anchor points", () => {
    // medium: year 3 → 0.6, year 5 → 0.8, so year 4 → 0.7
    expect(fractionOfMatureSize("medium", 4)).toBeCloseTo(0.7, 10);
    // slow: year 5 → 0.6, year 10 → 0.85, so year 7.5 → 0.725
    expect(fractionOfMatureSize("slow", 7.5)).toBeCloseTo(0.725, 10);
  });

  it("clamps below year 0 and beyond maturity", () => {
    expect(fractionOfMatureSize("fast", -3)).toBe(
      fractionOfMatureSize("fast", 0),
    );
    expect(fractionOfMatureSize("slow", 100)).toBe(1);
  });

  it("year-1 honesty: every class renders well below mature at year 1", () => {
    for (const cls of classes) {
      expect(fractionOfMatureSize(cls, 1)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("sizeAtYear", () => {
  it("scales the seed spirea (4 ft spread, medium) to 3.2 ft at year 5", () => {
    const meta = plantMetaBySku["plant_spirea_goldflame"];
    const size = sizeAtYear(meta, 5);
    expect(size.fractionOfMature).toBeCloseTo(0.8, 10);
    expect(size.spreadFt).toBeCloseTo(3.2, 10);
    expect(size.heightFt).toBeCloseTo(2.4, 10);
  });

  it("applies the same fraction to height and spread", () => {
    for (const sku of plantSkus) {
      const size = sizeAtYear(sku.meta, 3);
      expect(size.heightFt / sku.meta.matureHeightFt).toBeCloseTo(
        size.spreadFt / sku.meta.matureSpreadFt,
        10,
      );
    }
  });
});

describe("renderSpec — MVP asset strategy", () => {
  it("every non-tree seed SKU renders as one asset, scaled", () => {
    for (const sku of plantSkus.filter((p) => p.meta.category !== "tree")) {
      const spec = renderSpec(sku.id, sku.meta, 3);
      expect(spec.kind).toBe("scaled");
      expect(spec.assetKey).toBe(sku.id);
      expect(spec.scale).toBe(fractionOfMatureSize(sku.meta.growthRateClass, 3));
    }
  });

  it("trees walk juvenile → semi-mature → mature (Black Hills spruce, slow)", () => {
    const meta = plantMetaBySku["plant_spruce_black_hills"];
    const at = (year: number) => renderSpec("plant_spruce_black_hills", meta, year);
    expect(at(1)).toMatchObject({
      kind: "staged",
      state: "juvenile",
      assetKey: "plant_spruce_black_hills__juvenile",
    });
    expect(at(5)).toMatchObject({ kind: "staged", state: "semi_mature" });
    expect(at(15)).toMatchObject({
      kind: "staged",
      state: "mature",
      assetKey: "plant_spruce_black_hills__mature",
    });
  });

  it("state thresholds map fractions to the three tree states", () => {
    expect(treeRenderState(0.3)).toBe("juvenile");
    expect(treeRenderState(0.6)).toBe("semi_mature");
    expect(treeRenderState(0.95)).toBe("mature");
  });
});
