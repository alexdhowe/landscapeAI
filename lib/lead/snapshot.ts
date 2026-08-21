/**
 * Freezing a quote into an immutable EstimateSnapshot.
 *
 * The customer-facing side is serialized ONCE, here, and stored as that
 * exact string. Every surface that shows the customer their submitted
 * estimate serves the stored string verbatim — so "the snapshot is
 * byte-identical to what the customer saw" holds by construction, not by
 * discipline.
 *
 * Pure aside from randomUUID; no I/O.
 */
import { randomUUID } from "node:crypto";

import type { ProjectQuote } from "../design/quote";
import type { DesignProject } from "../design/types";
import type { EstimateSnapshot } from "./types";

/**
 * Key names that only ever occur on the internal side of the disclosure
 * boundary. None of them may appear anywhere in customer-facing bytes.
 */
export const INTERNAL_ONLY_MARKERS = [
  "unitCost",
  "extendedCost",
  "directCost",
  "totalCost",
  "contingency",
  "costItemId",
  "costByKind",
  "burdenPct",
  "wasteFactorPct",
  "appliedGmPct",
  "grossMargin",
  "sellPrice",
  "internalTotal",
] as const;

/** Tripwire: refuse to mint a customer payload that leaks internal pricing. */
export function assertNoInternalLeak(customerBytes: string): void {
  for (const marker of INTERNAL_ONLY_MARKERS) {
    if (customerBytes.includes(marker)) {
      throw new Error(
        `Internal pricing marker "${marker}" found in a customer-facing payload — refusing to freeze it`,
      );
    }
  }
}

/** The document the customer sees at (and after) submit — parsed from the frozen bytes. */
export type SnapshotCustomerView = {
  kind: "estimate_snapshot";
  snapshotId: string;
  projectId: string;
  issuedAt: string;
  /** The customer band exactly as the price rail showed it. */
  estimate: ProjectQuote["customerPayload"];
};

export class QuoteNotFreezableError extends Error {
  constructor() {
    super("The quote has no priceable estimate to freeze");
    this.name = "QuoteNotFreezableError";
  }
}

export function freezeSnapshot(
  project: DesignProject,
  quote: ProjectQuote,
  options?: { id?: string; now?: () => string },
): EstimateSnapshot {
  if (!quote.estimate) {
    throw new QuoteNotFreezableError();
  }

  const id = options?.id ?? randomUUID();
  const issuedAt = (options?.now ?? (() => new Date().toISOString()))();

  const customerView: SnapshotCustomerView = {
    kind: "estimate_snapshot",
    snapshotId: id,
    projectId: project.id,
    issuedAt,
    estimate: quote.customerPayload,
  };
  const customerFacingPayload = JSON.stringify(customerView);
  assertNoInternalLeak(customerFacingPayload);

  return {
    id,
    projectId: project.id,
    issuedAt,
    basis: quote.basis,
    jobType: quote.jobType,
    lineItems: quote.estimate.lineItems,
    internalTotal: quote.estimate.sellPrice,
    customerFacingPayload,
    disclosurePolicyUsed: quote.policyUsed,
    reconciliation: quote.reconciliation,
  };
}

/** The customer's most recent snapshot, or null before any submit. */
export function latestSnapshot(project: DesignProject): EstimateSnapshot | null {
  const snapshots = project.snapshots ?? [];
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}
