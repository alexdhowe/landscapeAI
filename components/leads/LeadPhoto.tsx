/**
 * Read-only photo + segmentation overlay for the contractor's lead view.
 * Server-rendered: plain SVG polygons in percent coordinates, no
 * interactivity — the rep is reviewing the design, not editing it.
 */
import { KIND_COLORS } from "@/components/configurator/regionColors";
import { getOption } from "@/lib/catalog/options";
import { layoutRegionMarkers } from "@/lib/design/markers";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";


export function LeadPhoto({
  photoUrl,
  regions,
  selections,
}: {
  photoUrl: string;
  regions: SegmentedRegion[];
  selections: Record<string, RegionSelection>;
}) {
  const markers = layoutRegionMarkers(regions);
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
      {/* Same placement rule as the customer's canvas: clamped inside the
          frame and pushed apart where two centroids land together. The
          rep's copy carries the material as well as the name, so these run
          longer and collide sooner. */}
      {regions.map((region, i) => {
        const { x, y } = markers[i];
        const surfaceOption = selections[region.id]?.surfaceOptionId
          ? getOption(selections[region.id].surfaceOptionId!)
          : undefined;
        return (
          <span
            key={region.id}
            className="absolute max-w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bark-950/75 px-2.5 py-1 text-2xs font-medium text-white shadow-e2 sm:text-xs"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            {region.label || REGION_KIND_LABELS[region.kind]}
            {surfaceOption ? ` → ${surfaceOption.label}` : ""}
          </span>
        );
      })}
    </div>
  );
}
