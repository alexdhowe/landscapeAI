/**
 * One quote computation for one project — the single source of both sides
 * of the disclosure boundary.
 *
 * /api/price serves `customerPayload` (and nothing else) to the customer;
 * the Phase 5 submit freezes the SAME quote into an EstimateSnapshot:
 * `customerPayload` becomes the frozen customer bytes, and the internal
 * fields (estimate, policyUsed, reconciliation) become the contractor side
 * of the snapshot. Because both surfaces read one computation, the stored
 * snapshot cannot drift from what the customer was shown.
 *
 * Pure — the project state, typology config, and disclosure policy come in
 * as arguments; no I/O.
 */
import {
  reconcileDesign,
  type ReconciliationReport,
} from "../measure/reconcile";
import { buildEstimate } from "../pricing/engine";
import type {
  DisclosurePolicy,
  InternalEstimate,
  Quantity,
} from "../pricing/types";
import type { JobType, MarketContext, TypologyConfig } from "../pricing/typology";
import { bandForSelections } from "./band";
import {
  designEngineInput,
  measuredBandForSelections,
  type RegionMeasurement,
} from "./measured";
import type { DesignProject } from "./types";

/** Customer-safe arbitration summary: verdicts and photo scope notes only. */
export type CustomerReconciliationSummary = {
  outcome: ReconciliationReport["outcome"];
  flagged: boolean;
  comparedRegions: number;
  flaggedRegions: { id: string; label: string }[];
  verticalElements: { kind: string; description: string }[];
};

/**
 * Exactly what /api/price responds with — and therefore exactly what gets
 * frozen for the customer at submit time. Display prices and scope only;
 * no line items, unit rates, costs, or margin.
 */
/**
 * The final quote, issued after a rep confirms quantities on site. It is a
 * FIGURE, not a band: the band existed to be honest about what had not
 * been measured, and once a person has measured it, the uncertainty it
 * expressed is gone. Carries the band it replaced so the customer can see
 * where the number landed inside what they were promised.
 */
export type FinalQuotePayload = {
  quote: {
    price: number;
    currency: "USD";
    basis: "rep_confirmed";
  };
  /** The band this supersedes, from the customer's submitted snapshot. */
  supersededBand: { low: number; high: number } | null;
  jobType: JobType;
  context: MarketContext;
  scope: string[];
  confirmation: {
    /** Regions a rep measured on site. */
    confirmedRegions: number;
    /** Total confirmed area across those regions, whole SF. */
    confirmedAreaSf: number;
    confirmedBy: string;
    confirmedAt: string;
  };
};

export type CustomerQuotePayload =
  | FinalQuotePayload
  | {
      band: {
        low: number;
        high: number;
        currency: "USD";
        basis: "measured";
      };
      typologyBand: { low: number; high: number };
      jobType: JobType;
      context: MarketContext;
      scope: string[];
      measurement: {
        measuredRegions: number;
        unmeasuredRegions: number;
        totalAreaSf: number;
      };
      reconciliation: CustomerReconciliationSummary | null;
    }
  | {
      band: {
        low: number;
        high: number;
        typical: number;
        currency: "USD";
        basis: "typology";
      };
      jobType: JobType;
      context: MarketContext;
      scope: string[];
    };

/**
 * The displayed band, or null once a final quote has replaced it with a
 * figure. Every surface that renders a customer payload goes through this
 * or through isFinalQuotePayload — there is no third shape.
 */
export function customerBand(
  payload: CustomerQuotePayload,
): { low: number; high: number } | null {
  // Just the endpoints, rebuilt — the band object also carries basis and
  // currency, and a caller that stores this (the final quote's
  // supersededBand) must not silently inherit them.
  return isFinalQuotePayload(payload)
    ? null
    : { low: payload.band.low, high: payload.band.high };
}

/** True for the post-confirmation figure; the other variants carry a band. */
export function isFinalQuotePayload(
  payload: CustomerQuotePayload,
): payload is FinalQuotePayload {
  return "quote" in payload;
}

export type ProjectQuote = {
  basis: "typology" | "measured" | "rep_confirmed";
  jobType: JobType;
  /**
   * The engine estimate behind the customer band. INTERNAL — contractor
   * surfaces only. Null in the degenerate case where selections imply a
   * job type but map to no priceable assembly (nothing to freeze).
   */
  estimate: InternalEstimate | null;
  /** The disclosure policy actually applied (reconciliation-adjusted width). */
  policyUsed: DisclosurePolicy;
  /** Photo/aerial arbitration; null until both sensors have reported. INTERNAL. */
  reconciliation: ReconciliationReport | null;
  customerPayload: CustomerQuotePayload;
};

/**
 * Price one project end to end: typology band, aerial measurements,
 * Phase 4 reconciliation, and the disclosure projection. Null when nothing
 * has been selected yet (no design → no quote).
 */
export function quoteProject(
  project: DesignProject,
  config: TypologyConfig,
  basePolicy: DisclosurePolicy,
  now: () => string = () => new Date().toISOString(),
): ProjectQuote | null {
  const typology = bandForSelections(
    project.selections,
    project.marketContext,
    config,
  );
  if (!typology) return null;

  const measurements: Record<string, RegionMeasurement> = {};
  const aerialAreaByRegionId: Record<string, Quantity> = {};
  for (const region of project.aerialRegions ?? []) {
    measurements[region.photoRegionId] = {
      areaSf: region.areaSf,
      perimeterLf: region.perimeterLf,
    };
    aerialAreaByRegionId[region.photoRegionId] = region.areaSf;
  }

  // Both sensors present → arbitrate. (Projects segmented before Phase 4
  // have no verticalElements field; treat that as none reported.)
  let reconciliation: ReconciliationReport | null = null;
  if (
    project.segmentation.status === "ready" &&
    Object.keys(aerialAreaByRegionId).length > 0
  ) {
    reconciliation = reconcileDesign(
      {
        regions: project.segmentation.regions,
        verticalElements: project.segmentation.verticalElements ?? [],
        cannotSee: project.segmentation.cannotSee,
      },
      aerialAreaByRegionId,
    );
  }

  const policy = reconciliation
    ? {
        ...basePolicy,
        bandWidthPct: basePolicy.bandWidthPct * reconciliation.bandWidthFactor,
      }
    : basePolicy;

  const measured = measuredBandForSelections(
    project.selections,
    measurements,
    project.marketContext,
    config,
    policy,
    now,
  );

  if (measured) {
    return {
      basis: "measured",
      jobType: measured.jobType,
      estimate: measured.estimate,
      policyUsed: policy,
      reconciliation,
      customerPayload: {
        band: {
          low: measured.low,
          high: measured.high,
          currency: "USD",
          basis: "measured",
        },
        typologyBand: { low: typology.band.low, high: typology.band.high },
        jobType: measured.jobType,
        context: project.marketContext,
        scope: measured.scope,
        measurement: {
          measuredRegions: measured.measuredRegionIds.length,
          unmeasuredRegions: measured.unmeasuredRegionIds.length,
          totalAreaSf: measured.totalMeasuredAreaSf,
        },
        reconciliation: reconciliation
          ? {
              outcome: reconciliation.outcome,
              flagged: reconciliation.flagged,
              comparedRegions: reconciliation.comparedRegionIds.length,
              flaggedRegions: reconciliation.regions
                .filter((r) => r.verdict === "disagreement")
                .map((r) => ({ id: r.photoRegionId, label: r.label })),
              verticalElements: reconciliation.verticalElements.map((v) => ({
                kind: v.kind,
                description: v.description,
              })),
            }
          : null,
      },
    };
  }

  // Typology basis: the customer sees the percentile band, and the internal
  // estimate runs the engine on the actual selections at typology-P50
  // quantities (source 'typology', low confidence — honest provenance for
  // the rep who will measure on site).
  const input = designEngineInput(
    project.selections,
    {},
    project.marketContext,
    config,
    now(),
  );
  const estimate =
    input.engineSelections.length > 0
      ? buildEstimate(input.engineSelections, config.priceBook, config.margin)
      : null;

  return {
    basis: "typology",
    jobType: typology.jobType,
    estimate,
    policyUsed: policy,
    reconciliation,
    customerPayload: {
      band: {
        low: typology.band.low,
        high: typology.band.high,
        typical: typology.band.typical,
        currency: "USD",
        basis: "typology",
      },
      jobType: typology.jobType,
      context: project.marketContext,
      scope: typology.scope,
    },
  };
}
