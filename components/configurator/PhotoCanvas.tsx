"use client";

import { useState } from "react";

import { getOption } from "@/lib/catalog/options";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";

import { KIND_COLORS } from "./regionColors";
import { SwatchFilters } from "./swatches";

type Props = {
  photoUrl: string;
  regions: SegmentedRegion[];
  selections: Record<string, RegionSelection>;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  /** Segmentation is still running: show the wait over the photo. */
  pending?: boolean;
};

function centroid(polygon: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  // Pulled off the edges: a marker is centred on its point, so one sitting
  // at x=0.04 has half of itself outside the picture, and a clipped label
  // reads as a bug rather than as a region that happens to hug the frame.
  const clamp = (v: number) => Math.min(0.82, Math.max(0.18, v));
  return [clamp(x / polygon.length), clamp(y / polygon.length)];
}

function regionName(region: SegmentedRegion): string {
  return region.label || REGION_KIND_LABELS[region.kind];
}

/**
 * The customer's photo with the segmentation overlay.
 *
 * Selecting a region fills its polygon with a procedural texture of the
 * chosen material — the visual swap — and the photo's own shading is
 * multiplied back on top so existing light and shadow carry through.
 *
 * ---------------------------------------------------------------------
 * Reaching a region without a mouse
 * ---------------------------------------------------------------------
 * The polygons were click targets and nothing else, so a keyboard could
 * not reach any of them and the whole configurator was unusable without a
 * pointer. The fix is not `tabIndex` on an SVG polygon: focus rings on SVG
 * are inconsistent across browsers, a shape has no accessible name to
 * speak, and — the part that only shows up on a phone — the markers over a
 * 390px-wide photo overlap each other, so 44px hit areas around them steal
 * one another's taps.
 *
 * So the controls are a **RegionStrip** underneath the photo: one real
 * button per region, in document order, 44px, no overlap, keyboard and
 * screen-reader native, and legible when four beds crowd one corner of the
 * picture. What sits on the photo — the polygons and the little name
 * markers — is a redundant pointer convenience over the same actions, and
 * is hidden from assistive technology so nothing is announced twice.
 */
export function PhotoCanvas({
  photoUrl,
  regions,
  selections,
  selectedRegionId,
  onSelectRegion,
  pending = false,
}: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const w = dims?.w ?? 1600;
  const h = dims?.h ?? 1200;

  return (
    <figure className="relative overflow-hidden rounded-xl bg-bark-900 shadow-e3 sm:rounded-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        // Short on purpose. A browser renders alt text at the image's
        // place while it loads, and a sentence long enough to name every
        // region is wide enough to stretch the column it sits in — the
        // regions are named by the strip below, where they are also
        // operable. Keep those two facts from fighting.
        alt={
          regions.length > 0
            ? "Your yard, with the areas we found outlined."
            : "The photo of your yard that you uploaded."
        }
        className="block w-full max-w-full select-none"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) {
            setDims({ w: img.naturalWidth, h: img.naturalHeight });
          }
        }}
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
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
          const isActive = region.id === activeId;
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
                  fillOpacity={isSelected || isActive ? 0.34 : 0.16}
                  stroke={kindColor}
                  strokeWidth={w * 0.002}
                  strokeDasharray={`${w * 0.008} ${w * 0.005}`}
                />
              )}
              {/* Selection ring drawn separately so it never gets textured. */}
              {(isSelected || isActive) && (
                <polygon
                  points={points}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity={isSelected ? 0.95 : 0.6}
                  strokeWidth={w * (isSelected ? 0.004 : 0.0025)}
                  strokeLinejoin="round"
                />
              )}
              {/* Pointer convenience only: the label chip below is the
                  control, and it is what a keyboard and a screen reader
                  reach. */}
              <polygon
                points={points}
                fill="transparent"
                className="pointer-events-auto cursor-pointer"
                onClick={() => onSelectRegion(region.id)}
                onMouseEnter={() => setActiveId(region.id)}
                onMouseLeave={() => setActiveId(null)}
              />
            </g>
          );
        })}
      </svg>

      {regions.length > 0 && (
        // Pointer convenience, redundant with the strip below: markers
        // sized to name a region without burying the picture under it.
        <div aria-hidden>
          {regions.map((region) => {
            const [cx, cy] = centroid(region.polygon);
            const isSelected = region.id === selectedRegionId;
            return (
              <button
                key={region.id}
                type="button"
                tabIndex={-1}
                onClick={() => onSelectRegion(region.id)}
                onMouseEnter={() => setActiveId(region.id)}
                onMouseLeave={() => setActiveId(null)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-1 text-2xs font-medium shadow-e2 transition-colors sm:px-2.5 sm:text-xs ${
                  isSelected
                    ? "bg-white text-bark-900 ring-2 ring-white/70"
                    : "bg-bark-950/70 text-white hover:bg-bark-950/90"
                }`}
                style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
              >
                {/* The name only. What material is in it is on the strip
                    below, where there is room for it — a marker wide
                    enough to carry both cannot stay inside a 390px photo
                    when its region hugs an edge. */}
                {regionName(region)}
              </button>
            );
          })}
        </div>
      )}

      {pending && <SegmentationWait />}
    </figure>
  );
}

/**
 * The controls for the regions on the photo: one button each, in the order
 * the model reported them.
 *
 * This is the accessible path to every polygon and, on a phone, the
 * usable one — a row of real 44px buttons that scrolls sideways beats
 * four markers overlapping in the corner of a 390px-wide picture.
 */
export function RegionStrip({
  regions,
  selections,
  selectedRegionId,
  onSelectRegion,
}: {
  regions: SegmentedRegion[];
  selections: Record<string, RegionSelection>;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
}) {
  if (regions.length === 0) return null;
  return (
    <div>
      <h2 className="sr-only">Areas in your photo</h2>
      <p className="sr-only" id="region-strip-help">
        {regions.length} labelled area{regions.length === 1 ? "" : "s"}. Choose one
        to change what is in it.
      </p>
      {/* Scrolls sideways inside its own box rather than bleeding to the
          screen edge: a negative margin here widens the grid track it sits
          in, and the whole page starts scrolling horizontally with it. */}
      <ul
        aria-describedby="region-strip-help"
        className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap"
      >
        {regions.map((region) => {
          const surfaceOption = selections[region.id]?.surfaceOptionId
            ? getOption(selections[region.id].surfaceOptionId!)
            : undefined;
          const isSelected = region.id === selectedRegionId;
          return (
            <li key={region.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectRegion(region.id)}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? "border-bark-900 bg-bark-900 text-white"
                    : "border-bark-300 bg-white text-bark-800 hover:border-bark-400 hover:bg-bark-50"
                }`}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: KIND_COLORS[region.kind] }}
                />
                {regionName(region)}
                {surfaceOption ? (
                  <span
                    className={
                      isSelected ? "font-normal text-bark-200" : "font-normal text-bark-500"
                    }
                  >
                    · {surfaceOption.label}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The wait, choreographed over the photo instead of beside it.
 *
 * §2's thesis is a customer playing inside thirty seconds, and most of
 * that budget is one vision call. A spinner in the corner spends it
 * looking broken. A band of light travelling down the customer's own
 * photograph spends it looking like something is being read — which is
 * exactly what is happening — and it keeps their picture, the thing they
 * came for, on screen the entire time.
 */
function SegmentationWait() {
  return (
    <div className="absolute inset-0" aria-live="polite">
      <div className="absolute inset-0 bg-bark-950/45" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-sweep bg-gradient-to-b from-transparent via-white/30 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-bark-950/90 to-transparent px-4 pb-4 pt-14 sm:px-5 sm:pb-5">
        <p className="text-sm font-medium text-white sm:text-base">
          Looking at your yard…
        </p>
        <p className="text-xs text-canopy-200 sm:text-sm">
          Finding the lawn, the beds and the hardscape. A few seconds.
        </p>
        {/* Placeholder chips in the shape of the labels that are coming,
            so nothing jumps when they arrive. */}
        <div aria-hidden className="mt-1 flex gap-2">
          <div className="skeleton h-6 w-24 rounded-full opacity-40" />
          <div className="skeleton h-6 w-20 rounded-full opacity-30" />
          <div className="skeleton h-6 w-28 rounded-full opacity-20" />
        </div>
      </div>
    </div>
  );
}
