"use client";

import { useState } from "react";

import { getOption } from "@/lib/catalog/options";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";

import { KIND_COLORS, SwatchDefs } from "./swatches";

type Props = {
  photoUrl: string;
  regions: SegmentedRegion[];
  selections: Record<string, RegionSelection>;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
};

function centroid(polygon: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return [x / polygon.length, y / polygon.length];
}

/**
 * The customer's photo with the segmentation overlay. Clicking a polygon
 * selects the region; regions with a surface selection render filled with
 * that material's pattern — the visual swap.
 */
export function PhotoCanvas({
  photoUrl,
  regions,
  selections,
  selectedRegionId,
  onSelectRegion,
}: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const w = dims?.w ?? 1600;
  const h = dims?.h ?? 1200;

  return (
    <div className="relative overflow-hidden rounded-xl bg-neutral-900 shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt="Your yard"
        className="block w-full select-none"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setDims({ w: img.naturalWidth, h: img.naturalHeight });
          }
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
      >
        <SwatchDefs unit={w / 36} />
        {regions.map((region) => {
          const points = region.polygon
            .map(([x, y]) => `${x * w},${y * h}`)
            .join(" ");
          const surfaceOption = selections[region.id]?.surfaceOptionId
            ? getOption(selections[region.id].surfaceOptionId!)
            : undefined;
          const isSelected = region.id === selectedRegionId;
          const isHovered = region.id === hoveredId;
          const kindColor = KIND_COLORS[region.kind];
          return (
            <polygon
              key={region.id}
              points={points}
              fill={surfaceOption ? `url(#swatch-${surfaceOption.swatch})` : kindColor}
              fillOpacity={surfaceOption ? 0.9 : isSelected || isHovered ? 0.35 : 0.18}
              stroke={isSelected ? "#ffffff" : kindColor}
              strokeWidth={isSelected ? w * 0.004 : w * 0.002}
              strokeDasharray={surfaceOption ? undefined : `${w * 0.008} ${w * 0.005}`}
              className="cursor-pointer transition-[fill-opacity]"
              onClick={() => onSelectRegion(region.id)}
              onMouseEnter={() => setHoveredId(region.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          );
        })}
      </svg>
      {regions.map((region) => {
        const [cx, cy] = centroid(region.polygon);
        const surfaceOption = selections[region.id]?.surfaceOptionId
          ? getOption(selections[region.id].surfaceOptionId!)
          : undefined;
        const isSelected = region.id === selectedRegionId;
        return (
          <button
            key={region.id}
            type="button"
            onClick={() => onSelectRegion(region.id)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-xs font-medium shadow transition ${
              isSelected
                ? "bg-white text-neutral-900 ring-2 ring-white/60"
                : "bg-black/60 text-white hover:bg-black/80"
            }`}
            style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
          >
            {region.label || REGION_KIND_LABELS[region.kind]}
            {surfaceOption ? ` · ${surfaceOption.label}` : ""}
          </button>
        );
      })}
    </div>
  );
}
