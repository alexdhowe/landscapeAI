"use client";

import { useState } from "react";

import { getOption } from "@/lib/catalog/options";
import type { PlantOption } from "@/lib/catalog/plants";
import { layoutRegionMarkers } from "@/lib/design/markers";
import { closedPathData, smoothOutline } from "@/lib/design/outline";
import type { RegionSelection } from "@/lib/design/types";
import type { SegmentedRegion } from "@/lib/vision/types";
import { REGION_KIND_LABELS } from "@/lib/vision/types";

import { PlantGlyph } from "./plantGlyphs";
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
  /**
   * A short label pinned to the picture itself. Used for the one thing a
   * customer must not have to infer: that these outlines are a stock
   * example rather than a reading of their own photo. It belongs on the
   * image, not in a block above it — a label that can be scrolled away
   * from the thing it labels is most of the way to not being one.
   */
  notice?: string;
  /** plantingId → the plant the customer put there. */
  plantSelections?: Record<string, string>;
  /** The org's plant catalog, for resolving those choices to a glyph. */
  plantCatalog?: readonly PlantOption[];
  /** Tapping a plant on the photo opens its picker. */
  onSelectPlanting?: (plantingId: string, regionId: string) => void;
  selectedPlantingId?: string | null;
};

/**
 * How much bigger than reported the plant cut-outs are drawn.
 *
 * The two ways to be wrong here are not equally bad. Too small and gravel
 * lands across a shrub's outer leaves, which is the thing this exists to
 * prevent and which is instantly visible. Too big and a little of the old
 * bed shows in a ring around the plant — which is what a real bed looks
 * like, since nothing is mulched right up to a stem. So the margin goes
 * outward, and a model that draws an ellipse round the dense middle of a
 * shrub still covers its edges.
 *
 * Display only. The stored ellipse stays exactly what the model reported,
 * because that is the plant's extent and a later per-plant swap needs the
 * real number, not one padded for masking.
 */
const PLANTING_MARGIN = 1.18;

/**
 * The path drawn for a region.
 *
 * Smoothed, because the graph stores a bed edge as a list of vertices and
 * a chain of straight chords is the wrong view of a curve. The smoothing
 * only ever cuts inward (see lib/design/outline.ts), so the material can
 * land short of the bed's stone border but never further across it, and a
 * genuine corner — a driveway, a step — is left square.
 *
 * The polygon itself is untouched: it is what every quantity and every
 * downstream reader uses. This is only what gets painted.
 */
function outlinePath(
  polygon: SegmentedRegion["polygon"],
  w: number,
  h: number,
): string {
  return closedPathData(smoothOutline(polygon), w, h);
}

/** What the photo called this plant, when it managed to name it. */
function plantName(label?: string): string {
  return label?.trim() || "This plant";
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
  notice,
  plantSelections,
  plantCatalog,
  onSelectPlanting,
  selectedPlantingId = null,
}: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredPlantId, setHoveredPlantId] = useState<string | null>(null);

  const catalogById = new Map((plantCatalog ?? []).map((o) => [o.id, o]));
  /** The plant the customer put here, if they put one here. */
  const chosenPlant = (plantingId: string): PlantOption | undefined => {
    const optionId = plantSelections?.[plantingId];
    return optionId ? catalogById.get(optionId) : undefined;
  };

  const w = dims?.w ?? 1600;
  const h = dims?.h ?? 1200;

  // A region the customer has acted on shows what they did; a name pinned
  // over it hides the one thing they just changed, and on a phone the pill
  // is wider than a bed. That covers a swapped surface and equally a
  // swapped plant — a new shrub drawn under a big dark label is not a
  // preview of anything. The strip below carries the name either way,
  // with room for it, so nothing is lost by getting out of the way.
  const acted = (region: SegmentedRegion) =>
    Boolean(selections[region.id]?.surfaceOptionId) ||
    (region.plantings ?? []).some((plant) => chosenPlant(plant.id));
  const named = regions.filter((region) => !acted(region));
  const markers = layoutRegionMarkers(named);

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
          {/* Takes the hard edge off the plant cut-outs: a shrub is not an
              ellipse, and a crisp oval of untouched photo reads as a
              mistake where a soft one reads as a plant. */}
          <filter id="planting-soften">
            <feGaussianBlur stdDeviation={w * 0.003} />
          </filter>
          {regions.map((region) => (
            // The region, minus the plants standing in it. White shows the
            // new material, black lets the photograph through — so
            // swapping mulch for stone re-surfaces the bed and leaves the
            // shrubs alone. Before this the texture covered the whole
            // polygon and every plant in the bed turned grey with it.
            <mask key={region.id} id={`swap-${region.id}`}>
              <path d={outlinePath(region.polygon, w, h)} fill="#ffffff" />
              {/* Only the plants that are STAYING are punched out. One
                  the customer has replaced is covered by the new material
                  and then drawn over, which is what makes a swap look like
                  the old plant was taken out rather than hidden. */}
              <g filter="url(#planting-soften)">
                {(region.plantings ?? [])
                  .filter((plant) => !chosenPlant(plant.id))
                  .map((plant) => (
                    <ellipse
                      key={plant.id}
                      cx={plant.cx * w}
                      cy={plant.cy * h}
                      rx={plant.rx * w * PLANTING_MARGIN}
                      ry={plant.ry * h * PLANTING_MARGIN}
                      fill="#000000"
                    />
                  ))}
              </g>
            </mask>
          ))}
        </defs>
        {regions.map((region) => {
          // One path, used for the tint, the stroke, the selection ring and
          // the hit target, so what the customer sees and what they can tap
          // cannot drift apart.
          const d = outlinePath(region.polygon, w, h);
          const surfaceOption = selections[region.id]?.surfaceOptionId
            ? getOption(selections[region.id].surfaceOptionId!)
            : undefined;
          const isSelected = region.id === selectedRegionId;
          const isActive = region.id === activeId;
          const kindColor = KIND_COLORS[region.kind];
          return (
            <g key={region.id}>
              {surfaceOption ? (
                // Masked, not clipped: the mask is the region with the
                // plants punched out of it, so the material lands on the
                // ground and the planting stays photographic.
                <g mask={`url(#swap-${region.id})`}>
                  {/* Textured material, feather-edged into the photo. */}
                  <path
                    d={d}
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
                    filter="url(#photo-shading)"
                    opacity={0.75}
                    style={{ mixBlendMode: "multiply" }}
                  />
                </g>
              ) : (
                <path
                  d={d}
                  fill={kindColor}
                  fillOpacity={isSelected || isActive ? 0.34 : 0.16}
                  stroke={kindColor}
                  strokeWidth={w * 0.002}
                  strokeDasharray={`${w * 0.008} ${w * 0.005}`}
                  strokeLinejoin="round"
                />
              )}
              {/* Selection ring drawn separately so it never gets textured. */}
              {(isSelected || isActive) && (
                <path
                  d={d}
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
              <path
                d={d}
                fill="transparent"
                className="pointer-events-auto cursor-pointer"
                onClick={() => onSelectRegion(region.id)}
                onMouseEnter={() => setActiveId(region.id)}
                onMouseLeave={() => setActiveId(null)}
              />
            </g>
          );
        })}
        {/* The swapped plants, drawn last so no region's material can land
            on top of one. Each is scaled to the footprint the photo's
            plant occupies: we know where the plant is and how big it looks
            from here, and we have no scale in feet from a single
            photograph — so the picture says "this plant, here", and the
            picker says how big it gets. */}
        {regions.map((region) =>
          (region.plantings ?? []).map((plant) => {
            const option = chosenPlant(plant.id);
            if (!option) return null;
            const rx = plant.rx * w * PLANTING_MARGIN;
            const ry = plant.ry * h * PLANTING_MARGIN;
            return (
              <g
                key={plant.id}
                transform={`translate(${plant.cx * w} ${plant.cy * h}) scale(${rx} ${ry})`}
              >
                <PlantGlyph kind={option.glyph} />
              </g>
            );
          }),
        )}
      </svg>

      {named.length > 0 && (
        // Pointer convenience, redundant with the strip below: markers
        // sized to name a region without burying the picture under it.
        // Placement comes from lib/design/markers, which clamps them
        // inside the frame and pushes apart any that would land on top of
        // one another.
        <div aria-hidden>
          {named.map((region, i) => {
            const { x, y } = markers[i];
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
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
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

      {/* Pointer affordance over each plant: hovering names it, tapping
          opens its picker. Hidden from assistive technology because the
          picker panel lists the same plants as real buttons — the same
          split the region markers and the region strip use.
          
          After the region markers in the DOM, and that ordering is load-
          bearing: a region's name pill is a wide target that sits over the
          middle of its region, so it covered the plants underneath it and
          swallowed their taps. Between the two, the plant is the more
          specific thing the customer is pointing at, and the region is
          still reachable from anywhere else in its polygon and from the
          strip under the photo. */}
      {onSelectPlanting && (
        <div aria-hidden>
          {regions.map((region) =>
            (region.plantings ?? []).map((plant) => {
              const option = chosenPlant(plant.id);
              const isOpen = plant.id === selectedPlantingId;
              const isHovered = plant.id === hoveredPlantId;
              // Quiet until it is relevant. A ring on every plant all the
              // time turns the customer's photograph into a diagram —
              // seven pale circles scattered over a yard read as an
              // overlay, not as things you can touch. So: nothing until
              // the pointer is on one, and a faint ring on the plants in
              // the region the customer has actually opened, which is
              // where they are looking for something to change.
              const inOpenRegion = region.id === selectedRegionId;
              const ring =
                isOpen || isHovered
                  ? "ring-2 ring-white/90 bg-white/10"
                  : inOpenRegion
                    ? "ring-1 ring-white/45 hover:ring-2 hover:ring-white/90"
                    : "hover:ring-2 hover:ring-white/90";
              return (
                <button
                  key={plant.id}
                  type="button"
                  tabIndex={-1}
                  data-plant={plant.id}
                  // What this element's position is supposed to be, so the
                  // browser pass can check where it actually landed.
                  data-cx={plant.cx}
                  data-cy={plant.cy}
                  onClick={() => onSelectPlanting(plant.id, region.id)}
                  onMouseEnter={() => setHoveredPlantId(plant.id)}
                  onMouseLeave={() => setHoveredPlantId(null)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all ${ring}`}
                  style={{
                    left: `${plant.cx * 100}%`,
                    top: `${plant.cy * 100}%`,
                    width: `${plant.rx * 2 * PLANTING_MARGIN * 100}%`,
                    height: `${plant.ry * 2 * PLANTING_MARGIN * 100}%`,
                  }}
                >
                  <span className="sr-only">
                    {option ? option.label : plantName(plant.label)}
                  </span>
                </button>
              );
            }),
          )}
          {/* What it is, on hover. One at a time, so a bed of eight shrubs
              does not turn into eight labels the moment the pointer
              crosses it. */}
          {regions.map((region) =>
            (region.plantings ?? []).map((plant) => {
              if (plant.id !== hoveredPlantId || plant.id === selectedPlantingId) return null;
              const option = chosenPlant(plant.id);
              return (
                <p
                  key={plant.id}
                  data-plant-label={plant.id}
                  // No `-translate-x-1/2` class here, and that is not an
                  // oversight. Tailwind's translate utilities set the
                  // standalone CSS `translate` property, so a class and an
                  // inline `transform` do not override one another — they
                  // compose. This label carried both and was drawn half
                  // its own width to the left of the plant it names, which
                  // on a bed of shrubs means it points at a different
                  // plant. Everything positional for this element is in
                  // the one inline transform.
                  className="pointer-events-none absolute z-10 whitespace-nowrap rounded-full bg-bark-950/85 px-2.5 py-1 text-2xs font-medium text-white shadow-e2 sm:text-xs"
                  style={{
                    left: `${plant.cx * 100}%`,
                    top: `${Math.max(0, plant.cy - plant.ry * PLANTING_MARGIN) * 100}%`,
                    transform: "translate(-50%, -120%)",
                  }}
                >
                  {option ? (
                    <>
                      {option.label}
                      <span className="font-normal text-canopy-200"> · replacing {plantName(plant.label)}</span>
                    </>
                  ) : (
                    plantName(plant.label)
                  )}
                </p>
              );
            }),
          )}
        </div>
      )}

      {notice && (
        // Pinned to the picture, top-left, where the eye lands before it
        // reads any of the outlines.
        <p className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-full bg-flag-50 px-2.5 py-1 text-2xs font-semibold text-flag-900 shadow-e2 ring-1 ring-flag-200 sm:left-3 sm:top-3 sm:text-xs">
          {notice}
        </p>
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
      {/* Visible, and sitting directly under the picture. It was sr-only,
          which left a row of white pills floating on the page ground with
          nothing saying what they were — against the four-colour fixture
          that read as part of the overlay, and against a photograph it
          reads as a list bolted underneath one. Naming it is what ties it
          back to the image. */}
      <h2 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-bark-500">
        Areas in your photo
      </h2>
      <p className="sr-only" id="region-strip-help">
        {regions.length} labelled area{regions.length === 1 ? "" : "s"}. Choose one
        to change what is in it.
      </p>
      {/* Scrolls sideways inside its own box rather than bleeding to the
          screen edge: a negative margin here widens the grid track it sits
          in, and the whole page starts scrolling horizontally with it.
          The mask is an alpha ramp, not a colour: it fades the right edge
          so a half-visible pill reads as "there is more" rather than as
          something clipped by a bug. Content that ends before the ramp is
          untouched, so a list that fits is not dimmed, and from `sm` the
          list wraps and the ramp is off. */}
      <ul
        aria-describedby="region-strip-help"
        className="flex gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-1.75rem),transparent)] sm:flex-wrap sm:[mask-image:none]"
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
