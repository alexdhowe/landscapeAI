"use client";

import Link from "next/link";

import type { MarketContext } from "@/lib/pricing/typology";

import { BandMeter } from "./BandMeter";

export type BandPayload = {
  band: {
    low: number;
    high: number;
    typical?: number;
    currency: "USD";
    basis: "typology" | "measured";
  } | null;
  /** Present when basis is "measured": the range before measuring. */
  typologyBand?: { low: number; high: number };
  jobType?: string;
  context?: MarketContext;
  scope?: string[];
  measurement?: {
    measuredRegions: number;
    unmeasuredRegions: number;
    totalAreaSf: number;
  };
  /** Phase 4: photo/aerial arbitration summary. Present when both sensors reported. */
  reconciliation?: {
    outcome: "tighten" | "hold" | "review";
    flagged: boolean;
    comparedRegions: number;
    flaggedRegions: { id: string; label: string }[];
    verticalElements: { kind: string; description: string }[];
  } | null;
};

const JOB_TYPE_LABELS: Record<string, string> = {
  mulch_to_stone: "Mulch-to-stone conversion",
  bed_renovation: "Bed renovation",
  foundation_planting_refresh: "Foundation planting refresh",
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The budget band. Basis "typology" until the aerial pass has measured a
 * designed region, then basis "measured" — shown with the old range so the
 * narrowing is a visible beat, not a silent update. Never renders line
 * items, unit rates, or anything internal.
 */
export function PriceRail({
  payload,
  context,
  busy,
  onContextChange,
  projectId,
  addressDeclined,
}: {
  payload: BandPayload | null;
  context: MarketContext;
  busy: boolean;
  onContextChange: (context: MarketContext) => void;
  projectId: string;
  addressDeclined?: boolean;
}) {
  const band = payload?.band ?? null;
  const measured = band?.basis === "measured";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Budget band
        </p>
        <div className="flex rounded-full border border-neutral-200 p-0.5 text-xs">
          {(
            [
              ["residential", "Home"],
              ["hoa_commercial", "HOA"],
            ] as [MarketContext, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              onClick={() => onContextChange(value)}
              className={`rounded-full px-2.5 py-1 transition disabled:opacity-50 ${
                context === value
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {band ? (
        <div className="mt-3">
          <p className="text-3xl font-semibold tracking-tight text-neutral-900">
            {usd(band.low)} – {usd(band.high)}
          </p>

          {measured ? (
            <>
              <p className="mt-1 text-sm text-emerald-700">
                Measured from your yard
                {payload?.measurement
                  ? ` — ${payload.measurement.totalAreaSf.toLocaleString("en-US")} SF across ${
                      payload.measurement.measuredRegions
                    } area${payload.measurement.measuredRegions === 1 ? "" : "s"}`
                  : null}
                {payload?.jobType ? (
                  <> · {JOB_TYPE_LABELS[payload.jobType] ?? payload.jobType}</>
                ) : null}
              </p>
              {payload?.typologyBand && (
                <div className="mt-3">
                  <BandMeter outer={payload.typologyBand} inner={band} />
                  <p className="mt-1 text-xs text-neutral-400">
                    Narrowed from {usd(payload.typologyBand.low)} –{" "}
                    {usd(payload.typologyBand.high)} for typical projects.
                  </p>
                </div>
              )}
              {payload?.measurement && payload.measurement.unmeasuredRegions > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {payload.measurement.unmeasuredRegions} designed area
                  {payload.measurement.unmeasuredRegions === 1 ? "" : "s"} not measured
                  yet — still estimated from typical projects.
                </p>
              )}
              {payload?.reconciliation?.outcome === "review" && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-medium">
                    Your photo doesn&apos;t match what was measured at this address
                    {payload.reconciliation.flaggedRegions.length > 0 && (
                      <>
                        {" "}
                        ({payload.reconciliation.flaggedRegions
                          .map((r) => r.label)
                          .join(", ")})
                      </>
                    )}
                    .
                  </p>
                  <p className="mt-1">
                    We&apos;ve widened the range to be safe. Double-check the address and
                    the drawn areas, or upload another photo — a rep will verify
                    everything before anything is final.
                  </p>
                </div>
              )}
              {payload?.reconciliation?.outcome === "tighten" && (
                <p className="mt-2 text-xs text-emerald-700">
                  Your photo and the aerial measurements agree — we&apos;ve tightened
                  this range.
                </p>
              )}
              {payload?.reconciliation &&
                payload.reconciliation.verticalElements.length > 0 && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Also seen in your photo (confirmed at the site visit):{" "}
                    {payload.reconciliation.verticalElements
                      .map((v) => v.description)
                      .join("; ")}
                    .
                  </p>
                )}
            </>
          ) : (
            <p className="mt-1 text-sm text-neutral-600">
              Projects like this typically run in this range
              {payload?.jobType ? (
                <> · {JOB_TYPE_LABELS[payload.jobType] ?? payload.jobType}</>
              ) : null}
            </p>
          )}

          {payload?.scope && payload.scope.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {payload.scope.map((item) => (
                <li
                  key={item}
                  className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
                >
                  {item}
                </li>
              ))}
            </ul>
          )}

          {measured ? (
            <Link
              href={`/design/${projectId}/locate`}
              className="mt-3 inline-block text-xs font-medium text-sky-700 hover:text-sky-900"
            >
              Adjust your measurements →
            </Link>
          ) : (
            <div className="mt-3">
              <Link
                href={`/design/${projectId}/locate`}
                className="inline-block rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-700"
              >
                Add your address — measure your yard &amp; narrow this range
              </Link>
              {addressDeclined && (
                <p className="mt-2 text-xs text-neutral-400">
                  You chose to skip the address — this range stays based on typical
                  projects. Add it anytime for a sharper number.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
          Click a labeled area on your photo and pick a material to see what
          projects like yours typically cost.
        </p>
      )}
    </div>
  );
}
