"use client";

import { useEffect, useState } from "react";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The narrowing beat, made visible: the full typology range as a muted
 * track, the measured band as an emphasized segment that animates inward
 * from the full width when it (re)appears.
 */
export function BandMeter({
  outer,
  inner,
}: {
  /** The typology (pre-measurement) range. */
  outer: { low: number; high: number };
  /** The measured range. */
  inner: { low: number; high: number };
}) {
  const span = Math.max(1, outer.high - outer.low);
  const clamp = (pct: number) => Math.min(100, Math.max(0, pct));
  const left = clamp(((inner.low - outer.low) / span) * 100);
  const right = clamp(((outer.high - inner.high) / span) * 100);

  // Start at full width, then animate to the measured segment.
  const [narrowed, setNarrowed] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setNarrowed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-bark-200">
        <div
          className="absolute inset-y-0 rounded-full bg-canopy-500 transition-all duration-1000 ease-out"
          style={{
            left: `${narrowed ? left : 0}%`,
            right: `${narrowed ? right : 0}%`,
          }}
        />
      </div>
      <div className="mt-1 flex justify-between text-2xs text-bark-500">
        <span>{usd(outer.low)}</span>
        <span>{usd(outer.high)}</span>
      </div>
    </div>
  );
}
