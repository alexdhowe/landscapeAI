import Link from "next/link";

import { ProvenanceBadge } from "@/components/leads/badges";
import { analyzeDeltas, type ErrorStats } from "@/lib/confirm/analytics";
import type { MeasurementDelta } from "@/lib/confirm/types";
import type { QuantitySource } from "@/lib/pricing/types";
import { listMeasurementDeltas } from "@/lib/store/projects";

/** Deltas live in the file store — always render from the current state. */
export const dynamic = "force-dynamic";

const JOB_TYPE_LABELS: Record<string, string> = {
  mulch_to_stone: "Mulch-to-stone conversion",
  bed_renovation: "Bed renovation",
  foundation_planting_refresh: "Foundation planting refresh",
};

const pct = (n: number) => `${n.toFixed(1)}%`;
const signedPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

function errorTone(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 25) return "text-red-700";
  if (abs >= 10) return "text-amber-700";
  return "text-emerald-700";
}

/** Mean/P90 for one cut of the corpus, with the sample size next to it. */
function StatsRow({ label, stats }: { label: React.ReactNode; stats: ErrorStats }) {
  return (
    <tr className="border-b border-neutral-100">
      <td className="py-2 pr-3 text-neutral-800">{label}</td>
      <td className="py-2 pr-3 tabular-nums text-neutral-500">{stats.count}</td>
      <td className={`py-2 pr-3 tabular-nums ${errorTone(stats.meanErrorPct)}`}>
        {signedPct(stats.meanErrorPct)}
      </td>
      <td className={`py-2 pr-3 tabular-nums ${errorTone(stats.meanAbsErrorPct)}`}>
        {pct(stats.meanAbsErrorPct)}
      </td>
      <td className={`py-2 pr-3 tabular-nums ${errorTone(stats.p90AbsErrorPct)}`}>
        {pct(stats.p90AbsErrorPct)}
      </td>
      <td className="py-2 tabular-nums text-neutral-500">{pct(stats.maxAbsErrorPct)}</td>
    </tr>
  );
}

function StatsTable({
  caption,
  rows,
}: {
  caption: string;
  rows: { key: string; label: React.ReactNode; stats: ErrorStats }[];
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {caption}
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
              <th className="py-2 pr-3 font-medium">Cut</th>
              <th className="py-2 pr-3 font-medium">n</th>
              <th className="py-2 pr-3 font-medium">Bias (mean)</th>
              <th className="py-2 pr-3 font-medium">Mean abs.</th>
              <th className="py-2 pr-3 font-medium">P90 abs.</th>
              <th className="py-2 font-medium">Worst</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-sm text-neutral-400">
                  No deltas in this cut yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <StatsRow key={row.key} label={row.label} stats={row.stats} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Estimation error across every site visit — the corpus query.
 *
 * project-map §6 calls this the whole business, and the framing here says
 * why: each row is a paid site visit that measured exactly how wrong the
 * remote estimate was. Bias says whether the estimator leans; P90 says how
 * wide a band has to be before it stops being wrong in front of a
 * customer; the by-source cut says whether the aerial leg earns its COGS
 * against a typology guess.
 *
 * A CONTRACTOR surface. Nothing on it is derived from a customer-facing
 * payload — it reads quantities, not prices.
 */
export default async function DeltasPage() {
  const deltas: MeasurementDelta[] = await listMeasurementDeltas();
  const analytics = analyzeDeltas(deltas);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Estimation error
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          {deltas.length === 0
            ? "No measurement deltas yet. They accumulate every time a rep corrects a quantity on site — one row per correction, forever."
            : `${deltas.length} correction${deltas.length === 1 ? "" : "s"} across ${
                new Set(deltas.map((d) => d.projectId)).size
              } job${new Set(deltas.map((d) => d.projectId)).size === 1 ? "" : "s"}. Bias is signed (positive = we estimate high); the absolute columns are magnitude. P90 is the number that should set band width.`}
        </p>
      </div>

      {deltas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Bias", value: signedPct(analytics.overall.meanErrorPct) },
            { label: "Mean absolute error", value: pct(analytics.overall.meanAbsErrorPct) },
            { label: "P90 absolute error", value: pct(analytics.overall.p90AbsErrorPct) },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <StatsTable
        caption="By job type"
        rows={Object.entries(analytics.byJobType).map(([jobType, stats]) => ({
          key: jobType,
          label: JOB_TYPE_LABELS[jobType] ?? jobType,
          stats: stats!,
        }))}
      />

      <StatsTable
        caption="By provenance of the corrected estimate"
        rows={Object.entries(analytics.bySource).map(([source, stats]) => ({
          key: source,
          label: <ProvenanceBadge source={source as QuantitySource} />,
          stats: stats!,
        }))}
      />

      <StatsTable
        caption="By dimension"
        rows={Object.entries(analytics.byUnit).map(([unit, stats]) => ({
          key: unit,
          label: unit === "SF" ? "Area (SF)" : "Edge run (LF)",
          stats: stats!,
        }))}
      />

      {analytics.worst.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Biggest misses
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
                  <th className="py-2 pr-3 font-medium">Region</th>
                  <th className="py-2 pr-3 font-medium">Job type</th>
                  <th className="py-2 pr-3 font-medium">Estimated</th>
                  <th className="py-2 pr-3 font-medium">Confirmed</th>
                  <th className="py-2 pr-3 font-medium">Error</th>
                  <th className="py-2 font-medium">Lead</th>
                </tr>
              </thead>
              <tbody>
                {analytics.worst.map(({ delta, errorPct }) => (
                  <tr key={delta.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 text-neutral-800">{delta.regionLabel}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">
                      {JOB_TYPE_LABELS[delta.jobType] ?? delta.jobType}
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
                    <td className={`py-2 pr-3 tabular-nums ${errorTone(errorPct)}`}>
                      {signedPct(errorPct)}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/leads/${delta.projectId}`}
                        className="text-xs text-neutral-500 underline hover:text-neutral-800"
                      >
                        open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
