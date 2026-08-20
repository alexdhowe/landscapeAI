"use client";

import type { MarketContext } from "@/lib/pricing/typology";

export type BandPayload = {
  band: { low: number; high: number; typical: number; currency: "USD"; basis: string } | null;
  jobType?: string;
  context?: MarketContext;
  scope?: string[];
};

const JOB_TYPE_LABELS: Record<string, string> = {
  mulch_to_stone: "Mulch-to-stone conversion",
  bed_renovation: "Bed renovation",
  foundation_planting_refresh: "Foundation planting refresh",
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The budget band. Typology-based by construction at this stage — the copy
 * says "projects like this" because nothing has been measured yet. Never
 * renders line items, unit rates, or anything internal.
 */
export function PriceRail({
  payload,
  context,
  busy,
  onContextChange,
}: {
  payload: BandPayload | null;
  context: MarketContext;
  busy: boolean;
  onContextChange: (context: MarketContext) => void;
}) {
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

      {payload?.band ? (
        <div className="mt-3">
          <p className="text-3xl font-semibold tracking-tight text-neutral-900">
            {usd(payload.band.low)} – {usd(payload.band.high)}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Projects like this typically run in this range
            {payload.jobType ? (
              <> · {JOB_TYPE_LABELS[payload.jobType] ?? payload.jobType}</>
            ) : null}
          </p>
          {payload.scope && payload.scope.length > 0 && (
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
          <p className="mt-3 text-xs text-neutral-400">
            Based on typical projects — add your address later and we&apos;ll measure
            your actual yard and narrow this range.
          </p>
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
