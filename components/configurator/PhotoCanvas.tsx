"use client";

import { useState } from "react";

import { getOption } from "@/lib/catalog/options";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";

import { KIND_COLORS, SwatchFilters } from "./swatches";

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
 * a procedural texture of that material — the visual swap. The texture
 * layer multiplies the photo's own shading back on top, so the photo's
 * light and shadow carry through the new material.
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
        <SwatchFilters width={w} edgeBlur={w * 0.0035} />
        <defs>
          {/* Desaturated, brightened copy of the photo: multiplied over a
              texture it re-applies the photo's shadows without its color. */}
          <filter id="photo-shading">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude="1" exponent="0.5" offset="0.3" />
              <feFuncG type="gamma" amplitude="1" exponent="0.5" offset="0.3" />
              <feFuncB type="gamma" amplitude="1" exponent="0.5" offset="0.3" />
            </feComponentTransfer>
          </filter>
          {regions.map((region) => (
            <clipPath key={region.id} id={`clip-${region.id}`}>
              <polygon
                points={region.polygon.map(([x, y]) => `${x * w},${y * h}`).join(" ")}
              />
            </clipPath>
          ))}
        </defs>
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
            <g key={region.id}>
              {surfaceOption ? (
                <>
                  {/* Textured material, feather-edged into the photo. */}
                  <polygon
                    points={points}
                    fill="#ffffff"
                    filter={`url(#tex-${surfaceOption.swatch})`}
                    opacity={0.96}
                  />
                  {/* The photo's own shading, multiplied back on top so
                      existing light and shadow read through the swap. */}
                  <image
                    href={photoUrl}
                    x={0}
                    y={0}
                    width={w}
                    height={h}
                    preserveAspectRatio="none"
                    clipPath={`url(#clip-${region.id})`}
                    filter="url(#photo-shading)"
                    opacity={0.75}
                    style={{ mixBlendMode: "multiply" }}
                  />
                </>
              ) : (
                <polygon
                  points={points}
                  fill={kindColor}
                  fillOpacity={isSelected || isHovered ? 0.32 : 0.14}
                  stroke={kindColor}
                  strokeWidth={w * 0.002}
                  strokeDasharray={`${w * 0.008} ${w * 0.005}`}
                />
              )}
              {/* Selection ring drawn separately so it never gets textured. */}
              {(isSelected || isHovered) && (
                <polygon
                  points={points}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={isSelected ? 0.95 : 0.55}
                  strokeWidth={w * (isSelected ? 0.004 : 0.0025)}
                  strokeLinejoin="round"
                />
              )}
              {/* Hit target on top of everything for this region. */}
              <polygon
                points={points}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onSelectRegion(region.id)}
                onMouseEnter={() => setHoveredId(region.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            </g>
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
