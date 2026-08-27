"use client";

import { memo, useId } from "react";

import type { SwatchId } from "@/lib/catalog/options";
import {
  facetPath,
  grainTile,
  grainTileSize,
  type GrainShape,
  type TileOptions,
} from "@/lib/design/grains";
import type { DepthBand } from "@/lib/design/perspective";

/**
 * Procedural material surfaces, drawn as the pieces they are made of.
 * Deterministic by construction (fixed seeds) — the visual swap stays a
 * projection of the object graph, and there are no texture assets to
 * license or ship.
 *
 * ---------------------------------------------------------------------
 * Five faults have been fixed here, and they were found in this order
 * ---------------------------------------------------------------------
 * 1. **The filters ran in linearRGB**, which is the SVG default. Every
 *    ramp was therefore tuned against a colour space nobody was reading
 *    it in: a table value of 0.28 came out at sRGB 0.57, roughly twice as
 *    light as written, so every material landed somewhere between pale
 *    grey and pale beige.
 *
 * 2. **The noise was never spread.** A greyed `feTurbulence` field
 *    occupies a narrow band of the 0–1 range, so a colour table indexed
 *    0..1 only ever used a fifth of itself and every material came out a
 *    flat wash of its own mid tone.
 *
 * 3. **Nothing distinguished a chip from a fibre.** One generator, one
 *    treatment, six materials.
 *
 * 4. **The gauge was a fraction of the frame, which is not a gauge.** The
 *    same constant drew a "1.5in river rock" at 29 pixels whether the
 *    photo showed ten feet of yard or fifty — on a 300 sf bed, a stone
 *    thirteen times life size. A spec carries its grain in **inches**
 *    now, and `lib/design/scale.ts` turns that into pixels using the
 *    region's own reported area.
 *
 * 5. **It was still a cloud, and gravel is objects.** All four fixes
 *    landed and washed river rock on a real photograph still read as grey
 *    fabric with blotches in it, because a noise field is continuous: no
 *    edges, so no pieces, so no material. The pieces are drawn now —
 *    see `lib/design/grains.ts`, which is where that argument is made in
 *    full. This file is the colour and the light over the top of them.
 *
 * ---------------------------------------------------------------------
 * How a material is put together now
 * ---------------------------------------------------------------------
 * A `<pattern>` of real geometry: a dark ground, and on it a jittered
 * field of stones or shreds at the material's own gauge, each with its
 * own size, angle and tone. Then one filter over the painted result for
 * the two things that are properties of the *bed* rather than of a
 * piece — the low-frequency patchiness no real bed is without, and the
 * feathered edge that sits the swap into the photograph instead of on it.
 */

/** Colour ramp: dark end of the material → light end, per channel. */
type Ramp = { r: number[]; g: number[]; b: number[] };

type TextureSpec = {
  label: string;
  /**
   * How wide one piece of this material is, **in inches of real
   * material**: 1.5 for washed river rock, 3/8 for granite chips.
   */
  inches: number;
  /** What one piece looks like and how they pack. */
  shape: GrainShape;
  ramp: Ramp;
  /**
   * The low-frequency variation that keeps a bed from looking like paint:
   * patches of a real bed are always a little darker than others. `feet`
   * is the size of a patch, so mottling stays a property of the bed
   * rather than of the photograph's framing; `depth` is how dark the
   * darkest patch gets, as a multiplier.
   */
  mottle: { feet: number; seed: number; depth: number };
  /**
   * How much the sun catches the top of one piece. Washed rock is
   * tumbled and wet-looking; crushed stone is matte; mulch is dust.
   */
  sheen: number;
};

/**
 * The materials.
 *
 * A ramp's light end is what a piece catching the sun looks like and its
 * dark end is one in the shade of its neighbour — not a range of
 * *different* pieces. The tone spread in `shape` decides how far apart
 * two neighbouring pieces are allowed to be, which is what separates a
 * bag of mixed river rock from a bag of one quarry's granite.
 *
 * Values are written for a photograph, not a showroom: the picture's own
 * light is multiplied over all of this afterwards and takes another 15%
 * or so off the top.
 */
export const SWATCH_SPECS: Record<SwatchId, TextureSpec> = {
  // -- mulches: long shreds, lying every which way, matte --------------
  mulch_brown: {
    label: "Hardwood",
    inches: 1,
    shape: { kind: "strand", aspect: 4.5, packing: 0.26, toneSpread: 0.42, seed: 7 },
    ramp: {
      r: [0.22, 0.33, 0.45, 0.56, 0.67],
      g: [0.14, 0.21, 0.3, 0.39, 0.48],
      b: [0.08, 0.13, 0.19, 0.26, 0.33],
    },
    mottle: { feet: 3, seed: 47, depth: 0.78 },
    sheen: 0,
  },
  mulch_dark: {
    label: "Dyed brown",
    inches: 1,
    shape: { kind: "strand", aspect: 4.5, packing: 0.26, toneSpread: 0.38, seed: 11 },
    ramp: {
      r: [0.11, 0.17, 0.24, 0.32, 0.41],
      g: [0.07, 0.11, 0.16, 0.22, 0.28],
      b: [0.05, 0.07, 0.11, 0.15, 0.2],
    },
    mottle: { feet: 3, seed: 53, depth: 0.8 },
    sheen: 0,
  },
  mulch_red: {
    label: "Cedar",
    inches: 1.1,
    shape: { kind: "strand", aspect: 4.2, packing: 0.26, toneSpread: 0.4, seed: 13 },
    ramp: {
      r: [0.26, 0.36, 0.46, 0.57, 0.68],
      g: [0.14, 0.2, 0.27, 0.35, 0.43],
      b: [0.09, 0.13, 0.18, 0.24, 0.3],
    },
    mottle: { feet: 3, seed: 59, depth: 0.8 },
    sheen: 0,
  },
  // -- stone: discrete pieces, at their real gauge ----------------------
  stone_gray: {
    label: "River rock",
    // 1.5in washed rock: four times the gauge of the granite chips beside
    // it in the picker, because that is four times the stone.
    inches: 1.5,
    // Tumbled, so rounded; and a wide tone spread, because a load of
    // washed river rock is grey and buff and near-white all mixed
    // together. A single-tone bed of it is the giveaway that it is not
    // rock at all.
    shape: { kind: "pebble", aspect: 1.25, packing: 0.6, toneSpread: 0.5, seed: 3 },
    ramp: {
      r: [0.28, 0.41, 0.54, 0.68, 0.84],
      g: [0.27, 0.4, 0.53, 0.67, 0.83],
      b: [0.25, 0.37, 0.49, 0.63, 0.79],
    },
    mottle: { feet: 3.5, seed: 61, depth: 0.82 },
    sheen: 0.3,
  },
  stone_granite: {
    label: "Granite",
    inches: 0.375,
    // Crushed, so angular, and out of one quarry, so the pieces are far
    // closer to each other in tone than washed rock is.
    shape: { kind: "chip", aspect: 1.2, packing: 0.58, toneSpread: 0.34, seed: 5 },
    ramp: {
      r: [0.28, 0.41, 0.55, 0.69, 0.84],
      g: [0.28, 0.41, 0.55, 0.69, 0.84],
      b: [0.3, 0.43, 0.57, 0.71, 0.86],
    },
    mottle: { feet: 2, seed: 41, depth: 0.84 },
    sheen: 0.12,
  },
  stone_buff: {
    label: "Limestone",
    inches: 0.75,
    shape: { kind: "chip", aspect: 1.25, packing: 0.58, toneSpread: 0.3, seed: 9 },
    ramp: {
      r: [0.47, 0.61, 0.74, 0.86, 0.97],
      g: [0.41, 0.54, 0.66, 0.78, 0.9],
      b: [0.27, 0.37, 0.48, 0.6, 0.73],
    },
    mottle: { feet: 2.5, seed: 43, depth: 0.86 },
    sheen: 0.1,
  },
  // -- a replanted bed: foliage, not a surface --------------------------
  planting_mixed: {
    label: "Planted",
    inches: 5,
    // Whole plants, not pieces of material: big, round, overlapping
    // masses of leaf with deep shade between them.
    shape: { kind: "pebble", aspect: 1.15, packing: 0.55, toneSpread: 0.46, seed: 21 },
    ramp: {
      r: [0.06, 0.11, 0.17, 0.24, 0.33],
      g: [0.14, 0.23, 0.33, 0.44, 0.56],
      b: [0.05, 0.09, 0.14, 0.2, 0.27],
    },
    mottle: { feet: 3, seed: 21, depth: 0.8 },
    sheen: 0.08,
  },
};

/** How big one piece of this material is, in inches. */
export function grainInches(swatch: SwatchId): number {
  return SWATCH_SPECS[swatch].inches;
}

/**
 * How dark the ground under the pieces is, against the darkest piece.
 *
 * What shows between two stones is the shadow down the gap — but at the
 * distance a yard is photographed from, that gap is mostly full of fines
 * and dust rather than black. Too dark and every piece reads as a cut-out
 * sitting on a board, which is most of what made a drawn bed look drawn.
 */
const GROUND = 0.76;

/** A colour off the material's ramp, at `tone` from dark end to light. */
function rampColor(ramp: Ramp, tone: number, scale = 1): string {
  const at = (stops: number[]) => {
    const t = Math.min(0.999999, Math.max(0, tone)) * (stops.length - 1);
    const i = Math.floor(t);
    const value = stops[i] + (stops[i + 1] - stops[i]) * (t - i);
    return Math.round(Math.min(1, Math.max(0, value * scale)) * 255);
  };
  return `rgb(${at(ramp.r)},${at(ramp.g)},${at(ramp.b)})`;
}

/**
 * One material, drawn as a repeating tile of its own pieces.
 *
 * Memoised: at a fine gauge a tile is a couple of thousand shapes, and
 * nothing about it changes while a customer drags a plant across the
 * photograph. Without this, every drag frame rebuilds every stone.
 */
export const MaterialGrain = memo(function MaterialGrain({
  id,
  swatch,
  gaugePx,
  sheenId,
  ground = true,
  tile: tileOptions,
}: {
  id: string;
  swatch: SwatchId;
  gaugePx: number;
  sheenId: string;
  /** The dark bed under the pieces. Off for a layer drawn over another. */
  ground?: boolean;
  tile?: TileOptions;
}) {
  const spec = SWATCH_SPECS[swatch];
  const tile = grainTile(spec.shape, gaugePx, tileOptions);
  return (
    <g id={id}>
      {/* The ground the pieces lie on. Darker than the darkest piece,
          because what shows between two stones is the shadow down the
          gap, not more stone. The second layer has none: it has to let
          the first one through. */}
      {ground && (
        <rect
          width={tile.size}
          height={tile.size}
          fill={rampColor(spec.ramp, 0, GROUND)}
        />
      )}
      {tile.grains.map((grain, i) =>
        grain.points ? (
          <path
            key={i}
            d={facetPath(grain.points)}
            transform={`translate(${grain.x.toFixed(2)} ${grain.y.toFixed(2)})`}
            fill={rampColor(spec.ramp, grain.tone)}
          />
        ) : (
          <ellipse
            key={i}
            cx={grain.x.toFixed(2)}
            cy={grain.y.toFixed(2)}
            rx={grain.rx.toFixed(2)}
            ry={grain.ry.toFixed(2)}
            transform={`rotate(${grain.angle.toFixed(1)} ${grain.x.toFixed(2)} ${grain.y.toFixed(2)})`}
            fill={rampColor(spec.ramp, grain.tone)}
          />
        ),
      )}
      {/* The sun on the top of each stone, off one shared gradient. What
          makes a pebble read as round rather than as a grey blob — and
          the last of what `feDiffuseLighting` used to do, at a scale that
          survives being drawn small. */}
      {spec.sheen > 0 &&
        tile.grains
          .filter((grain) => !grain.points)
          .map((grain, i) => (
            <ellipse
              key={`s${i}`}
              cx={grain.x.toFixed(2)}
              cy={grain.y.toFixed(2)}
              rx={grain.rx.toFixed(2)}
              ry={grain.ry.toFixed(2)}
              transform={`rotate(${grain.angle.toFixed(1)} ${grain.x.toFixed(2)} ${grain.y.toFixed(2)})`}
              fill={`url(#${sheenId})`}
              opacity={spec.sheen * (0.5 + grain.tone * 0.5)}
            />
          ))}
    </g>
  );
});

/**
 * What is true of the bed rather than of one piece: patchiness, and the
 * feathered edge.
 *
 * Applied to the shape already painted with the pattern, so
 * `SourceGraphic` is the material itself.
 */
function MaterialFilter({
  id,
  swatch,
  gaugePx,
  pixelsPerFoot,
  edgeBlur,
}: {
  id: string;
  swatch: SwatchId;
  gaugePx: number;
  /** For the mottle, which is measured in feet of bed rather than grain. */
  pixelsPerFoot: number;
  edgeBlur: number;
}) {
  const spec = SWATCH_SPECS[swatch];
  const mottlePx = Math.max(gaugePx * 6, spec.mottle.feet * pixelsPerFoot);
  // Finer than one piece: the wood's own grain, the dust in the gaps, the
  // dirt on a stone. Drawing the pieces got the shapes right and left the
  // surface between and across them perfectly clean, which no material is.
  const finePx = Math.max(0.8, gaugePx * FINE_GRAIN);
  // Just enough to take the vector edge off a piece. A shape cut with a
  // mathematically hard edge is the other half of why a drawn bed reads
  // as drawn — a photograph of gravel has no such edge anywhere in it.
  const soften = Math.max(0.35, gaugePx * EDGE_SOFTEN);
  return (
    // sRGB, not the linearRGB default: every ramp in this file is written
    // in the colour space it is read in. See the file header.
    <filter
      id={id}
      x="-5%"
      y="-5%"
      width="110%"
      height="110%"
      colorInterpolationFilters="sRGB"
    >
      {/* The pieces, with the vector edge taken off them. */}
      <feGaussianBlur in="SourceGraphic" stdDeviation={soften} result="pieces" />
      {/* Grain finer than any one piece, multiplied over all of them. */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency={(1 / finePx).toFixed(4)}
        numOctaves={3}
        seed={spec.shape.seed + 313}
        result="fineNoise"
      />
      <feColorMatrix
        in="fineNoise"
        type="matrix"
        values="0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0 0 0 0 1"
        result="fineGrey"
      />
      {/* fractalNoise sits between 0.40 and 0.62 whatever its frequency,
          so it has to be stretched before a table can use it. */}
      <feComponentTransfer in="fineGrey" result="fineSpread">
        <feFuncR type="linear" slope={4.5} intercept={-1.75} />
        <feFuncG type="linear" slope={4.5} intercept={-1.75} />
        <feFuncB type="linear" slope={4.5} intercept={-1.75} />
      </feComponentTransfer>
      <feComponentTransfer in="fineSpread" result="fine">
        <feFuncR type="table" tableValues={`${FINE_DEPTH} 1`} />
        <feFuncG type="table" tableValues={`${FINE_DEPTH} 1`} />
        <feFuncB type="table" tableValues={`${FINE_DEPTH} 1`} />
      </feComponentTransfer>
      <feComposite
        in="pieces"
        in2="fine"
        operator="arithmetic"
        k1={1}
        k2={0}
        k3={0}
        k4={0}
        result="grained"
      />
      {/* Patchiness at the scale of a few feet of bed: a real bed is
          never one flat tone across twenty of them. */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency={`${(1 / mottlePx).toFixed(5)} ${(1 / (mottlePx * 0.9)).toFixed(5)}`}
        numOctaves={2}
        seed={spec.mottle.seed}
        result="mottleNoise"
      />
      <feColorMatrix
        in="mottleNoise"
        type="matrix"
        values="0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0 0 0 0 1"
        result="mottleGrey"
      />
      {/* The generator's own measured band onto the ramp's full range —
          fractalNoise sits between 0.40 and 0.62, so without this the
          mottle is a constant and does nothing at all. */}
      <feComponentTransfer in="mottleGrey" result="mottleSpread">
        <feFuncR type="linear" slope={3} intercept={-1} />
        <feFuncG type="linear" slope={3} intercept={-1} />
        <feFuncB type="linear" slope={3} intercept={-1} />
      </feComponentTransfer>
      <feComponentTransfer in="mottleSpread" result="mottle">
        <feFuncR type="table" tableValues={`${spec.mottle.depth} 1`} />
        <feFuncG type="table" tableValues={`${spec.mottle.depth} 1`} />
        <feFuncB type="table" tableValues={`${spec.mottle.depth} 1`} />
      </feComponentTransfer>
      {/* k1 alone: the product of the two, i.e. a multiply. */}
      <feComposite
        in="grained"
        in2="mottle"
        operator="arithmetic"
        k1={1}
        k2={0}
        k3={0}
        k4={0}
        result="surface"
      />
      {/* Erode before blurring so the feather fades inward — the material
          must never leak past the region boundary onto the photo. */}
      <feMorphology in="SourceAlpha" operator="erode" radius={edgeBlur} result="eroded" />
      <feGaussianBlur in="eroded" stdDeviation={edgeBlur} result="softEdge" />
      <feComposite in="surface" in2="softEdge" operator="in" />
    </filter>
  );
}

/**
 * The defs a photo canvas needs: one pattern and one filter per region
 * that has been swapped, at that region's own gauge.
 *
 * One set per *material* was enough while the gauge was a constant. It is
 * not any more: two beds in the same photograph, one twenty feet from the
 * camera and one sixty, want the same river rock drawn at different
 * sizes. Regions with nothing swapped get nothing at all.
 */
export type RegionTexture = {
  /** `tex-<regionId>`; band i is `<fillId>-<i>`. */
  fillId: string;
  /** `tex2-<regionId>`: the second layer, painted over the first. */
  overlayId: string;
  /** `texfx-<regionId>`, referenced by the region's filter. */
  filterId: string;
  swatch: SwatchId;
  gaugePx: number;
  pixelsPerFoot: number;
  /**
   * The slices the region is drawn in, each at its own size — a bed
   * recedes, and one stone size edge to edge reads as carpet. One band
   * with a scale of 1 is a region whose photograph said nothing about
   * depth. See `lib/design/perspective.ts`.
   */
  bands: readonly DepthBand[];
};

/**
 * The second layer: a smaller tile, half as many pieces, and a different
 * handful of them out of the same material.
 *
 * 0.71 is not a round fraction on purpose. A tile at half or a third of
 * the first would line up with it every two or three repeats and buy
 * nothing.
 */
const OVERLAY: TileOptions = { tileScale: 0.71, density: 0.55, seedOffset: 977 };

/**
 * The sub-grain, as a fraction of one piece, and how dark it goes.
 *
 * A third of a piece: fine enough to read as the surface of the material
 * rather than as more material, coarse enough to survive being drawn at
 * the size a yard photograph resolves.
 */
const FINE_GRAIN = 0.34;
const FINE_DEPTH = 0.74;

/** How much of the vector edge to take off a piece, as a fraction of it. */
const EDGE_SOFTEN = 0.06;

/** One band's tile: the same pieces, drawn at that band's size. */
function BandPattern({
  id,
  grainId,
  size,
  scale,
}: {
  id: string;
  grainId: string;
  size: number;
  scale: number;
}) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={size}
      height={size}
      patternTransform={scale === 1 ? undefined : `scale(${scale.toFixed(4)})`}
    >
      <use href={`#${grainId}`} />
    </pattern>
  );
}

/** The sun on a stone: one gradient, shared by every piece in every bed. */
function Sheen({ id }: { id: string }) {
  return (
    <radialGradient id={id} cx="0.5" cy="0.5" r="0.5" fx="0.34" fy="0.3">
      <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
      <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.22" />
      <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
    </radialGradient>
  );
}

export function MaterialDefs({
  textures,
  edgeBlur,
}: {
  textures: readonly RegionTexture[];
  edgeBlur: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sheenId = `sheen-${uid}`;
  return (
    <defs>
      <Sheen id={sheenId} />
      {/* The pieces, built once per material and instantiated by every
          band that draws them. A band differs only in how big the tile
          is, which `patternTransform` does for free — generating a
          thousand stones again per band would not. */}
      {textures.map((texture) => (
        <MaterialGrain
          key={texture.fillId}
          id={`${texture.fillId}-grain`}
          swatch={texture.swatch}
          gaugePx={texture.gaugePx}
          sheenId={sheenId}
        />
      ))}
      {/* The same material again, from a different part of the pile, on a
          tile that shares no common multiple with the first. One tile of
          stone across a bed twenty times its width is the same
          arrangement twenty times over, and the eye finds it — it read as
          wallpaper on a bed-width strip. Two periods that never line up
          have a combined period longer than any bed. */}
      {textures.map((texture) => (
        <MaterialGrain
          key={texture.overlayId}
          id={`${texture.overlayId}-grain`}
          swatch={texture.swatch}
          gaugePx={texture.gaugePx}
          sheenId={sheenId}
          ground={false}
          tile={OVERLAY}
        />
      ))}
      {textures.flatMap((texture) =>
        texture.bands.flatMap((band, i) => [
          <BandPattern
            key={`${texture.fillId}-${i}`}
            id={`${texture.fillId}-${i}`}
            grainId={`${texture.fillId}-grain`}
            size={grainTileSize(SWATCH_SPECS[texture.swatch].shape, texture.gaugePx)}
            scale={band.scale}
          />,
          <BandPattern
            key={`${texture.overlayId}-${i}`}
            id={`${texture.overlayId}-${i}`}
            grainId={`${texture.overlayId}-grain`}
            size={grainTileSize(
              SWATCH_SPECS[texture.swatch].shape,
              texture.gaugePx,
              OVERLAY,
            )}
            scale={band.scale}
          />,
        ]),
      )}
      {textures.map((texture) => (
        <MaterialFilter
          key={texture.filterId}
          id={texture.filterId}
          swatch={texture.swatch}
          gaugePx={texture.gaugePx}
          pixelsPerFoot={texture.pixelsPerFoot}
          edgeBlur={edgeBlur}
        />
      ))}
    </defs>
  );
}

/**
 * How much material a picker swatch shows.
 *
 * A swatch is a macro shot, not a view of a yard: nine inches across the
 * square, so a 1.5in river rock is a stone you can see and a 3/8in chip
 * is a chip, at the ratio they actually differ by. Showing them at the
 * gauge the photograph uses would make every swatch the same grey square,
 * which is exactly what a picker must not do.
 */
const SWATCH_INCHES_ACROSS = 9;
const SWATCH_UNITS = 120;

/** Small square preview of a material for the catalog picker. */
export function SwatchChip({ swatch }: { swatch: SwatchId }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fillId = `chip-${uid}-${swatch}`;
  const sheenId = `chipsheen-${uid}`;
  const perInch = SWATCH_UNITS / SWATCH_INCHES_ACROSS;
  return (
    <svg
      viewBox={`0 0 ${SWATCH_UNITS} ${SWATCH_UNITS}`}
      className="h-9 w-9 shrink-0 rounded-md border border-black/10"
      aria-hidden
    >
      <defs>
        <Sheen id={sheenId} />
        <MaterialGrain
          id={`${fillId}-grain`}
          swatch={swatch}
          gaugePx={SWATCH_SPECS[swatch].inches * perInch}
          sheenId={sheenId}
        />
        <BandPattern
          id={fillId}
          grainId={`${fillId}-grain`}
          size={grainTileSize(
            SWATCH_SPECS[swatch].shape,
            SWATCH_SPECS[swatch].inches * perInch,
          )}
          scale={1}
        />
      </defs>
      <rect width={SWATCH_UNITS} height={SWATCH_UNITS} fill={`url(#${fillId})`} />
    </svg>
  );
}
