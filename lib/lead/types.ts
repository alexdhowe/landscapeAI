/**
 * Phase 5 — lead capture types.
 *
 * When a customer submits, what they saw is frozen into an EstimateSnapshot
 * (architectural invariant: estimates are immutable snapshots). The snapshot
 * carries BOTH sides of the disclosure boundary:
 *
 *   - customerFacingPayload: the exact bytes the customer saw, stored as the
 *     serialized string so byte-identity survives every re-serialization of
 *     the surrounding project JSON. Serve it verbatim; never re-stringify.
 *   - lineItems / internalTotal / disclosurePolicyUsed / reconciliation:
 *     the internal estimate behind those bytes. Contractor surfaces only —
 *     never rendered to, or serialized for, a customer.
 */
import type { ReconciliationReport } from "../measure/reconcile";
import type { DisclosurePolicy, LineItem } from "../pricing/types";
import type { JobType } from "../pricing/typology";

export type LeadContact = {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
};

export type EstimateSnapshot = {
  id: string;
  projectId: string;
  issuedAt: string;
  /**
   * Which side of the confirmation gate this record sits on.
   *
   *   customer_submitted  what the customer saw and sent (Phase 5)
   *   rep_confirmed       the final quote, priced from the rep's on-site
   *                       measurements (Phase 6)
   *
   * Both live in the same append-only list, and neither ever edits the
   * other: a final quote is a NEW record, which is the entire point of the
   * gate. Absent on snapshots written before Phase 6 — read those as
   * customer_submitted.
   */
  kind?: "customer_submitted" | "rep_confirmed";
  /** What the frozen customer band was derived from. */
  basis: "typology" | "measured" | "rep_confirmed";
  jobType: JobType;
  /** Frozen internal line items, provenance-carrying quantities included. INTERNAL. */
  lineItems: LineItem[];
  /** The engine's sell price at freeze time. INTERNAL. */
  internalTotal: number;
  /** The exact serialized payload the customer saw at submit time. */
  customerFacingPayload: string;
  disclosurePolicyUsed: DisclosurePolicy;
  /** Frozen photo/aerial arbitration; null when only one sensor had reported. INTERNAL. */
  reconciliation: ReconciliationReport | null;
  /**
   * The price book revision this was priced from.
   *
   * The line items are already frozen, so this is not how the numbers are
   * recovered — it is how they are EXPLAINED. A measurement delta saying an
   * estimate missed by 15% is only interpretable against the prices that
   * produced it. Absent on snapshots frozen before revisions existed, and
   * when the app is running on the seed file with no database.
   */
  priceBookRevisionId?: string;
  priceBookRevision?: number;
};
