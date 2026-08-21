/**
 * Phase 6 — the confirmation gate.
 *
 * A rep visits the site, measures for real, and corrects the quantities the
 * customer was priced on. Each correction is an append-only
 * MeasurementDelta: the estimate that was wrong, the confirmed truth that
 * replaced it, and who confirmed it when.
 *
 * Two invariants ride on this module:
 *
 *   - The delta list is the ONLY record of corrections. The current
 *     confirmed quantity for a region is the newest delta's afterQty —
 *     there is no second, mutable copy to drift from it.
 *   - Nothing here touches the customer's frozen snapshot. Corrections
 *     feed a NEW estimate; the original stands exactly as submitted.
 *
 * This is also the training corpus (project-map §5: "do not skip this
 * table"). Every field an error analysis needs is captured at write time,
 * because a delta cannot be reconstructed after the fact — the estimate it
 * corrected is gone the moment it is corrected.
 */
import type { Quantity } from "../pricing/types";
import type { JobType, MarketContext } from "../pricing/typology";

/**
 * The dimensions a rep corrects on site: a region's area and its edge run.
 * Counts (EA — plants, boulders) stay typology-scaled for the MVP; they are
 * per-assembly rather than per-region, so confirming them needs a line-item
 * editor rather than a region editor.
 */
export type ConfirmableUnit = "SF" | "LF";

export const CONFIRMABLE_UNITS: ConfirmableUnit[] = ["SF", "LF"];

/** One correction: what we thought, what the rep measured, and the lineage between them. */
export type MeasurementDelta = {
  id: string;
  projectId: string;
  /** The photo region corrected — regions are the unit of measurement. */
  regionId: string;
  /** Region label at correction time, so the corpus survives re-segmentation. */
  regionLabel: string;
  jobType: JobType;
  marketContext: MarketContext;
  unit: ConfirmableUnit;
  /**
   * The superseded estimate, carrying the provenance that produced it
   * ('user_drawn' from the aerial, 'typology' when nothing was measured).
   * That provenance is the corpus's independent variable: it answers
   * "how wrong is each way of estimating?".
   */
  beforeQty: Quantity;
  /** The confirmed truth: source 'rep_confirmed', supersedes beforeQty.id. */
  afterQty: Quantity;
  /** Provenance of the correction itself — always 'rep_confirmed' here. */
  source: Quantity["source"];
  correctedBy: string;
  correctedAt: string;
  note?: string;
};

/** What a rep submits for one region dimension. */
export type Correction = {
  photoRegionId: string;
  unit: ConfirmableUnit;
  /** The measured truth, in the dimension's unit. */
  value: number;
  note?: string;
};
