"use client";

import { useId } from "react";

import type { SwatchId } from "@/lib/catalog/options";

/**
 * Procedural material textures built from SVG turbulence + lighting.
 * Deterministic by construction (fixed seeds) — the visual swap stays a
 * projection of the object graph, and there are no texture assets to
 * license or ship.
 *
 * ---------------------------------------------------------------------
 * Why these are built the way they are
 * ---------------------------------------------------------------------
 * The first version of this file mapped one noise field through a colour
 * table and stopped. Swapping mulch for granite then read, in the owner's
 * words, as "it kind of just colors the mulch gray" — and it was three
 * separate faults, all of which are fixed here:
 *
 * 1. **The filters ran in linearRGB**, which is the SVG default. Every
 *    ramp in the old file was therefore tuned against a colour space
 *    nobody was reading it in: a table value of 0.28 came out at sRGB
 *    0.57, roughly twice as light as written, which is why every material
 *    landed somewhere between pale grey and pale beige. Every filter here
 *    declares `color-interpolation-filters="sRGB"`, so a ramp value is the
 *    colour it says it is.
 *
 * 2. **The noise was never spread.** `feTurbulence` fractalNoise averaged
 *    across its channels lands between 0.40 and 0.62 — measured, not
 *    assumed — so a colour table indexed 0..1 only ever used its middle
 *    fifth and every material came out nearly flat. `spread` stretches the
 *    field it is given onto the full range first; the numbers in it are
 *    measured from the same generator they scale.
 *
 * 3. **Nothing distinguished a chip from a fibre.** One generator, one
 *    grain size, one flat treatment. A 3/8in granite chip, a 1.5in washed
 *    river rock and a shred of hardwood mulch do not look alike at any
 *    distance: stone has relief and catches light, mulch is matte and runs
 *    in strands, and stone of different gauges is a different size on the
 *    picture. So a spec now carries its own grain, its own relief and its
 *    own gauge.
 *
 * A fourth thing was doing most of the damage and does not live here: the
 * photograph's own shading is multiplied back over the texture, and it was
 * being multiplied back *unblurred*, which put the old mulch's grain and
 * the old mulch's darkness straight through the new material. See
 * `PhotoCanvas`'s `photo-shading` filter.
 */

/** Colour ramp: dark end of the grain → light end, per channel. */
type Ramp = { r: number[]; g: number[]; b: number[] };

type TextureSpec = {
  label: string;
  /**
   * The material's own grain. `[x, y]` base frequency at a 1600px-wide
   * reference image, so a period of 1/0.13 ≈ 8px is roughly a 3/8in chip
   * in a photo of a bed taken from the driveway. Anisotropic frequencies
   * make strands rather than specks, which is what shredded mulch is.
   */
  grain: {
    type: "fractalNoise" | "turbulence";
    baseFrequency: [number, number];
    numOctaves: number;
    seed: number;
  };
  /**
   * Stone is lit: individual pieces have a sunlit face and a shaded one,
   * and washed rock has a wet sheen. Mulch is matte and gets `null` — a
   * lit mulch reads as gravel, which is precisely the confusion this file
   * exists to remove.
   */
  relief: {
    surfaceScale: number;
    azimuth: number;
    elevation: number;
    specular?: { constant: number; exponent: number };
  } | null;
  /**
   * `[slope, intercept]` mapping the grain's measured range onto 0..1
   * before the ramp is applied. Measured per generator: unlit noise sits
   * in 0.40–0.62, a lit fine grain in 0.51–0.79, a lit coarse one in
   * 0.33–0.82.
   */
  spread: [number, number];
  ramp: Ramp;
  /**
   * The low-frequency variation that keeps a bed from looking like paint:
   * patches of a stone bed are always a little darker than others.
   * `depth` is how dark the darkest patch gets, as a multiplier.
   */
  mottle: { baseFrequency: number; seed: number; depth: number };
};

/**
 * The materials.
 *
 * The mid of each ramp is the material's colour in daylight, divided by
 * the mottle's mean (~0.86) so the two together land on it. The
 * photograph's shading takes another ~15% off on top, which is why a
 * granite chip is written here at 0.65 and reads on the picture at about
 * 0.48 — the colour of grey granite in a photograph, not the colour of
 * granite in a showroom.
 */
export const SWATCH_SPECS: Record<SwatchId, TextureSpec> = {
  // -- mulches: matte, fibrous, running in strands ----------------------
  mulch_brown: {
    label: "Hardwood",
    grain: { type: "fractalNoise", baseFrequency: [0.03, 0.28], numOctaves: 4, seed: 7 },
    relief: null,
    spread: [3.0, -1.0],
    ramp: {
      r: [0.3, 0.4, 0.49, 0.58, 0.68],
      g: [0.2, 0.27, 0.34, 0.41, 0.49],
      b: [0.12, 0.17, 0.22, 0.28, 0.34],
    },
    mottle: { baseFrequency: 0.022, seed: 47, depth: 0.72 },
  },
  mulch_dark: {
    label: "Dyed brown",
    grain: { type: "fractalNoise", baseFrequency: [0.03, 0.28], numOctaves: 4, seed: 11 },
    relief: null,
    spread: [3.0, -1.0],
    ramp: {
      r: [0.17, 0.24, 0.3, 0.37, 0.44],
      g: [0.11, 0.15, 0.2, 0.25, 0.3],
      b: [0.07, 0.1, 0.14, 0.18, 0.22],
    },
    mottle: { baseFrequency: 0.022, seed: 53, depth: 0.74 },
  },
  mulch_red: {
    label: "Cedar",
    grain: { type: "fractalNoise", baseFrequency: [0.028, 0.24], numOctaves: 4, seed: 13 },
    relief: null,
    spread: [3.0, -1.0],
    ramp: {
      r: [0.36, 0.47, 0.58, 0.68, 0.78],
      g: [0.19, 0.26, 0.33, 0.4, 0.47],
      b: [0.11, 0.16, 0.21, 0.26, 0.31],
    },
    mottle: { baseFrequency: 0.022, seed: 59, depth: 0.74 },
  },
  // -- stone: lit, with a gauge you can see -----------------------------
  stone_gray: {
    label: "River rock",
    // 1.5in washed rock: the coarsest grain here, lit hard enough that
    // individual stones have a top and a side, with a wet sheen on top.
    grain: { type: "turbulence", baseFrequency: [0.035, 0.038], numOctaves: 2, seed: 3 },
    relief: {
      surfaceScale: 7,
      azimuth: 230,
      elevation: 38,
      specular: { constant: 0.45, exponent: 28 },
    },
    spread: [2.04, -0.67],
    ramp: {
      r: [0.42, 0.56, 0.7, 0.82, 0.93],
      g: [0.41, 0.55, 0.69, 0.81, 0.92],
      b: [0.38, 0.51, 0.65, 0.76, 0.87],
    },
    mottle: { baseFrequency: 0.02, seed: 61, depth: 0.68 },
  },
  stone_granite: {
    label: "Granite",
    // 3/8in chips: a much finer grain than the river rock beside it, and
    // that difference is the whole point — the two were within 30% of
    // each other before, so the picker offered two swatches of the same
    // grey noise under different names.
    grain: { type: "turbulence", baseFrequency: [0.13, 0.14], numOctaves: 2, seed: 5 },
    relief: {
      surfaceScale: 5,
      azimuth: 230,
      elevation: 42,
      specular: { constant: 0.3, exponent: 30 },
    },
    spread: [3.5, -1.8],
    ramp: {
      r: [0.4, 0.53, 0.65, 0.77, 0.9],
      g: [0.4, 0.53, 0.65, 0.77, 0.89],
      b: [0.41, 0.54, 0.66, 0.78, 0.91],
    },
    mottle: { baseFrequency: 0.05, seed: 41, depth: 0.7 },
  },
  stone_buff: {
    label: "Limestone",
    // Buff limestone screenings, between the two in gauge and matte
    // rather than washed — no sheen.
    grain: { type: "turbulence", baseFrequency: [0.09, 0.095], numOctaves: 2, seed: 9 },
    relief: { surfaceScale: 5, azimuth: 230, elevation: 44 },
    spread: [3.2, -1.6],
    ramp: {
      r: [0.62, 0.75, 0.87, 0.95, 1.0],
      g: [0.55, 0.68, 0.8, 0.89, 0.96],
      b: [0.38, 0.5, 0.62, 0.72, 0.82],
    },
    mottle: { baseFrequency: 0.04, seed: 43, depth: 0.78 },
  },
  // -- a replanted bed: foliage, not a surface --------------------------
  planting_mixed: {
    label: "Planted",
    grain: { type: "fractalNoise", baseFrequency: [0.05, 0.055], numOctaves: 3, seed: 21 },
    relief: null,
    spread: [3.0, -1.0],
    ramp: {
      r: [0.1, 0.16, 0.22, 0.3, 0.38],
      g: [0.22, 0.32, 0.42, 0.52, 0.62],
      b: [0.08, 0.13, 0.18, 0.24, 0.3],
    },
    mottle: { baseFrequency: 0.03, seed: 21, depth: 0.7 },
  },
};

const REFERENCE_WIDTH = 1600;

/** Averages a noise field's channels into grey, so a ramp gets one signal. */
const TO_GREY =
  "0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0.34 0.34 0.34 0 0 0 0 0 0 1";

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
  const [slope, intercept] = spec.spread;
  const relief = spec.relief;
  // Where the tone comes from: the lit surface for stone, the grain
  // itself — flattened to grey — for anything matte.
  const toned = relief ? "lit" : "grey";
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
        baseFrequency={`${spec.grain.baseFrequency[0] / f} ${spec.grain.baseFrequency[1] / f}`}
        numOctaves={spec.grain.numOctaves}
        seed={spec.grain.seed}
        result="noise"
      />
      {relief ? (
        <feDiffuseLighting
          in="noise"
          lightingColor="#ffffff"
          surfaceScale={relief.surfaceScale}
          diffuseConstant={1}
          result="lit"
        >
          <feDistantLight azimuth={relief.azimuth} elevation={relief.elevation} />
        </feDiffuseLighting>
      ) : (
        <feColorMatrix in="noise" type="matrix" values={TO_GREY} result="grey" />
      )}
      {/* The grain's own range onto the ramp's. Without this every
          material is a flat wash of its own mid tone. */}
      <feComponentTransfer in={toned} result="spread">
        <feFuncR type="linear" slope={slope} intercept={intercept} />
        <feFuncG type="linear" slope={slope} intercept={intercept} />
        <feFuncB type="linear" slope={slope} intercept={intercept} />
      </feComponentTransfer>
      <feComponentTransfer in="spread" result="colored">
        <feFuncR type="table" tableValues={spec.ramp.r.join(" ")} />
        <feFuncG type="table" tableValues={spec.ramp.g.join(" ")} />
        <feFuncB type="table" tableValues={spec.ramp.b.join(" ")} />
      </feComponentTransfer>
      {/* Patchiness at a scale well above the grain: a real bed is never
          one flat tone across twenty feet. */}
      <feTurbulence
        type="fractalNoise"
        baseFrequency={`${spec.mottle.baseFrequency / f} ${(spec.mottle.baseFrequency * 1.1) / f}`}
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
        result="mottled"
      />
      {relief?.specular ? (
        <>
          <feSpecularLighting
            in="noise"
            surfaceScale={relief.surfaceScale}
            specularConstant={relief.specular.constant}
            specularExponent={relief.specular.exponent}
            lightingColor="#ffffff"
            result="sheen"
          >
            <feDistantLight azimuth={relief.azimuth} elevation={relief.elevation + 17} />
          </feSpecularLighting>
          <feComposite
            in="sheen"
            in2="mottled"
            operator="arithmetic"
            k1={0}
            k2={0.5}
            k3={1}
            k4={0}
            result="surface"
          />
        </>
      ) : null}
      {/* Erode before blurring so the feather fades inward — the texture
          must never leak past the region boundary onto the photo. */}
      <feMorphology in="SourceAlpha" operator="erode" radius={edgeBlur} result="eroded" />
      <feGaussianBlur in="eroded" stdDeviation={edgeBlur} result="softEdge" />
      <feComposite in={relief?.specular ? "surface" : "mottled"} in2="softEdge" operator="in" />
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
        {/* A tenth of the canvas width, so the chip shows the material at
            about the gauge the photo will: a swatch of grain ten times too
            fine is a grey square whichever stone it claims to be. */}
        <TextureFilter id={filterId} swatch={swatch} width={160} edgeBlur={0} />
      </defs>
      <rect width="120" height="120" filter={`url(#${filterId})`} />
    </svg>
  );
}
