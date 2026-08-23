import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { isFinalQuotePayload } from "@/lib/design/quote";
import {
  finalQuoteSnapshot,
  submittedSnapshot,
  type SnapshotCustomerView,
} from "@/lib/lead/snapshot";
import { listLeads } from "@/lib/store/projects";

/** The inbox changes with every submit — always render current state. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lead inbox" };

const JOB_TYPE_LABELS: Record<string, string> = {
  mulch_to_stone: "Mulch → stone",
  bed_renovation: "Bed renovation",
  foundation_planting_refresh: "Foundation refresh",
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * The contractor lead inbox. Internal surface: shows the internal total
 * next to what the customer was quoted, plus reconciliation flags and the
 * no-address marker.
 */
export default async function DashboardPage() {
  const leads = await listLeads();

  return (
    <div>
      <h1 className="display text-2xl text-bark-900">Lead inbox</h1>
      <p className="mt-1 text-sm text-bark-600">
        {leads.length === 0
          ? "Leads appear here the moment a customer submits a design."
          : `${leads.length} submitted lead${leads.length === 1 ? "" : "s"}, newest first.`}
      </p>

      {leads.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No leads yet"
            action={
              <ButtonLink href="/start" tone="secondary" size="sm">
                Walk the customer flow yourself
              </ButtonLink>
            }
          >
            A lead lands here when someone finishes a design at{" "}
            <code className="font-mono text-xs">/start</code> and sends it. The
            snapshot they saw is frozen at that moment and never rewritten.
          </EmptyState>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {leads.map((lead) => {
          // The submitted snapshot, always — the inbox reports what the
          // customer was told, and a rep's final quote sits beside it
          // rather than replacing it.
          const snapshot = submittedSnapshot(lead);
          if (!snapshot) return null;
          const view = JSON.parse(snapshot.customerFacingPayload) as SnapshotCustomerView;
          const band = isFinalQuotePayload(view.estimate) ? null : view.estimate.band;
          const finalQuote = finalQuoteSnapshot(lead);
          const finalView = finalQuote
            ? (JSON.parse(finalQuote.customerFacingPayload) as SnapshotCustomerView)
            : null;
          const finalPrice =
            finalView && isFinalQuotePayload(finalView.estimate)
              ? finalView.estimate.quote.price
              : null;
          const deltaCount = (lead.deltas ?? []).length;
          return (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="block rounded-xl border border-bark-200 bg-white p-4 shadow-e1 transition-shadow hover:border-bark-300 hover:shadow-e3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-medium text-bark-900">
                      {lead.contact?.name ?? "Unknown"}
                    </span>
                    <span className="ml-2 text-sm text-bark-500">
                      {lead.contact?.email}
                    </span>
                  </div>
                  <span className="text-xs text-bark-600">
                    {lead.submittedAt
                      ? new Date(lead.submittedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : null}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Badge>{JOB_TYPE_LABELS[snapshot.jobType] ?? snapshot.jobType}</Badge>
                  <Badge tone={snapshot.basis === "measured" ? "survey" : "neutral"}>
                    {snapshot.basis === "measured" ? "Measured" : "Typology band"}
                  </Badge>
                  {lead.status !== "submitted" && (
                    <Badge tone={lead.status === "quoted" ? "canopy" : "survey"}>
                      {lead.status === "quoted"
                        ? "Quoted"
                        : `Site-confirmed · ${deltaCount} delta${deltaCount === 1 ? "" : "s"}`}
                    </Badge>
                  )}
                  {lead.addressDeclined && <Badge>No address shared</Badge>}
                  {snapshot.reconciliation?.flagged && (
                    <Badge tone="clay">Photo/aerial mismatch — review</Badge>
                  )}
                </div>

                <div className="tnum mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                  <span className="text-bark-700">
                    Customer saw{" "}
                    <strong className="text-bark-900">
                      {band ? `${usd(band.low)} – ${usd(band.high)}` : "—"}
                    </strong>
                  </span>
                  {finalPrice !== null && (
                    <span className="text-canopy-800">
                      Final quote: <strong>{usd(finalPrice)}</strong>
                    </span>
                  )}
                  <span className="text-bark-600">
                    Internal: {usd(snapshot.internalTotal)}
                  </span>
                  {lead.location?.address && (
                    <span className="truncate text-xs text-bark-500">
                      {lead.location.address}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
