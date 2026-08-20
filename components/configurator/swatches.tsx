import type { SwatchId } from "@/lib/catalog/options";
import type { RegionKind } from "@/lib/vision/types";

/** Tint + stroke for regions that haven't been swapped yet. */
export const KIND_COLORS: Record<RegionKind, string> = {
  turf: "#22c55e",
  bed: "#b45309",
  hardscape: "#64748b",
  foundation_planting: "#0ea5e9",
};

type SwatchSpec = { base: string; speckles: string[]; label: string };

export const SWATCH_SPECS: Record<SwatchId, SwatchSpec> = {
  mulch_brown: { base: "#6b4a2f", speckles: ["#57391f", "#7d5a3a"], label: "Hardwood" },
  mulch_dark: { base: "#4a3320", speckles: ["#3a2716", "#5c4128"], label: "Dyed brown" },
  mulch_red: { base: "#8a4a2c", speckles: ["#6f3a20", "#a05c38"], label: "Cedar" },
  stone_gray: { base: "#9aa0a6", speckles: ["#c7ccd1", "#7c8288"], label: "River rock" },
  stone_granite: { base: "#7d7f83", speckles: ["#a3a5a9", "#5f6165"], label: "Granite" },
  stone_buff: { base: "#cbb98f", speckles: ["#dccfa9", "#b3a075"], label: "Limestone" },
  planting_mixed: { base: "#4c7a3d", speckles: ["#6b9c58", "#39602c"], label: "Planted" },
};

/**
 * Deterministic material fill patterns. This is the Phase 2 "visual swap":
 * the region polygon fills with the selected catalog material. Rendering is
 * generated from the object graph (region + selection), never the other
 * way around.
 */
export function SwatchDefs({ unit }: { unit: number }) {
  const u = Math.max(unit, 1);
  return (
    <defs>
      {(Object.entries(SWATCH_SPECS) as [SwatchId, SwatchSpec][]).map(([id, spec]) => (
        <pattern
          key={id}
          id={`swatch-${id}`}
          width={u}
          height={u}
          patternUnits="userSpaceOnUse"
        >
          <rect width={u} height={u} fill={spec.base} />
          <circle cx={u * 0.25} cy={u * 0.3} r={u * 0.11} fill={spec.speckles[0]} />
          <circle cx={u * 0.7} cy={u * 0.18} r={u * 0.09} fill={spec.speckles[1]} />
          <circle cx={u * 0.55} cy={u * 0.62} r={u * 0.13} fill={spec.speckles[0]} />
          <circle cx={u * 0.15} cy={u * 0.78} r={u * 0.08} fill={spec.speckles[1]} />
          <circle cx={u * 0.85} cy={u * 0.82} r={u * 0.1} fill={spec.speckles[0]} />
        </pattern>
      ))}
    </defs>
  );
}

/** Small square preview of a swatch for the catalog picker. */
export function SwatchChip({ swatch }: { swatch: SwatchId }) {
  const spec = SWATCH_SPECS[swatch];
  return (
    <svg viewBox="0 0 20 20" className="h-8 w-8 shrink-0 rounded border border-black/10">
      <rect width="20" height="20" fill={spec.base} />
      <circle cx="5" cy="6" r="2.2" fill={spec.speckles[0]} />
      <circle cx="14" cy="4" r="1.8" fill={spec.speckles[1]} />
      <circle cx="11" cy="12" r="2.6" fill={spec.speckles[0]} />
      <circle cx="4" cy="15" r="1.6" fill={spec.speckles[1]} />
      <circle cx="16" cy="16" r="2" fill={spec.speckles[0]} />
    </svg>
  );
}
