"use client";

import { useId } from "react";

import type { SwatchId } from "@/lib/catalog/options";
import type { RegionKind } from "@/lib/vision/types";

/** Tint + stroke for regions that haven't been swapped yet. */
export const KIND_COLORS: Record<RegionKind, string> = {
  turf: "#22c55e",
  bed: "#b45309",
  hardscape: "#64748b",
  foundation_planting: "#0ea5e9",
};

/**
 * Procedural material textures built from SVG turbulence + lighting.
 * Deterministic by construction (fixed seeds) — the visual swap stays a
 * projection of the object graph, and there are no texture assets to
 * license or ship.
 *
 * Each channel table maps the lit noise field (dark→light) onto the
 * material's color ramp.
 */
type TextureSpec = {
  label: string;
  /** [x, y] base frequency at a 1600px-wide reference image. */
  baseFrequency: [number, number];
  numOctaves: number;
  seed: number;
  /** Bumpiness of the lighting pass. */
  surfaceScale: number;
  /** Color ramps: lighting luminance → channel value, 0-1. */
  r: number[];
  g: number[];
  b: number[];
};

export const SWATCH_SPECS: Record<SwatchId, TextureSpec> = {
  mulch_brown: {
    label: "Hardwood",
    baseFrequency: [0.09, 0.17],
    numOctaves: 4,
    seed: 7,
    surfaceScale: 4,
    r: [0.16, 0.34, 0.52],
    g: [0.09, 0.21, 0.35],
    b: [0.05, 0.12, 0.2],
  },
  mulch_dark: {
    label: "Dyed brown",
    baseFrequency: [0.09, 0.17],
    numOctaves: 4,
    seed: 11,
    surfaceScale: 4,
    r: [0.1, 0.24, 0.38],
    g: [0.06, 0.14, 0.24],
    b: [0.03, 0.08, 0.14],
  },
  mulch_red: {
    label: "Cedar",
    baseFrequency: [0.09, 0.17],
    numOctaves: 4,
    seed: 13,
    surfaceScale: 4,
    r: [0.24, 0.44, 0.6],
    g: [0.11, 0.21, 0.33],
    b: [0.06, 0.11, 0.18],
  },
  stone_gray: {
    label: "River rock",
    baseFrequency: [0.07, 0.07],
    numOctaves: 4,
    seed: 3,
    surfaceScale: 6,
    r: [0.28, 0.52, 0.8],
    g: [0.29, 0.53, 0.81],
    b: [0.31, 0.55, 0.82],
  },
  stone_granite: {
    label: "Granite",
    baseFrequency: [0.09, 0.09],
    numOctaves: 4,
    seed: 5,
    surfaceScale: 4,
    r: [0.26, 0.46, 0.66],
    g: [0.26, 0.47, 0.67],
    b: [0.28, 0.49, 0.7],
  },
  stone_buff: {
    label: "Limestone",
    baseFrequency: [0.08, 0.08],
    numOctaves: 4,
    seed: 9,
    surfaceScale: 4,
    r: [0.62, 0.78, 0.9],
    g: [0.54, 0.7, 0.83],
    b: [0.38, 0.52, 0.66],
  },
  planting_mixed: {
    label: "Planted",
    baseFrequency: [0.045, 0.045],
    numOctaves: 3,
    seed: 21,
    surfaceScale: 4,
    r: [0.12, 0.24, 0.42],
    g: [0.28, 0.46, 0.62],
    b: [0.1, 0.18, 0.28],
  },
};

const REFERENCE_WIDTH = 1600;

/**
 * One material filter. Applying `filter="url(#<id>)"` to a shape replaces
 * its fill with the generated texture, clipped to a feathered
 * (blurred-alpha) edge so a swap sits into the photo instead of on it.
 *
 * `width` is the host viewBox width — frequencies scale with it so grain
 * size stays constant relative to the photo. `edgeBlur` is in view units.
 */
export function TextureFilter({
  id,
  swatch,
  width,
  edgeBlur,
}: {
  id: string;
  swatch: SwatchId;
  width: number;
  edgeBlur: number;
}) {
  const spec = SWATCH_SPECS[swatch];
  const f = REFERENCE_WIDTH / Math.max(width, 1);
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency={`${spec.baseFrequency[0] / f} ${spec.baseFrequency[1] / f}`}
        numOctaves={spec.numOctaves}
        seed={spec.seed}
        result="noise"
      />
      <feDiffuseLighting
        in="noise"
        lightingColor="#ffffff"
        surfaceScale={spec.surfaceScale}
        result="lit"
      >
        <feDistantLight azimuth="235" elevation="55" />
      </feDiffuseLighting>
      <feComponentTransfer in="lit" result="colored">
        <feFuncR type="table" tableValues={spec.r.join(" ")} />
        <feFuncG type="table" tableValues={spec.g.join(" ")} />
        <feFuncB type="table" tableValues={spec.b.join(" ")} />
      </feComponentTransfer>
      {/* Erode before blurring so the feather fades inward — the texture
          must never leak past the region boundary onto the photo. */}
      <feMorphology in="SourceAlpha" operator="erode" radius={edgeBlur} result="eroded" />
      <feGaussianBlur in="eroded" stdDeviation={edgeBlur} result="softEdge" />
      <feComposite in="colored" in2="softEdge" operator="in" />
    </filter>
  );
}

/** The full filter set for the photo canvas, ids `tex-<swatchId>`. */
export function SwatchFilters({
  width,
  edgeBlur,
}: {
  width: number;
  edgeBlur: number;
}) {
  return (
    <defs>
      {(Object.keys(SWATCH_SPECS) as SwatchId[]).map((id) => (
        <TextureFilter
          key={id}
          id={`tex-${id}`}
          swatch={id}
          width={width}
          edgeBlur={edgeBlur}
        />
      ))}
    </defs>
  );
}

/** Small square preview of a material for the catalog picker. */
export function SwatchChip({ swatch }: { swatch: SwatchId }) {
  const uid = useId();
  const filterId = `chip${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-${swatch}`;
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-9 w-9 shrink-0 rounded-md border border-black/10"
      aria-hidden
    >
      <defs>
        <TextureFilter id={filterId} swatch={swatch} width={640} edgeBlur={0} />
      </defs>
      <rect width="120" height="120" filter={`url(#${filterId})`} />
    </svg>
  );
}
