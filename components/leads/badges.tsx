/**
 * Server-rendered badges for the contractor surfaces: quantity provenance,
 * confidence, and reconciliation verdicts. Every number a rep sees carries
 * its source — no bare numbers on the dashboard either.
 */
import type { QuantitySource } from "@/lib/pricing/types";

const SOURCE_STYLES: Record<QuantitySource, { label: string; className: string }> = {
  aerial: { label: "Aerial", className: "bg-survey-100 text-survey-800" },
  user_drawn: { label: "Drawn on aerial", className: "bg-survey-100 text-survey-800" },
  photo: { label: "Photo", className: "bg-flag-100 text-flag-800" },
  typology: { label: "Typology", className: "bg-bark-200 text-bark-700" },
  rep_confirmed: { label: "Rep confirmed", className: "bg-canopy-100 text-canopy-800" },
  as_built: { label: "As built", className: "bg-bark-100 text-bark-800" },
};

export function ProvenanceBadge({ source }: { source: QuantitySource }) {
  const style = SOURCE_STYLES[source] ?? SOURCE_STYLES.typology;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-2xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

/** 0–1 confidence as a small meter with the number beside it. */
export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone = pct >= 75 ? "bg-canopy-500" : pct >= 45 ? "bg-flag-500" : "bg-clay-500";
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-bark-200">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-2xs tabular-nums text-bark-500">{pct}%</span>
    </span>
  );
}

export function VerdictBadge({
  verdict,
}: {
  verdict: "agreement" | "disagreement" | "inconclusive";
}) {
  const styles = {
    agreement: "bg-canopy-100 text-canopy-800",
    disagreement: "bg-clay-100 text-clay-800",
    inconclusive: "bg-bark-200 text-bark-600",
  } as const;
  const labels = {
    agreement: "Sensors agree",
    disagreement: "Mismatch — review",
    inconclusive: "Inconclusive",
  } as const;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-2xs font-medium ${styles[verdict]}`}
    >
      {labels[verdict]}
    </span>
  );
}
