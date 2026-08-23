import type { Tone } from "./Card";

/**
 * The pill. Same tone vocabulary as Callout, one size smaller, and it is
 * the only place a status word is allowed to be coloured.
 */
const TONES: Record<Tone, string> = {
  neutral: "bg-bark-200 text-bark-700",
  canopy: "bg-canopy-100 text-canopy-800",
  survey: "bg-survey-100 text-survey-800",
  flag: "bg-flag-100 text-flag-800",
  clay: "bg-clay-100 text-clay-800",
};

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
