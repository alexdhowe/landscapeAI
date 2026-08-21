/**
 * Server-rendered badges for the contractor surfaces: quantity provenance,
 * confidence, and reconciliation verdicts. Every number a rep sees carries
 * its source — no bare numbers on the dashboard either.
 */
import type { QuantitySource } from "@/lib/pricing/types";

const SOURCE_STYLES: Record<QuantitySource, { label: string; className: string }> = {
  aerial: { label: "Aerial", className: "bg-sky-100 text-sky-800" },
  user_drawn: { label: "Drawn on aerial", className: "bg-indigo-100 text-indigo-800" },
  photo: { label: "Photo", className: "bg-amber-100 text-amber-800" },
  typology: { label: "Typology", className: "bg-neutral-200 text-neutral-700" },
  rep_confirmed: { label: "Rep confirmed", className: "bg-emerald-100 text-emerald-800" },
  as_built: { label: "As built", className: "bg-purple-100 text-purple-800" },
};

export function ProvenanceBadge({ source }: { source: QuantitySource }) {
  const style = SOURCE_STYLES[source] ?? SOURCE_STYLES.typology;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

/** 0–1 confidence as a small meter with the number beside it. */
export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone = pct >= 75 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-neutral-200">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[11px] tabular-nums text-neutral-500">{pct}%</span>
    </span>
  );
}

export function VerdictBadge({
  verdict,
}: {
  verdict: "agreement" | "disagreement" | "inconclusive";
}) {
  const styles = {
    agreement: "bg-emerald-100 text-emerald-800",
    disagreement: "bg-red-100 text-red-800",
    inconclusive: "bg-neutral-200 text-neutral-600",
  } as const;
  const labels = {
    agreement: "Sensors agree",
    disagreement: "Mismatch — review",
    inconclusive: "Inconclusive",
  } as const;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[verdict]}`}
    >
      {labels[verdict]}
    </span>
  );
}
