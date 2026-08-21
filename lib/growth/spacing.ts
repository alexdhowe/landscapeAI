/**
 * Phase 3.5 — spacing validation.
 *
 * Compare placed spacing against projected canopy spread, flag crowding at
 * the evaluation year (default 5), and suggest a corrected count and
 * spacing. This is what a good designer does and it makes the contractor
 * look competent. Pure functions — placements and metadata come in as
 * arguments.
 */
import type { PlantMeta } from "../catalog/types";
import { sizeAtYear } from "./curve";
import type {
  CrowdingWarning,
  PlantPlacement,
  RowCorrection,
  SpacingReport,
} from "./types";

/** Industry-standard center-to-center spacing: average of mature spreads. */
export function recommendedSpacingFt(
  metaA: PlantMeta,
  metaB: PlantMeta = metaA,
): number {
  return (metaA.matureSpreadFt + metaB.matureSpreadFt) / 2;
}

function distanceFt(a: PlantPlacement, b: PlantPlacement): number {
  return Math.hypot(a.xFt - b.xFt, a.yFt - b.yFt);
}

/** Required center-to-center separation for two plants at a given year. */
function requiredSeparationAt(
  metaA: PlantMeta,
  metaB: PlantMeta,
  year: number,
): number {
  return (sizeAtYear(metaA, year).spreadFt + sizeAtYear(metaB, year).spreadFt) / 2;
}

/** First whole year (0..evaluationYear) the two canopies collide, else null. */
function firstCrowdedYear(
  metaA: PlantMeta,
  metaB: PlantMeta,
  distance: number,
  evaluationYear: number,
): number | null {
  for (let year = 0; year <= evaluationYear; year++) {
    if (distance < requiredSeparationAt(metaA, metaB, year)) return year;
  }
  return null;
}

/**
 * Suggested fix for an over-planted run of one SKU: keep the run the
 * plants occupy, fit as many as mature spread allows, and space them
 * evenly across it.
 */
export function suggestRowCorrection(
  skuId: string,
  placements: PlantPlacement[],
  meta: PlantMeta,
): RowCorrection {
  let rowLengthFt = 0;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      rowLengthFt = Math.max(rowLengthFt, distanceFt(placements[i], placements[j]));
    }
  }
  const spacing = recommendedSpacingFt(meta);
  const correctedCount = Math.max(1, Math.floor(rowLengthFt / spacing) + 1);
  return {
    skuId,
    currentCount: placements.length,
    rowLengthFt,
    correctedCount,
    correctedSpacingFt:
      correctedCount > 1 ? rowLengthFt / (correctedCount - 1) : spacing,
  };
}

export type SpacingOptions = {
  /** Year the crowding check is evaluated at. Default 5 (per the map). */
  evaluationYear?: number;
};

/**
 * Pairwise crowding check across a design's placed plants. Placements whose
 * SKU has no metadata are skipped — only living SKUs carry PlantMeta.
 */
export function validateSpacing(
  placements: PlantPlacement[],
  metaBySku: Record<string, PlantMeta>,
  options: SpacingOptions = {},
): SpacingReport {
  const evaluationYear = options.evaluationYear ?? 5;
  const plants = placements.filter((p) => metaBySku[p.skuId]);

  const warnings: CrowdingWarning[] = [];
  for (let i = 0; i < plants.length; i++) {
    for (let j = i + 1; j < plants.length; j++) {
      const a = plants[i];
      const b = plants[j];
      const metaA = metaBySku[a.skuId];
      const metaB = metaBySku[b.skuId];
      const distance = distanceFt(a, b);
      const requiredAtEval = requiredSeparationAt(metaA, metaB, evaluationYear);
      if (distance >= requiredAtEval) continue;
      warnings.push({
        aId: a.id,
        bId: b.id,
        skuIds: [a.skuId, b.skuId],
        distanceFt: distance,
        matureSeparationFt: recommendedSpacingFt(metaA, metaB),
        overlapAtEvalYearFt: requiredAtEval - distance,
        crowdsByYear: firstCrowdedYear(metaA, metaB, distance, evaluationYear),
      });
    }
  }

  const warnedSkus = new Set(warnings.flatMap((w) => w.skuIds));
  const corrections: RowCorrection[] = [];
  for (const skuId of warnedSkus) {
    const group = plants.filter((p) => p.skuId === skuId);
    if (group.length < 2) continue;
    corrections.push(suggestRowCorrection(skuId, group, metaBySku[skuId]));
  }

  return { ok: warnings.length === 0, evaluationYear, warnings, corrections };
}
