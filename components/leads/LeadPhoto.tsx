/**
 * Read-only photo + segmentation overlay for the contractor's lead view.
 * Server-rendered: plain SVG polygons in percent coordinates, no
 * interactivity — the rep is reviewing the design, not editing it.
 */
import { KIND_COLORS } from "@/components/configurator/regionColors";
import { getOption } from "@/lib/catalog/options";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";



function centroid(polygon: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return [x / polygon.length, y / polygon.length];
}

export function LeadPhoto({
  photoUrl,
  regions,
  selections,
}: {
  photoUrl: string;
  regions: SegmentedRegion[];
  selections: Record<string, RegionSelection>;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl bg-bark-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="The customer's yard, with the segmented regions outlined." className="block w-full max-w-full select-none" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {regions.map((region) => {
          const points = region.polygon
            .map(([x, y]) => `${x * 100},${y * 100}`)
            .join(" ");
          const color = KIND_COLORS[region.kind];
          return (
            <polygon
              key={region.id}
              points={points}
              fill={color}
              fillOpacity={0.18}
              stroke={color}
              strokeWidth={0.35}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {regions.map((region) => {
        const [cx, cy] = centroid(region.polygon);
        const surfaceOption = selections[region.id]?.surfaceOptionId
          ? getOption(selections[region.id].surfaceOptionId!)
          : undefined;
        return (
          <span
            key={region.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white shadow"
            style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
          >
            {region.label || REGION_KIND_LABELS[region.kind]}
            {surfaceOption ? ` → ${surfaceOption.label}` : ""}
          </span>
        );
      })}
    </div>
  );
}
