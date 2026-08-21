/**
 * The final quote — the estimate priced from what the rep actually
 * measured.
 *
 * It differs from the customer's estimate in two ways, and both are
 * deliberate:
 *
 *   - Quantities are rep-confirmed where the rep confirmed them, and carry
 *     their real provenance where they were not.
 *   - The disclosure is a FIGURE, not a band. A band is a statement about
 *     uncertainty; once a person has stood on the site with a tape, the
 *     uncertainty the band expressed is gone, and quoting a range would be
 *     hedging rather than honesty.
 *
 * What it does NOT do is touch the customer's snapshot. This returns a new
 * ProjectQuote; freezing it appends a new record beside the original,
 * which stays exactly as submitted. That separation is the confirmation
 * gate.
 *
 * Pure — project state, config, and policy come in as arguments.
 */
import { inferJobType } from "../design/band";
import { designEngineInput } from "../design/measured";
import type { FinalQuotePayload, ProjectQuote } from "../design/quote";
import type { DesignProject } from "../design/types";
import { applyDisclosure } from "../pricing/disclosure";
import { buildEstimate } from "../pricing/engine";
import type { DisclosurePolicy } from "../pricing/types";
import type { TypologyConfig } from "../pricing/typology";
import { currentRegionQuantities, quoteMeasurements } from "./quantities";

export class NotConfirmedError extends Error {
  constructor() {
    super("No quantities have been confirmed on site yet");
    this.name = "NotConfirmedError";
  }
}

export class NoQuoteableDesignError extends Error {
  constructor() {
    super("The design has no priceable selections to quote");
    this.name = "NoQuoteableDesignError";
  }
}

export type FinalQuoteOptions = {
  /** The band being superseded, from the customer's submitted snapshot. */
  supersededBand?: { low: number; high: number } | null;
  now?: () => string;
};

/**
 * Price the project from its current confirmed quantities.
 *
 * Requires at least one recorded correction: a "final quote" with nothing
 * confirmed would be the customer's estimate wearing a firmer number, and
 * that is precisely the claim the gate exists to prevent.
 */
export function confirmedQuote(
  project: DesignProject,
  config: TypologyConfig,
  policy: DisclosurePolicy,
  options: FinalQuoteOptions = {},
): ProjectQuote {
  const deltas = project.deltas ?? [];
  if (deltas.length === 0) throw new NotConfirmedError();

  const jobType = inferJobType(project.selections);
  if (!jobType) throw new NoQuoteableDesignError();

  const now = options.now ?? (() => new Date().toISOString());
  const quantities = currentRegionQuantities(project, config, now);
  const measurements = quoteMeasurements(quantities);

  const input = designEngineInput(
    project.selections,
    measurements,
    project.marketContext,
    config,
    now(),
  );
  if (input.engineSelections.length === 0) throw new NoQuoteableDesignError();

  const estimate = buildEstimate(input.engineSelections, config.priceBook, config.margin);
  const payload = applyDisclosure(estimate, policy);
  if (payload.mode !== "figure") {
    throw new Error("The final quote requires a figure-mode disclosure policy");
  }

  const confirmed = quantities.filter((q) => q.areaSf.source === "rep_confirmed");
  const lastDelta = deltas[deltas.length - 1];

  const customerPayload: FinalQuotePayload = {
    quote: { price: payload.price, currency: "USD", basis: "rep_confirmed" },
    supersededBand: options.supersededBand ?? null,
    jobType,
    context: project.marketContext,
    scope: input.scope,
    confirmation: {
      confirmedRegions: confirmed.length,
      confirmedAreaSf: Math.round(
        confirmed.reduce((sum, q) => sum + q.areaSf.value, 0),
      ),
      confirmedBy: lastDelta.correctedBy,
      confirmedAt: lastDelta.correctedAt,
    },
  };

  return {
    basis: "rep_confirmed",
    jobType,
    estimate,
    policyUsed: policy,
    // Photo/aerial arbitration answered "which sensor do we believe". A
    // person measured it; the question is closed. The submitted snapshot
    // keeps the report for the record.
    reconciliation: null,
    customerPayload,
  };
}
