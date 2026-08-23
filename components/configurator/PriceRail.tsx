"use client";

import type { MarketContext } from "@/lib/pricing/typology";

import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Callout, Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { locateEnabled } from "@/lib/locate/gate";

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
 * The budget band — the number the whole first screen exists to produce.
 *
 * Basis "typology" until the aerial pass has measured a designed region,
 * then basis "measured", shown with the old range so the narrowing is a
 * visible beat rather than a silent update. Never renders line items, unit
 * rates, or anything internal: this is a customer surface.
 */
export function PriceRail({
  payload,
  context,
  busy,
  onContextChange,
  projectId,
  addressDeclined,
  locked,
  pending,
}: {
  payload: BandPayload | null;
  context: MarketContext;
  busy: boolean;
  onContextChange: (context: MarketContext) => void;
  projectId: string;
  addressDeclined?: boolean;
  /** Submitted designs are frozen — hide the measure/adjust calls to action. */
  locked?: boolean;
  /** Segmentation is still running: there is nothing to price yet. */
  pending?: boolean;
}) {
  const band = payload?.band ?? null;
  const measured = band?.basis === "measured";
  // The aerial leg is licensed, not built. With the imagery or geocoder
  // terms undeclared there is nothing to send a customer to, so the call
  // to action is absent rather than broken — the band stays at typology
  // width and the rest of the funnel is unchanged. See lib/locate/gate.ts.
  const aerial = locateEnabled();

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
          Budget range
        </h2>
        <div
          role="group"
          aria-label="Property type"
          className="flex rounded-full border border-bark-200 p-0.5 text-xs"
        >
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
              aria-pressed={context === value}
              onClick={() => onContextChange(value)}
              className={`tap-target rounded-full px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${
                context === value
                  ? "bg-bark-900 text-white"
                  : "text-bark-600 hover:text-bark-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {band ? (
        <div className="mt-3">
          <p className="tnum display text-3xl text-bark-900 sm:text-4xl">
            {usd(band.low)} – {usd(band.high)}
          </p>

          {measured ? (
            <>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-bark-700">
                <Badge tone="survey">Measured</Badge>
                {payload?.measurement
                  ? `${payload.measurement.totalAreaSf.toLocaleString("en-US")} SF across ${
                      payload.measurement.measuredRegions
                    } area${payload.measurement.measuredRegions === 1 ? "" : "s"}`
                  : "from your yard"}
                {payload?.jobType ? (
                  <span className="text-bark-600">
                    · {JOB_TYPE_LABELS[payload.jobType] ?? payload.jobType}
                  </span>
                ) : null}
              </p>
              {payload?.typologyBand && (
                <div className="mt-4">
                  <BandMeter outer={payload.typologyBand} inner={band} />
                  <p className="mt-1.5 text-xs text-bark-600">
                    Narrowed from {usd(payload.typologyBand.low)} –{" "}
                    {usd(payload.typologyBand.high)} for typical projects.
                  </p>
                </div>
              )}
              {payload?.measurement && payload.measurement.unmeasuredRegions > 0 && (
                <p className="mt-3 text-xs text-flag-800">
                  {payload.measurement.unmeasuredRegions} designed area
                  {payload.measurement.unmeasuredRegions === 1 ? "" : "s"} not
                  measured yet — still estimated from typical projects.
                </p>
              )}
              {payload?.reconciliation?.outcome === "review" && (
                <Callout tone="flag" className="mt-3 text-xs" title="Your photo doesn't match what was measured at this address">
                  <p className="mt-1">
                    {payload.reconciliation.flaggedRegions.length > 0 && (
                      <>
                        Check{" "}
                        {payload.reconciliation.flaggedRegions
                          .map((r) => r.label)
                          .join(", ")}
                        .{" "}
                      </>
                    )}
                    We&apos;ve widened the range to be safe. Double-check the
                    address and the drawn areas, or upload another photo — a rep
                    verifies everything before anything is final.
                  </p>
                </Callout>
              )}
              {payload?.reconciliation?.outcome === "tighten" && (
                <p className="mt-3 text-xs text-canopy-800">
                  Your photo and the aerial measurements agree — we&apos;ve
                  tightened this range.
                </p>
              )}
              {payload?.reconciliation &&
                payload.reconciliation.verticalElements.length > 0 && (
                  <p className="mt-2 text-xs text-bark-600">
                    Also seen in your photo (confirmed at the site visit):{" "}
                    {payload.reconciliation.verticalElements
                      .map((v) => v.description)
                      .join("; ")}
                    .
                  </p>
                )}
            </>
          ) : (
            <p className="mt-2 text-sm text-bark-600">
              Projects like this typically run in this range
              {payload?.jobType ? (
                <> · {JOB_TYPE_LABELS[payload.jobType] ?? payload.jobType}</>
              ) : null}
            </p>
          )}

          {payload?.scope && payload.scope.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {payload.scope.map((item) => (
                <li key={item}>
                  <Badge>{item}</Badge>
                </li>
              ))}
            </ul>
          )}

          {locked || !aerial ? null : measured ? (
            <ButtonLink
              href={`/design/${projectId}/locate`}
              tone="ghost"
              size="sm"
              className="mt-4 -ml-2"
            >
              Adjust your measurements →
            </ButtonLink>
          ) : (
            <div className="mt-4">
              <ButtonLink
                href={`/design/${projectId}/locate`}
                tone="survey"
                size="md"
                block
              >
                Measure my yard &amp; narrow this
              </ButtonLink>
              <p className="mt-2 text-xs text-bark-600">
                {addressDeclined
                  ? "You chose to skip the address, so this range stays based on typical projects. Add it anytime for a sharper number."
                  : "Takes an address. You can skip it and still send your design."}
              </p>
            </div>
          )}
        </div>
      ) : pending ? (
        <div className="mt-3 space-y-3" aria-live="polite">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-3 w-40" />
          <p className="sr-only">Working out your budget range.</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-bark-600">
          Nothing chosen yet. Pick a material for one of your areas — a range
          appears here, and you can send the design to the contractor.
        </p>
      )}
    </Card>
  );
}
