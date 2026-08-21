/**
 * Recording a rep's on-site correction.
 *
 * The shape of one correction, and the only place a `rep_confirmed`
 * quantity is minted:
 *
 *   beforeQty ──supersedes── afterQty
 *   (what we estimated)      (what the rep measured)
 *
 * `supersedes` needs both ends to have identity. Quantities created before
 * Phase 6 (a drawn aerial ring, a typology percentile) carry no id because
 * nothing had ever replaced them — so the correction identifies the
 * superseded quantity at the moment it supersedes it, and stores that
 * identified copy in the delta. The delta is therefore self-contained: the
 * lineage resolves from the record alone, without reaching back into a
 * project whose aerial polygons are free to change.
 *
 * Pure aside from randomUUID (injectable); no I/O.
 */
import { randomUUID } from "node:crypto";

import type { Quantity } from "../pricing/types";
import type { JobType, MarketContext } from "../pricing/typology";
import type { ConfirmableUnit, Correction, MeasurementDelta } from "./types";

/**
 * A rep with a wheel and a tape is the best sensor in the system — but not
 * a perfect one, and a confidence of exactly 1 would be a claim no
 * measurement earns.
 */
export const REP_CONFIRMED_CONFIDENCE = 0.98;

/** Corrections outside this range are a typo, not a measurement. */
export const MAX_CONFIRMED_VALUE = 1_000_000;

export class InvalidCorrectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCorrectionError";
  }
}

export type Minters = {
  mint?: () => string;
  now?: () => string;
};

/** Give a quantity identity if it has none, leaving an identified one alone. */
export function identifyQuantity(
  quantity: Quantity,
  mint: () => string = randomUUID,
): Quantity & { id: string } {
  return quantity.id
    ? (quantity as Quantity & { id: string })
    : { ...quantity, id: mint() };
}

/**
 * The rep-confirmed quantity that replaces `before`, plus the identified
 * copy of `before` it supersedes. Both are returned because they are only
 * meaningful as a pair — storing one without the other breaks the chain.
 */
export function confirmQuantity(
  before: Quantity,
  value: number,
  options: Minters = {},
): { before: Quantity & { id: string }; after: Quantity } {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidCorrectionError("A confirmed quantity must be a positive number");
  }
  if (value > MAX_CONFIRMED_VALUE) {
    throw new InvalidCorrectionError(
      `A confirmed quantity above ${MAX_CONFIRMED_VALUE} ${before.unit} is a typo, not a measurement`,
    );
  }
  const mint = options.mint ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  const identified = identifyQuantity(before, mint);
  return {
    before: identified,
    after: {
      value,
      unit: before.unit,
      source: "rep_confirmed",
      confidence: REP_CONFIRMED_CONFIDENCE,
      capturedAt: now(),
      id: mint(),
      supersedes: identified.id,
    },
  };
}

export type DeltaContext = {
  projectId: string;
  jobType: JobType;
  marketContext: MarketContext;
  correctedBy: string;
  /** Region labels at correction time, keyed by photo region id. */
  regionLabels: Record<string, string>;
};

/**
 * Turn one correction into a delta against the quantity it replaces.
 *
 * A correction that matches the estimate exactly is still recorded: a
 * confirmed zero-error measurement is the evidence that the estimator
 * works, and dropping it would bias the corpus toward its own mistakes.
 */
export function recordCorrection(
  correction: Correction,
  before: Quantity,
  context: DeltaContext,
  options: Minters = {},
): MeasurementDelta {
  if (before.unit !== correction.unit) {
    throw new InvalidCorrectionError(
      `Correction is in ${correction.unit} but the quantity it replaces is in ${before.unit}`,
    );
  }
  const mint = options.mint ?? randomUUID;
  const pair = confirmQuantity(before, correction.value, { ...options, mint });

  return {
    id: mint(),
    projectId: context.projectId,
    regionId: correction.photoRegionId,
    regionLabel: context.regionLabels[correction.photoRegionId] ?? correction.photoRegionId,
    jobType: context.jobType,
    marketContext: context.marketContext,
    unit: correction.unit,
    beforeQty: pair.before,
    afterQty: pair.after,
    source: "rep_confirmed",
    correctedBy: context.correctedBy,
    correctedAt: pair.after.capturedAt,
    ...(correction.note ? { note: correction.note } : {}),
  };
}

/**
 * The current confirmed quantity for one region dimension, or null if the
 * rep has never corrected it. Later deltas supersede earlier ones, so the
 * last matching record wins — the list is append-only and ordered.
 */
export function confirmedQuantity(
  deltas: MeasurementDelta[],
  regionId: string,
  unit: ConfirmableUnit,
): Quantity | null {
  for (let i = deltas.length - 1; i >= 0; i--) {
    const delta = deltas[i];
    if (delta.regionId === regionId && delta.unit === unit) return delta.afterQty;
  }
  return null;
}

/** Every region the rep has confirmed anything on, in first-corrected order. */
export function confirmedRegionIds(deltas: MeasurementDelta[]): string[] {
  const seen = new Set<string>();
  for (const delta of deltas) seen.add(delta.regionId);
  return [...seen];
}

/**
 * Signed error of the superseded estimate against the confirmed truth, in
 * percent. Positive means the estimate was HIGH — we would have over-built
 * the job; negative means we would have under-bid it.
 */
export function errorPct(delta: MeasurementDelta): number {
  const truth = delta.afterQty.value;
  if (truth === 0) return 0;
  return ((delta.beforeQty.value - truth) / truth) * 100;
}
