/**
 * Read-only photo + segmentation overlay for the contractor's lead view.
 * Server-rendered: plain SVG polygons in percent coordinates, no
 * interactivity — the rep is reviewing the design, not editing it.
 */
import { PlantGlyph } from "@/components/configurator/plantGlyphs";
import { KIND_COLORS } from "@/components/configurator/regionColors";
import { getOption } from "@/lib/catalog/options";
import type { PlantOption } from "@/lib/catalog/plants";
import { layoutRegionMarkers } from "@/lib/design/markers";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";


export function LeadPhoto({
  photoUrl,
  regions,
  selections,
  plantSelections,
  plantCatalog = [],
}: {
  photoUrl: string;
  regions: SegmentedRegion[];
  selections: Record<string, RegionSelection>;
  /** plantingId → the plant the customer chose. */
  plantSelections?: Record<string, string>;
  plantCatalog?: readonly PlantOption[];
}) {
  const markers = layoutRegionMarkers(regions);
  const catalogById = new Map(plantCatalog.map((o) => [o.id, o]));
  const chosenPlant = (plantingId: string) => {
    const optionId = plantSelections?.[plantingId];
    return optionId ? catalogById.get(optionId) : undefined;
  };
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
        {/* What the customer chose to plant, drawn the same way their own
            canvas drew it — the rep is reviewing the design they were
            shown, so it has to be the same picture. */}
        {regions.map((region) =>
          (region.plantings ?? []).map((plant) => {
            const option = chosenPlant(plant.id);
            if (!option) return null;
            return (
              <g
                key={plant.id}
                transform={`translate(${plant.cx * 100} ${plant.cy * 100}) scale(${plant.rx * 100} ${plant.ry * 100})`}
              >
                <PlantGlyph kind={option.glyph} />
              </g>
            );
          }),
        )}
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
