import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ConfirmQuantities,
  IssueFinalQuote,
  type ConfirmRow,
} from "@/components/leads/ConfirmQuantities";
import { LeadPhoto } from "@/components/leads/LeadPhoto";
import {
  ConfidenceMeter,
  ProvenanceBadge,
  VerdictBadge,
} from "@/components/leads/badges";
import { errorPct } from "@/lib/confirm/deltas";
import { currentRegionQuantities } from "@/lib/confirm/quantities";
import { customerBand, isFinalQuotePayload } from "@/lib/design/quote";
import type { DesignProject } from "@/lib/design/types";
import {
  finalQuoteSnapshot,
  submittedSnapshot,
  type SnapshotCustomerView,
} from "@/lib/lead/snapshot";
import { currentContractor } from "@/lib/auth/session";
import { resolveOrg } from "@/lib/org/resolve";
import { ProjectNotFoundError, getProject } from "@/lib/store/projects";

/** A lead moves through the gate while the page is open — never cache it. */
export const dynamic = "force-dynamic";

const JOB_TYPE_LABELS: Record<string, string> = {
  mulch_to_stone: "Mulch-to-stone conversion",
  bed_renovation: "Bed renovation",
  foundation_planting_refresh: "Foundation planting refresh",
};

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const usd2 = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {title}
        </h2>
        {badge}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The lead review view — a CONTRACTOR surface, so the internal side of the
 * frozen snapshot renders here: line items with provenance-carrying
 * quantities, direct costs, effective unit rates, and margin. The
 * "what the customer saw" panel is parsed from the frozen bytes and shown
 * as submitted, never recomputed.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let project: DesignProject;
  try {
    project = await getProject(id);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  }
  // Always the SUBMITTED snapshot: a final quote appends a newer record,
  // and this panel means "what the customer saw", which never changes.
  const snapshot = submittedSnapshot(project);
  if (!snapshot || project.status === "playing") notFound();

  const view = JSON.parse(snapshot.customerFacingPayload) as SnapshotCustomerView;
  const band = customerBand(view.estimate);
  const scope = view.estimate.scope;

  // Phase 6 — the confirmation gate.
  const deltas = project.deltas ?? [];
  const finalQuote = finalQuoteSnapshot(project);
  const finalView = finalQuote
    ? (JSON.parse(finalQuote.customerFacingPayload) as SnapshotCustomerView)
    : null;
  const finalPayload =
    finalView && isFinalQuotePayload(finalView.estimate) ? finalView.estimate : null;
  // The layout already refused anyone without a session; this is the same
  // contractor, read again because the page needs their name.
  const contractor = (await currentContractor())!;
  const org = await resolveOrg();
  const confirmRows: ConfirmRow[] = currentRegionQuantities(
    project,
    org.typology,
  ).map((q) => ({
    regionId: q.regionId,
    label: q.label,
    areaSf: {
      value: q.areaSf.value,
      source: q.areaSf.source,
      confidence: q.areaSf.confidence,
    },
    perimeterLf: {
      value: q.perimeterLf.value,
      source: q.perimeterLf.source,
      confidence: q.perimeterLf.confidence,
    },
  }));

  const regions =
    project.segmentation.status === "ready" ? project.segmentation.regions : [];
  const reconciliation = snapshot.reconciliation;
  const reconByRegionId = new Map(
    (reconciliation?.regions ?? []).map((r) => [r.photoRegionId, r]),
  );
  const directCost = snapshot.lineItems.reduce((sum, li) => sum + li.directCost, 0);
  const gmPct =
    snapshot.internalTotal > 0
      ? ((snapshot.internalTotal - directCost) / snapshot.internalTotal) * 100
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href="/dashboard" className="text-xs text-neutral-400 hover:text-neutral-600">
            ← Lead inbox
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {project.contact?.name ?? "Unknown customer"}
          </h1>
          <p className="text-sm text-neutral-500">
            {project.contact?.email}
            {project.contact?.phone ? ` · ${project.contact.phone}` : null}
            {project.submittedAt
              ? ` · submitted ${new Date(project.submittedAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-neutral-200 px-2.5 py-1 font-medium text-neutral-700">
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
          {reconciliation?.flagged && (
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">
              Photo/aerial mismatch
            </span>
          )}
        </div>
      </div>

      {project.contact?.notes && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          Customer note: “{project.contact.notes}”
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <div className="space-y-5">
          <Section title="The design">
            <LeadPhoto
              photoUrl={`/api/projects/${project.id}/photo`}
              regions={regions}
              selections={project.selections}
            />
            <p className="mt-2 text-xs text-neutral-400">
              {project.location?.address
                ? `Address: ${project.location.address}`
                : project.addressDeclined
                  ? "Customer declined to share an address — quantities are typology-based until the site visit."
                  : "No address on file."}
            </p>
          </Section>

          <Section title="Quantities & provenance">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
                    <th className="py-2 pr-3 font-medium">Line item</th>
                    <th className="py-2 pr-3 font-medium">Qty</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Confidence</th>
                    <th className="py-2 text-right font-medium">Direct cost</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.lineItems.map((li, i) => (
                    <tr key={`${li.assemblyId}-${i}`} className="border-b border-neutral-100">
                      <td className="py-2 pr-3 text-neutral-800">{li.description}</td>
                      <td className="py-2 pr-3 tabular-nums text-neutral-700">
                        {qty(li.quantity.value)} {li.quantity.unit}
                      </td>
                      <td className="py-2 pr-3">
                        <ProvenanceBadge source={li.quantity.source} />
                      </td>
                      <td className="py-2 pr-3">
                        <ConfidenceMeter value={li.quantity.confidence} />
                      </td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">
                        {usd2(li.directCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Photo ↔ aerial reconciliation"
            badge={
              reconciliation ? (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    reconciliation.outcome === "review"
                      ? "bg-red-100 text-red-800"
                      : reconciliation.outcome === "tighten"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {reconciliation.outcome === "review"
                    ? "Flagged for review"
                    : reconciliation.outcome === "tighten"
                      ? "Sensors corroborate"
                      : "Hold"}
                </span>
              ) : undefined
            }
          >
            {reconciliation ? (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
                        <th className="py-2 pr-3 font-medium">Region</th>
                        <th className="py-2 pr-3 font-medium">Aerial</th>
                        <th className="py-2 pr-3 font-medium">Photo est.</th>
                        <th className="py-2 pr-3 font-medium">Δ</th>
                        <th className="py-2 pr-3 font-medium">Verdict</th>
                        <th className="py-2 font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliation.regions.map((r) => (
                        <tr key={r.photoRegionId} className="border-b border-neutral-100">
                          <td className="py-2 pr-3 text-neutral-800">
                            {r.label}
                            {r.existingMaterial && (
                              <span className="block text-xs text-neutral-400">
                                now: {r.existingMaterial}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-neutral-700">
                            {qty(r.areaSf.value)} SF
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-neutral-500">
                            {r.photoAreaSf ? `${qty(r.photoAreaSf.value)} SF` : "—"}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-neutral-500">
                            {r.deltaPct !== null ? `${r.deltaPct}%` : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <VerdictBadge verdict={r.verdict} />
                          </td>
                          <td className="py-2">
                            <ConfidenceMeter value={r.areaSf.confidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {reconciliation.verticalElements.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    <span className="font-medium text-neutral-700">
                      Vertical elements (photo only, confirm on site):
                    </span>{" "}
                    {reconciliation.verticalElements.map((v) => v.description).join("; ")}
                  </p>
                )}
                {reconciliation.cannotSee.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    <span className="font-medium text-neutral-700">
                      Photo could not determine:
                    </span>{" "}
                    {reconciliation.cannotSee.join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                Only one sensor reported before submit
                {project.addressDeclined
                  ? " (no address, so no aerial measurements)"
                  : ""}
                — nothing to arbitrate. Region confidence below comes from the
                photo segmentation alone.
              </p>
            )}
            {/* Per-region confidence, whatever the sensor mix. */}
            {regions.length > 0 && (
              <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                {regions.map((r) => {
                  const recon = reconByRegionId.get(r.id);
                  const aerial = (project.aerialRegions ?? []).find(
                    (a) => a.photoRegionId === r.id,
                  );
                  const confidence =
                    recon?.areaSf.confidence ??
                    aerial?.areaSf.confidence ??
                    r.confidence;
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600"
                    >
                      <span className="truncate">{r.label}</span>
                      <ConfidenceMeter value={confidence} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section
            title="Site visit — confirm quantities"
            badge={
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  project.status === "quoted"
                    ? "bg-emerald-100 text-emerald-800"
                    : project.status === "confirmed"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {project.status === "quoted"
                  ? "Quoted"
                  : project.status === "confirmed"
                    ? `${deltas.length} correction${deltas.length === 1 ? "" : "s"} on record`
                    : "Awaiting site visit"}
              </span>
            }
          >
            <ConfirmQuantities
              projectId={project.id}
              rows={confirmRows}
              locked={project.status === "quoted"}
              confirmedBy={contractor.name || contractor.email}
            />
            <div className="mt-5 border-t border-neutral-100 pt-4">
              {finalQuote ? (
                <p className="text-sm text-neutral-600">
                  Final quote issued{" "}
                  {new Date(finalQuote.issuedAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {" — "}
                  {usd(finalPayload?.quote.price ?? finalQuote.internalTotal)}.
                </p>
              ) : (
                <IssueFinalQuote
                  projectId={project.id}
                  disabled={deltas.length === 0}
                  reason={
                    deltas.length === 0
                      ? "Record at least one on-site correction first — a final quote with nothing confirmed is the customer's estimate wearing a firmer number."
                      : "Prices the job from the confirmed quantities and freezes it as a new snapshot. The customer's original stays exactly as submitted."
                  }
                />
              )}
            </div>
          </Section>

          {deltas.length > 0 && (
            <Section
              title="Measurement deltas"
              badge={
                <Link
                  href="/deltas"
                  className="rounded-full bg-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-300"
                >
                  Fleet-wide error →
                </Link>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
                      <th className="py-2 pr-3 font-medium">Region</th>
                      <th className="py-2 pr-3 font-medium">Estimated</th>
                      <th className="py-2 pr-3 font-medium">Confirmed</th>
                      <th className="py-2 pr-3 font-medium">Error</th>
                      <th className="py-2 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deltas.map((delta) => {
                      const error = errorPct(delta);
                      return (
                        <tr key={delta.id} className="border-b border-neutral-100">
                          <td className="py-2 pr-3 text-neutral-800">
                            {delta.regionLabel}
                            {delta.note && (
                              <span className="block text-xs text-neutral-400">
                                {delta.note}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-neutral-500">
                            {qty(delta.beforeQty.value)} {delta.unit}
                            <span className="ml-1.5 align-middle">
                              <ProvenanceBadge source={delta.beforeQty.source} />
                            </span>
                          </td>
                          <td className="py-2 pr-3 tabular-nums font-medium text-neutral-900">
                            {qty(delta.afterQty.value)} {delta.unit}
                          </td>
                          <td
                            className={`py-2 pr-3 tabular-nums ${
                              Math.abs(error) >= 25
                                ? "text-red-700"
                                : Math.abs(error) >= 10
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                            }`}
                          >
                            {error > 0 ? "+" : ""}
                            {error.toFixed(1)}%
                          </td>
                          <td className="py-2 text-xs text-neutral-500">
                            {delta.correctedBy}
                            <span className="block text-neutral-400">
                              {new Date(delta.correctedAt).toLocaleDateString("en-US", {
                                dateStyle: "medium",
                              })}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Error is the superseded estimate against the confirmed truth —
                positive means we estimated high. Each row supersedes a
                quantity; none of them overwrote one.
              </p>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <Section
            title="What the customer saw"
            badge={
              <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                Frozen at submit
              </span>
            }
          >
            <p className="text-2xl font-semibold tracking-tight text-neutral-900">
              {band ? `${usd(band.low)} – ${usd(band.high)}` : "—"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {snapshot.basis === "measured"
                ? "Measured band"
                : "Typology band (nothing measured)"}
              {" · issued "}
              {new Date(snapshot.issuedAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            {scope.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {scope.map((item) => (
                  <li
                    key={item}
                    className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-neutral-400">
              Snapshot {snapshot.id.slice(0, 8)} — immutable. The rep&apos;s
              corrections below create new records; these bytes never change.
            </p>
          </Section>

          {finalPayload && finalQuote && (
            <Section
              title="Final quote"
              badge={
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                  Rep confirmed
                </span>
              }
            >
              <p className="text-2xl font-semibold tracking-tight text-neutral-900">
                {usd(finalPayload.quote.price)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {finalPayload.supersededBand
                  ? `Supersedes the ${usd(finalPayload.supersededBand.low)} – ${usd(
                      finalPayload.supersededBand.high,
                    )} band the customer was shown.`
                  : "No prior band on record."}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                {finalPayload.confirmation.confirmedRegions} region
                {finalPayload.confirmation.confirmedRegions === 1 ? "" : "s"}{" "}
                confirmed ({qty(finalPayload.confirmation.confirmedAreaSf)} SF) by{" "}
                {finalPayload.confirmation.confirmedBy}.
              </p>
              <p className="mt-3 border-t border-neutral-100 pt-3 text-[11px] text-neutral-400">
                Snapshot {finalQuote.id.slice(0, 8)} · a figure, not a band:
                the uncertainty the band expressed was measured away on site.
                Internal total {usd2(finalQuote.internalTotal)}.
              </p>
            </Section>
          )}

          <Section
            title="Internal estimate"
            badge={
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                Never shown to customer
              </span>
            }
          >
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Direct cost</dt>
                <dd className="tabular-nums text-neutral-800">{usd2(directCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Sell price</dt>
                <dd className="tabular-nums font-semibold text-neutral-900">
                  {usd2(snapshot.internalTotal)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Effective GM (incl. contingency)</dt>
                <dd className="tabular-nums text-neutral-800">{gmPct.toFixed(1)}%</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
              Disclosure policy used: {snapshot.disclosurePolicyUsed.mode}, ±
              {snapshot.disclosurePolicyUsed.bandWidthPct.toFixed(1)}%, rounded to $
              {snapshot.disclosurePolicyUsed.roundTo}.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
