/**
 * Phase 3.5 — growth curves.
 *
 * Approach to mature size is roughly sigmoid, not linear, so this is a
 * per-growth-rate-class lookup ("% of mature size at year N") with linear
 * interpolation between the published points — the nursery rule-of-thumb
 * table the map calls for, not a botany simulator.
 *
 * Like the seed price book, the fractions are PLACEHOLDERS from published
 * nursery rules of thumb (fast ≈ mature in 5-7 yrs, medium ≈ 10, slow ≈ 15;
 * install size ≈ 25-35% of mature). Replace the tables when the contractor
 * supplies real per-class data; keep the exported names stable.
 */
import type { GrowthRateClass, PlantMeta } from "../catalog/types";
import type { PlantSizeAtYear, RenderSpec, TreeRenderState } from "./types";

/**
 * [yearsAfterPlanting, fractionOfMatureSize] anchor points per class.
 * Year 0 is install size. Must be sorted by year and non-decreasing in
 * fraction; the last point pins full maturity.
 */
export const growthCurvePoints: Record<GrowthRateClass, [number, number][]> = {
  fast: [
    [0, 0.35],
    [1, 0.5],
    [2, 0.65],
    [3, 0.8],
    [5, 0.95],
    [7, 1],
  ],
  medium: [
    [0, 0.3],
    [1, 0.4],
    [2, 0.5],
    [3, 0.6],
    [5, 0.8],
    [8, 0.95],
    [10, 1],
  ],
  slow: [
    [0, 0.25],
    [1, 0.3],
    [2, 0.38],
    [3, 0.45],
    [5, 0.6],
    [10, 0.85],
    [15, 1],
  ],
};

/** Fraction of mature size (0-1) at `year` years after planting. */
export function fractionOfMatureSize(
  growthRateClass: GrowthRateClass,
  year: number,
): number {
  const points = growthCurvePoints[growthRateClass];
  const clamped = Math.max(0, year);
  const last = points[points.length - 1];
  if (clamped >= last[0]) return last[1];
  let [prevYear, prevFrac] = points[0];
  for (const [ptYear, ptFrac] of points) {
    if (clamped <= ptYear) {
      if (ptYear === prevYear) return ptFrac;
      const t = (clamped - prevYear) / (ptYear - prevYear);
      return prevFrac + t * (ptFrac - prevFrac);
    }
    prevYear = ptYear;
    prevFrac = ptFrac;
  }
  return last[1];
}

/** Rendered height and spread of a plant at `year` years after planting. */
export function sizeAtYear(meta: PlantMeta, year: number): PlantSizeAtYear {
  const fraction = fractionOfMatureSize(meta.growthRateClass, year);
  return {
    year,
    fractionOfMature: fraction,
    heightFt: meta.matureHeightFt * fraction,
    spreadFt: meta.matureSpreadFt * fraction,
  };
}

/**
 * Render-state thresholds for staged tree assets, as fraction of mature
 * size. Below juvenile → juvenile asset; between → semi-mature; above →
 * mature.
 */
export const treeStateThresholds = { juvenile: 0.45, semiMature: 0.8 };

export function treeRenderState(fraction: number): TreeRenderState {
  if (fraction < treeStateThresholds.juvenile) return "juvenile";
  if (fraction < treeStateThresholds.semiMature) return "semi_mature";
  return "mature";
}

/**
 * MVP asset strategy: one image per SKU, scaled, for everything except
 * trees, which carry staged assets because a juvenile is not a small
 * mature specimen.
 */
export function renderSpec(
  skuId: string,
  meta: PlantMeta,
  year: number,
): RenderSpec {
  const fraction = fractionOfMatureSize(meta.growthRateClass, year);
  if (meta.category !== "tree") {
    return { kind: "scaled", assetKey: skuId, scale: fraction };
  }
  const state = treeRenderState(fraction);
  return { kind: "staged", assetKey: `${skuId}__${state}`, state, scale: fraction };
}
