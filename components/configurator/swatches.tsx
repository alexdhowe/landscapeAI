"use client";

import { useId } from "react";

import type { SwatchId } from "@/lib/catalog/options";

/**
 * Procedural material textures, built from SVG turbulence.
 * Deterministic by construction (fixed seeds) — the visual swap stays a
 * projection of the object graph, and there are no texture assets to
 * license or ship.
 *
 * ---------------------------------------------------------------------
 * Why these are built the way they are
 * ---------------------------------------------------------------------
 * Four faults have been fixed here, and they were found in this order:
 *
 * 1. **The filters ran in linearRGB**, which is the SVG default. Every
 *    ramp was therefore tuned against a colour space nobody was reading
 *    it in: a table value of 0.28 came out at sRGB 0.57, roughly twice as
 *    light as written, so every material landed somewhere between pale
 *    grey and pale beige. Every filter here declares
 *    `color-interpolation-filters="sRGB"`.
 *
 * 2. **The noise was never spread.** Measured, not assumed: a greyed
 *    `feTurbulence` field occupies a narrow band of the 0–1 range — 0.40
 *    to 0.62 for fractalNoise, 0.12 to 0.42 for turbulence — so a colour
 *    table indexed 0..1 only ever used a fifth of itself, and every
 *    material came out a flat wash of its own mid tone. `SPREAD` stretches
 *    each generator's measured band onto the ramp first.
 *
 * 3. **Nothing distinguished a chip from a fibre.** One generator, one
 *    treatment, and river rock at 0.07 against granite chips at 0.09 — a
 *    30% difference in gauge between a 1.5in stone and a 3/8in chip.
 *
 * 4. **The gauge was a fraction of the frame, which is not a gauge.** The
 *    same constant drew a "1.5in river rock" at 29 pixels whether the
 *    photo showed ten feet of yard or fifty; on a 300 sf bed that is a
 *    stone thirteen times life size, and a bed of them reads — the
 *    owner's word — as "goofy". A spec now carries its grain in
 *    **inches**, and `lib/design/scale.ts` turns that into pixels using
 *    the region's own reported area.
 *
 * ---------------------------------------------------------------------
 * Why there is no lighting in here any more
 * ---------------------------------------------------------------------
 * There was: `feDiffuseLighting` over the noise, which gave river rock
 * real pebble relief and a specular sheen, and it looked good at the old
 * enormous gauge. It cannot survive the correct one. `feDiffuseLighting`
 * builds its surface normals from a fixed **three-pixel** kernel, so the
 * lit result is not scale-invariant: measured at a 20px gauge it spans
 * 0.43–0.84 of the range, and at the 5px gauge a real photograph calls
 * for it collapses to 0.63–0.71 — a flat wash again, and with it the
 * whole reason the ramps were retuned.
 *
 * Greyed noise has no such kernel: the same generator measures 0.12–0.42
 * at a 5px gauge and 0.12–0.42 at 20px. So tone comes from the grain
 * itself, and what separates a stone from a shred is the shape of the
 * grain (`turbulence` gives lumps with edges between them,
 * `fractalNoise` with an aspect ratio gives strands), its contrast, and
 * its colour. At the gauge a yard photograph actually resolves — a stone
 * four or five pixels across — that is all that was ever visible anyway.
 */

/** Colour ramp: dark end of the grain → light end, per channel. */
type Ramp = { r: number[]; g: number[]; b: number[] };

type TextureSpec = {
  label: string;
  /**
   * The material's own grain, **in inches of real material**.
   *
   * `inches` is one piece: 1.5 for washed river rock, 3/8 for granite
   * chips. `aspect` is how much longer than wide it lies — 1 for a stone,
   * four-ish for a shred of hardwood mulch, which is what makes mulch
   * read as strands rather than specks.
   */
  grain: {
    type: "fractalNoise" | "turbulence";
    inches: number;
    aspect: number;
    numOctaves: number;
    seed: number;
  };
  ramp: Ramp;
  /**
   * The low-frequency variation that keeps a bed from looking like paint:
   * patches of a real bed are always a little darker than others. `feet`
   * is the size of a patch, so mottling stays a property of the bed
   * rather than of the photograph's framing; `depth` is how dark the
   * darkest patch gets, as a multiplier.
   */
  mottle: { feet: number; seed: number; depth: number };
};

/**
 * Each generator's measured output band, mapped onto the ramp.
 *
 * `[slope, intercept]`, applied before the colour table. Both were
 * measured off a rendered canvas rather than reasoned about, and both are
 * invariant to frequency and octave count — which is the property that
 * makes one number right at every gauge. They map the 5th–95th percentile
 * of the field onto 0.20–0.86, leaving the tails room rather than
 * clipping them flat.
 */
const SPREAD: Record<TextureSpec["grain"]["type"], [number, number]> = {
  // Measured 0.40 / 0.51 / 0.62 at p5 / mean / p95.
  fractalNoise: [3.0, -1.0],
  // Measured 0.12 / 0.26 / 0.42 — |noise|, so it sits low and spreads wide.
  turbulence: [2.16, -0.05],
};

/**
 * The materials.
 *
 * The mid of each ramp is the material's colour in daylight, divided by
 * the mottle's mean (~0.86) so the two together land on it. The
 * photograph's own light takes another ~15% off on top, which is why a
 * granite chip is written here at 0.65 and reads on the picture at about
 * 0.48 — the colour of grey granite in a photograph, not the colour of
 * granite in a showroom.
 */
export const SWATCH_SPECS: Record<SwatchId, TextureSpec> = {
  // -- mulches: soft-edged, matte, lying in strands ---------------------
  mulch_brown: {
    label: "Hardwood",
    grain: { type: "fractalNoise", inches: 1, aspect: 4.5, numOctaves: 4, seed: 7 },
    ramp: {
      r: [0.3, 0.4, 0.49, 0.58, 0.68],
      g: [0.2, 0.27, 0.34, 0.41, 0.49],
      b: [0.12, 0.17, 0.22, 0.28, 0.34],
    },
    mottle: { feet: 3, seed: 47, depth: 0.72 },
  },
  mulch_dark: {
    label: "Dyed brown",
    grain: { type: "fractalNoise", inches: 1, aspect: 4.5, numOctaves: 4, seed: 11 },
    ramp: {
      r: [0.17, 0.24, 0.3, 0.37, 0.44],
      g: [0.11, 0.15, 0.2, 0.25, 0.3],
      b: [0.07, 0.1, 0.14, 0.18, 0.22],
    },
    mottle: { feet: 3, seed: 53, depth: 0.74 },
  },
  mulch_red: {
    label: "Cedar",
    grain: { type: "fractalNoise", inches: 1.1, aspect: 4, numOctaves: 4, seed: 13 },
    ramp: {
      r: [0.36, 0.47, 0.58, 0.68, 0.78],
      g: [0.19, 0.26, 0.33, 0.4, 0.47],
      b: [0.11, 0.16, 0.21, 0.26, 0.31],
    },
    mottle: { feet: 3, seed: 59, depth: 0.74 },
  },
  // -- stone: lumps with edges between them, at their real gauge --------
  stone_gray: {
    label: "River rock",
    // 1.5in washed rock: four times the gauge of the granite chips beside
    // it in the picker, because that is four times the stone.
    grain: { type: "turbulence", inches: 1.5, aspect: 1, numOctaves: 2, seed: 3 },
    // The brightest step is deliberately hot: washed rock has stones that
    // catch the sun, and that top end is what is left of the specular
    // pass this file used to run.
    ramp: {
      r: [0.4, 0.55, 0.7, 0.84, 0.97],
      g: [0.39, 0.54, 0.69, 0.83, 0.96],
      b: [0.36, 0.5, 0.64, 0.78, 0.92],
    },
    mottle: { feet: 3.5, seed: 61, depth: 0.68 },
  },
  stone_granite: {
    label: "Granite",
    grain: { type: "turbulence", inches: 0.375, aspect: 1, numOctaves: 2, seed: 5 },
    ramp: {
      r: [0.38, 0.52, 0.65, 0.78, 0.9],
      g: [0.38, 0.52, 0.65, 0.78, 0.89],
      b: [0.39, 0.53, 0.66, 0.79, 0.91],
    },
    mottle: { feet: 2, seed: 41, depth: 0.7 },
  },
  stone_buff: {
    label: "Limestone",
    grain: { type: "turbulence", inches: 0.75, aspect: 1, numOctaves: 2, seed: 9 },
    ramp: {
      r: [0.6, 0.74, 0.86, 0.94, 1.0],
      g: [0.53, 0.66, 0.79, 0.88, 0.96],
      b: [0.36, 0.48, 0.61, 0.71, 0.82],
    },
    mottle: { feet: 2.5, seed: 43, depth: 0.78 },
  },
  // -- a replanted bed: foliage, not a surface --------------------------
  planting_mixed: {
    label: "Planted",
    grain: { type: "fractalNoise", inches: 6, aspect: 1.1, numOctaves: 3, seed: 21 },
    ramp: {
      r: [0.1, 0.16, 0.22, 0.3, 0.38],
      g: [0.22, 0.32, 0.42, 0.52, 0.62],
      b: [0.08, 0.13, 0.18, 0.24, 0.3],
    },
    mottle: { feet: 3, seed: 21, depth: 0.7 },
  },
};

/** How big one piece of this material is, in inches. */
export function grainInches(swatch: SwatchId): number {
  return SWATCH_SPECS[swatch].grain.inches;
}

/** Averages a noise field's channels into grey, so a ramp gets one signal. */
const TO_GREY =
  "0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0 0 0 0 1";

/**
 * One material filter, at the gauge this photograph calls for.
 *
 * Applying `filter="url(#<id>)"` to a shape replaces its fill with the
 * generated texture, clipped to a feathered (blurred-alpha) edge so a swap
 * sits into the photo instead of on it.
 *
 * `gaugePx` is how many pixels of *this* frame one piece of the material
 * covers — see `lib/design/scale.ts`, which works it out from the
 * region's own reported area. `edgeBlur` is in view units.
 */
export function TextureFilter({
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
  const [slope, intercept] = SPREAD[spec.grain.type];
  // One period per piece, stretched along x for anything that lies in
  // strands rather than sitting as a lump. The floor is a guard, not a
  // design: a sub-pixel frequency is aliasing rather than texture.
  const frequencyX = 1 / Math.max(1.2, gaugePx * spec.grain.aspect);
  const frequencyY = 1 / Math.max(1.2, gaugePx);
  const mottlePx = Math.max(gaugePx * 4, spec.mottle.feet * pixelsPerFoot);
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
      <feTurbulence
        type={spec.grain.type}
        baseFrequency={`${frequencyX.toFixed(5)} ${frequencyY.toFixed(5)}`}
        numOctaves={spec.grain.numOctaves}
        seed={spec.grain.seed}
        result="noise"
      />
      <feColorMatrix in="noise" type="matrix" values={TO_GREY} result="grey" />
      {/* The grain's own measured band onto the ramp's full range.
          Without this every material is a flat wash of its mid tone. */}
      <feComponentTransfer in="grey" result="spread">
        <feFuncR type="linear" slope={slope} intercept={intercept} />
        <feFuncG type="linear" slope={slope} intercept={intercept} />
        <feFuncB type="linear" slope={slope} intercept={intercept} />
      </feComponentTransfer>
      <feComponentTransfer in="spread" result="colored">
        <feFuncR type="table" tableValues={spec.ramp.r.join(" ")} />
        <feFuncG type="table" tableValues={spec.ramp.g.join(" ")} />
        <feFuncB type="table" tableValues={spec.ramp.b.join(" ")} />
      </feComponentTransfer>
      {/* Patchiness at the scale of a few feet of bed: a real bed is
          never one flat tone across twenty of them. */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency={`${(1 / mottlePx).toFixed(5)} ${(1 / (mottlePx * 0.9)).toFixed(5)}`}
        numOctaves={2}
        seed={spec.mottle.seed}
        result="mottleNoise"
      />
      <feColorMatrix in="mottleNoise" type="matrix" values={TO_GREY} result="mottleGrey" />
      <feComponentTransfer in="mottleGrey" result="mottle">
        <feFuncR type="linear" slope={3} intercept={-1} />
        <feFuncG type="linear" slope={3} intercept={-1} />
        <feFuncB type="linear" slope={3} intercept={-1} />
      </feComponentTransfer>
      <feComponentTransfer in="mottle" result="mottleRamp">
        <feFuncR type="table" tableValues={`${spec.mottle.depth} 1`} />
        <feFuncG type="table" tableValues={`${spec.mottle.depth} 1`} />
        <feFuncB type="table" tableValues={`${spec.mottle.depth} 1`} />
      </feComponentTransfer>
      {/* k1 alone: the product of the two, i.e. a multiply. */}
      <feComposite
        in="colored"
        in2="mottleRamp"
        operator="arithmetic"
        k1={1}
        k2={0}
        k3={0}
        k4={0}
        result="surface"
      />
      {/* Erode before blurring so the feather fades inward — the texture
          must never leak past the region boundary onto the photo. */}
      <feMorphology in="SourceAlpha" operator="erode" radius={edgeBlur} result="eroded" />
      <feGaussianBlur in="eroded" stdDeviation={edgeBlur} result="softEdge" />
      <feComposite in="surface" in2="softEdge" operator="in" />
    </filter>
  );
}

/**
 * The filters a photo canvas needs: one per region that has been swapped,
 * at that region's own gauge.
 *
 * One filter per *material* was enough while the gauge was a constant. It
 * is not any more: two beds in the same photograph, one twenty feet from
 * the camera and one sixty, want the same river rock drawn at different
 * sizes. Regions with nothing swapped get no filter at all, which is also
 * fewer than before — the old set built all seven on every render whether
 * anything used them or not.
 */
export type RegionTexture = {
  /** `tex-<regionId>`, referenced by the region's fill. */
  filterId: string;
  swatch: SwatchId;
  gaugePx: number;
  pixelsPerFoot: number;
};

export function SwatchFilters({
  textures,
  edgeBlur,
}: {
  textures: readonly RegionTexture[];
  edgeBlur: number;
}) {
  return (
    <defs>
      {textures.map((texture) => (
        <TextureFilter
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
  const uid = useId();
  const filterId = `chip${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-${swatch}`;
  const perInch = SWATCH_UNITS / SWATCH_INCHES_ACROSS;
  return (
    <svg
      viewBox={`0 0 ${SWATCH_UNITS} ${SWATCH_UNITS}`}
      className="h-9 w-9 shrink-0 rounded-md border border-black/10"
      aria-hidden
    >
      <defs>
        <TextureFilter
          id={filterId}
          swatch={swatch}
          gaugePx={SWATCH_SPECS[swatch].grain.inches * perInch}
          pixelsPerFoot={perInch * 12}
          edgeBlur={0}
        />
      </defs>
      <rect width={SWATCH_UNITS} height={SWATCH_UNITS} filter={`url(#${filterId})`} />
    </svg>
  );
}
