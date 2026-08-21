import Link from "next/link";

import { isFinalQuotePayload } from "@/lib/design/quote";
import {
  finalQuoteSnapshot,
  submittedSnapshot,
  type SnapshotCustomerView,
} from "@/lib/lead/snapshot";
import { listLeads } from "@/lib/store/projects";

/** Leads live in the file store — always render from the current state. */
export const dynamic = "force-dynamic";

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
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        Lead inbox
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {leads.length === 0
          ? "No leads yet — they appear here the moment a customer submits a design."
          : `${leads.length} submitted lead${leads.length === 1 ? "" : "s"}, newest first.`}
      </p>

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
                className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-medium text-neutral-900">
                      {lead.contact?.name ?? "Unknown"}
                    </span>
                    <span className="ml-2 text-sm text-neutral-500">
                      {lead.contact?.email}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-400">
                    {lead.submittedAt
                      ? new Date(lead.submittedAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : null}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700">
                    {JOB_TYPE_LABELS[snapshot.jobType] ?? snapshot.jobType}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 font-medium ${
                      snapshot.basis === "measured"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {snapshot.basis === "measured" ? "Measured" : "Typology band"}
                  </span>
                  {lead.status !== "submitted" && (
                    <span
                      className={`rounded-full px-2.5 py-1 font-medium ${
                        lead.status === "quoted"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {lead.status === "quoted"
                        ? "Quoted"
                        : `Site-confirmed · ${deltaCount} delta${deltaCount === 1 ? "" : "s"}`}
                    </span>
                  )}
                  {lead.addressDeclined && (
                    <span className="rounded-full bg-neutral-200 px-2.5 py-1 font-medium text-neutral-600">
                      No address shared
                    </span>
                  )}
                  {snapshot.reconciliation?.flagged && (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">
                      Photo/aerial mismatch — review
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                  <span className="text-neutral-700">
                    Customer saw{" "}
                    <strong>
                      {band ? `${usd(band.low)} – ${usd(band.high)}` : "—"}
                    </strong>
                  </span>
                  {finalPrice !== null && (
                    <span className="text-emerald-700">
                      Final quote: <strong>{usd(finalPrice)}</strong>
                    </span>
                  )}
                  <span className="text-neutral-500">
                    Internal: {usd(snapshot.internalTotal)}
                  </span>
                  {lead.location?.address && (
                    <span className="truncate text-xs text-neutral-400">
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
