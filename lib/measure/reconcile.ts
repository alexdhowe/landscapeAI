/**
 * Phase 4 — aerial vs photo arbitration.
 *
 * Reconciliation is ARBITRATION, not averaging. The aerial wins horizontal
 * area outright; the photo wins material identity, condition, and anything
 * vertical. The two sensors are never blended — where both observe the
 * same thing (horizontal area), the delta between them is a QA signal:
 *
 *   - agreement inside 15%  → tighten the band (confidence up, band down);
 *   - disagreement beyond 25% → flag for review, widen the band, suggest
 *     another photo — this is how a photo paired with the wrong property's
 *     address gets caught;
 *   - in between → hold, change nothing.
 *
 * Pure functions in the style of lib/pricing and lib/growth: measurements
 * and segmentation come in as arguments, no I/O, no imports from app/.
 */
import type { Quantity } from "../pricing/types";
import type { SegmentedRegion, VerticalElement } from "../vision/types";

/** Delta at or below this is agreement — the sensors corroborate. */
export const AGREEMENT_MAX_DELTA_PCT = 15;
/** Delta beyond this is disagreement — flag for review. */
export const DISAGREEMENT_MIN_DELTA_PCT = 25;

/** Band-width multiplier when every compared region agrees. */
export const TIGHTEN_BAND_FACTOR = 0.6;
/** Band-width multiplier when any compared region disagrees. */
export const WIDEN_BAND_FACTOR = 1.5;

/** Confidence added to an aerial quantity the photo corroborates (cap 0.95). */
const AGREEMENT_CONFIDENCE_BONUS = 0.1;
/** Confidence multiplier on an aerial quantity the photo contradicts. */
const DISAGREEMENT_CONFIDENCE_PENALTY = 0.7;
/** A photo footprint guess is never trusted beyond this, whatever the model says. */
const PHOTO_AREA_MAX_CONFIDENCE = 0.4;

export type ReconciliationVerdict =
  /** Photo estimate within 15% of the aerial number. */
  | "agreement"
  /** Photo estimate beyond 25% off the aerial number. */
  | "disagreement"
  /** Between the thresholds, or the photo offered no estimate. */
  | "inconclusive";

/** What reconciliation says about one photo region measured on the aerial. */
export type RegionReconciliation = {
  photoRegionId: string;
  label: string;
  /**
   * The arbitrated horizontal area: the aerial quantity, value untouched
   * (aerial wins), confidence adjusted by the verdict.
   */
  areaSf: Quantity;
  /** The photo's rough footprint guess as a provenance-carrying quantity — QA only, never priced. */
  photoAreaSf: Quantity | null;
  /** |aerial − photo| as a percent of the aerial number; null without a photo estimate. */
  deltaPct: number | null;
  verdict: ReconciliationVerdict;
  /** Photo wins material identity and condition. */
  existingMaterial?: string;
  condition?: string;
};

export type ReconciliationOutcome = "tighten" | "hold" | "review";

export type ReconciliationReport = {
  regions: RegionReconciliation[];
  /** Photo wins vertical: walls, steps, grade changes — rep-visit scope, not quantities. */
  verticalElements: VerticalElement[];
  /** What the photo could not determine — carried through for the rep. */
  cannotSee: string[];
  /** Region ids where both sensors produced an area (delta computable). */
  comparedRegionIds: string[];
  /** Region ids whose delta exceeded the disagreement threshold. */
  flaggedRegionIds: string[];
  /** True when any region disagrees — e.g. the photo is of a different property. */
  flagged: boolean;
  outcome: ReconciliationOutcome;
  /**
   * Multiply the disclosure policy's bandWidthPct by this: <1 when the
   * sensors corroborate, >1 when they conflict, 1 otherwise.
   */
  bandWidthFactor: number;
};

const clampConfidence = (n: number) => Math.min(0.95, Math.max(0.05, n));

/**
 * The photo's footprint guess as a Quantity with honest provenance:
 * source 'photo', confidence capped low. Null when the model offered no
 * usable estimate.
 */
export function photoAreaQuantity(
  region: Pick<SegmentedRegion, "estimatedAreaSf" | "confidence">,
  capturedAt: string,
): Quantity | null {
  const value = region.estimatedAreaSf;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return {
    value,
    unit: "SF",
    source: "photo",
    confidence: Math.min(PHOTO_AREA_MAX_CONFIDENCE, clampConfidence(region.confidence)),
    capturedAt,
  };
}

/** |aerial − photo| as a percent of the aerial number (the trusted one). */
export function areaDeltaPct(aerialSf: number, photoSf: number): number {
  if (aerialSf <= 0) return Infinity;
  return (Math.abs(aerialSf - photoSf) / aerialSf) * 100;
}

export function verdictForDelta(deltaPct: number | null): ReconciliationVerdict {
  if (deltaPct === null) return "inconclusive";
  if (deltaPct <= AGREEMENT_MAX_DELTA_PCT) return "agreement";
  if (deltaPct > DISAGREEMENT_MIN_DELTA_PCT) return "disagreement";
  return "inconclusive";
}

/** Arbitrate one region: aerial area stands; the verdict moves confidence. */
export function reconcileRegion(
  photoRegion: SegmentedRegion,
  aerialAreaSf: Quantity,
): RegionReconciliation {
  const photoAreaSf = photoAreaQuantity(photoRegion, aerialAreaSf.capturedAt);
  const deltaPct = photoAreaSf
    ? Math.round(areaDeltaPct(aerialAreaSf.value, photoAreaSf.value) * 10) / 10
    : null;
  const verdict = verdictForDelta(deltaPct);

  let confidence = aerialAreaSf.confidence;
  if (verdict === "agreement") {
    confidence = clampConfidence(confidence + AGREEMENT_CONFIDENCE_BONUS);
  } else if (verdict === "disagreement") {
    confidence = clampConfidence(confidence * DISAGREEMENT_CONFIDENCE_PENALTY);
  }

  return {
    photoRegionId: photoRegion.id,
    label: photoRegion.label,
    areaSf: { ...aerialAreaSf, confidence },
    photoAreaSf,
    deltaPct,
    verdict,
    existingMaterial: photoRegion.existingMaterial,
    condition: photoRegion.condition,
  };
}

/** The slice of a segmentation result reconciliation consumes. */
export type PhotoObservations = {
  regions: SegmentedRegion[];
  verticalElements?: VerticalElement[];
  cannotSee?: string[];
};

/**
 * Reconcile a design: every photo region with an aerial measurement gets
 * arbitrated, and the deltas roll up to one QA outcome for the whole
 * design — any disagreement flags it for review (widen the band, request
 * another photo); unanimous agreement across at least one compared region
 * tightens the band; anything else holds.
 */
export function reconcileDesign(
  photo: PhotoObservations,
  aerialAreaByRegionId: Record<string, Quantity>,
): ReconciliationReport {
  const regions = photo.regions
    .filter((r) => aerialAreaByRegionId[r.id])
    .map((r) => reconcileRegion(r, aerialAreaByRegionId[r.id]));

  const comparedRegionIds = regions
    .filter((r) => r.deltaPct !== null)
    .map((r) => r.photoRegionId);
  const flaggedRegionIds = regions
    .filter((r) => r.verdict === "disagreement")
    .map((r) => r.photoRegionId);

  const flagged = flaggedRegionIds.length > 0;
  const allAgree =
    comparedRegionIds.length > 0 &&
    regions.every((r) => r.deltaPct === null || r.verdict === "agreement");

  const outcome: ReconciliationOutcome = flagged ? "review" : allAgree ? "tighten" : "hold";

  return {
    regions,
    verticalElements: photo.verticalElements ?? [],
    cannotSee: photo.cannotSee ?? [],
    comparedRegionIds,
    flaggedRegionIds,
    flagged,
    outcome,
    bandWidthFactor:
      outcome === "review"
        ? WIDEN_BAND_FACTOR
        : outcome === "tighten"
          ? TIGHTEN_BAND_FACTOR
          : 1,
  };
}
