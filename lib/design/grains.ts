/**
 * The individual pieces a material is made of.
 *
 * ---------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------
 * Every material in this app used to be one `feTurbulence` field, greyed
 * and pushed through a colour table. Four real faults were found and
 * fixed in that pipeline — the wrong colour space, an unspread noise
 * band, one generator serving six materials, a gauge that was a fraction
 * of the frame — and after all four it still did not look like anything,
 * because of a fifth fault underneath them:
 *
 *   **Turbulence is a cloud. Gravel is objects.**
 *
 * A noise field is continuous. It has no edges, so it has no pieces, so
 * whatever colour it is given it reads as a *fabric* — which is the word
 * for what a bed of "washed river rock" actually looked like on the first
 * real photograph: flat grey weave with darker blotches in it. No amount
 * of retuning a ramp fixes that, because the thing missing is not tone.
 * It is that a stone has an outline, its neighbour has a different
 * outline, and there is a shadow in the gap between them.
 *
 * A previous pass tried to buy that back with `feDiffuseLighting`, which
 * does give a noise field relief. It had to come out: the lighting
 * primitives build their normals from a fixed three-pixel kernel, so the
 * result is not scale-invariant — measured across 0.43–0.84 of the range
 * at a 20px gauge and a flat 0.63–0.71 at the 5px gauge a real yard photo
 * calls for. Relief that disappears at the size the material is actually
 * drawn is not relief.
 *
 * ---------------------------------------------------------------------
 * What this does instead
 * ---------------------------------------------------------------------
 * Draws the pieces. A jittered lattice of grains at the material's own
 * gauge, each with its own size, rotation and tone, laid over a dark
 * ground so the gaps between them read as the shadow they are. Three
 * shapes, because three things behave differently in a bed:
 *
 *   **pebble** — washed river rock: rounded, near-round in plan, and
 *   glossy enough that the sun catches the top of each stone.
 *   **chip** — crushed granite and limestone: angular facets with flat
 *   faces, which is what "crushed" means and what makes a chip read as
 *   quarried rather than tumbled.
 *   **strand** — shredded mulch: long, thin, lying every which way, with
 *   far more overlap than stone because that is how a mulch bed packs.
 *
 * The whole tile is generated deterministically from a seed, so the swap
 * stays a projection of the object graph and there are no texture assets
 * to license or ship.
 *
 * ---------------------------------------------------------------------
 * Seamless by construction
 * ---------------------------------------------------------------------
 * The tile repeats, so any grain crossing an edge is emitted again on the
 * opposite side. SVG clips pattern content to the tile, so the two halves
 * meet exactly and the repeat has no visible grid in it.
 *
 * Pure. A gauge in, geometry out.
 */

/** How one material's pieces are shaped and packed. */
export type GrainShape = {
  kind: "pebble" | "chip" | "strand";
  /** How much longer than wide one piece lies. */
  aspect: number;
  /**
   * Centre-to-centre spacing, as a multiple of the piece's own **longest**
   * dimension. Below 1 the pieces overlap, which is what a real bed does:
   * nothing lies in a single layer.
   *
   * Longest, not width, because of what happened when it was width. A
   * shred six times longer than it is wide, spaced by its width, needs a
   * tile sixty pieces across to hold six shred-lengths — far past what a
   * browser should draw — so the tile came out barely longer than one
   * shred, and a tile that small *is* the motif. A bed of mulch repeated
   * as visible houndstooth. Spacing by the long axis keeps the piece
   * count sane and the tile several pieces across, which is the ratio
   * that actually decides whether a repeat can be seen.
   */
  packing: number;
  /** How far the tone of one piece strays from the middle of the ramp. */
  toneSpread: number;
  seed: number;
};

/** One piece of the material, in tile units. */
export type Grain = {
  x: number;
  y: number;
  /** Half-length along the piece's own long axis, and across it. */
  rx: number;
  ry: number;
  /** Degrees. */
  angle: number;
  /** 0 at the dark end of the material's ramp, 1 at the light end. */
  tone: number;
  /** Corners, for an angular chip. Absent for anything rounded. */
  points?: [number, number][];
};

export type GrainTile = {
  /** The tile's edge, in the same units as the gauge it was built at. */
  size: number;
  grains: Grain[];
};

/**
 * How to vary one tile from another of the same material.
 *
 * This exists for one reason: **a tile repeats, and the eye finds it.**
 * A few hundred pixels of stone across a few thousand pixels of bed is
 * six or seven copies of the same arrangement, and however evenly the
 * tones are spread, the same outlines in the same places read as
 * wallpaper. It was plainly visible on a bed-width strip.
 *
 * The fix is a second layer of the same material at a tile size that
 * shares no common multiple with the first, drawn over it with no ground
 * of its own. Two periods that do not line up have a combined period
 * longer than any bed, so there is nothing left to recognise — the same
 * trick a printer uses to keep two screens from moiring, run backwards.
 */
export type TileOptions = {
  /** The tile's edge, as a multiple of its natural size. */
  tileScale?: number;
  /** How many pieces, as a fraction of what a full tile holds. */
  density?: number;
  /** Different pieces out of the same material. */
  seedOffset?: number;
  /** Skip the geometry: `grainTileSize` only wants the measurement. */
  sizeOnly?: boolean;
};

/**
 * How big a tile is, and how much geometry it is allowed to cost.
 *
 * Two things fight. A tile small against the bed repeats visibly — the
 * clone-stamp fill next door learned that the hard way, tiling a
 * thumbnail of mulch six times across one hole and reading as a stamped
 * pattern. A tile large enough to never repeat is a lot of geometry for
 * a browser to hold and for React to diff on every drag frame.
 *
 * So: aim for a tile a few hundred pixels across, and stop adding pieces
 * at a cap. Fine grain hits the cap and gets a smaller tile, which is the
 * right way round — a 3px mulch fibre has no period the eye can lock on
 * to, while a 12px stone very much does, and a stone's tile stays big.
 */
const TARGET_TILE_PX = 320;
const MAX_ACROSS = 34;
const MIN_ACROSS = 6;

/**
 * How many pieces long a tile has to be before the tile stops being the
 * pattern. Two is a motif; six is a material.
 */
const PIECES_ACROSS_A_TILE = 6;

/**
 * The range one piece's size runs over, as a multiple of the gauge.
 *
 * Wide, and drawn squared so the small end is where most of them land.
 * A narrow range reads as manufactured — which is what a bed of it looked
 * like next to the real mulch beside it in a photograph.
 */
const SMALLEST = 0.45;
const LARGEST = 2.0;

/** How much of a shred's extra length shows up as extra thickness. */
const THICKENING = 0.4;

/** Deterministic, and the same everywhere: no Math.random in a render. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Three uniforms into something bell-shaped, so a bed is mostly its own
 * colour with a few light and dark pieces in it, rather than an even
 * sweep from black to white.
 *
 * An attempt to spread the tones *evenly* rather than randomly — stepping
 * by the golden ratio, which fills 0..1 better than any random draw — is
 * recorded here because it failed instructively. Pieces are generated in
 * lattice order, so the index that walks the tones is also the position:
 * tone ended up correlated with x, and a bed of gravel came out in
 * vertical stripes. Evenness in value is worth nothing if it buys
 * structure in space.
 */
function bell(random: () => number): number {
  return (random() + random() + random()) / 3;
}

/** An angular outline for a crushed chip: a jittered polygon. */
function facets(
  random: () => number,
  rx: number,
  ry: number,
  angle: number,
): [number, number][] {
  const corners = 5 + Math.floor(random() * 3);
  const turn = (angle * Math.PI) / 180;
  const points: [number, number][] = [];
  for (let i = 0; i < corners; i++) {
    // Uneven steps around the circle, so no chip is a regular polygon —
    // crushed stone has no two faces the same.
    const theta = ((i + 0.35 + random() * 0.5) / corners) * Math.PI * 2;
    const reach = 0.62 + random() * 0.38;
    const px = Math.cos(theta) * rx * reach;
    const py = Math.sin(theta) * ry * reach;
    points.push([
      px * Math.cos(turn) - py * Math.sin(turn),
      px * Math.sin(turn) + py * Math.cos(turn),
    ]);
  }
  return points;
}

/**
 * Just the tile's edge, without building the pieces in it.
 *
 * A pattern element needs the size to declare its tile; the geometry
 * inside it is instantiated once and referenced, so nothing is served by
 * generating a thousand stones twice.
 */
export function grainTileSize(
  shape: GrainShape,
  gaugePx: number,
  options: TileOptions = {},
): number {
  return grainTile(shape, gaugePx, { ...options, sizeOnly: true }).size;
}

/**
 * One tile of material at this gauge.
 *
 * `gaugePx` is the width of a single piece in the units the pattern will
 * be drawn in — see `lib/design/scale.ts`, which derives it from the
 * region's own reported area, so a 1.5in stone is drawn at 1.5 inches.
 */
export function grainTile(
  shape: GrainShape,
  gaugePx: number,
  options: TileOptions = {},
): GrainTile {
  const { tileScale = 1, density = 1, seedOffset = 0, sizeOnly = false } = options;
  const width = Math.max(1.2, gaugePx);
  const length = width * Math.max(1, shape.aspect);
  const spacing = length * shape.packing;
  // Big enough that a piece is small against the tile, or the tile is
  // the thing you see; and never so big it is a browser's problem.
  const wanted = Math.max(TARGET_TILE_PX, length * PIECES_ACROSS_A_TILE);
  const across = Math.max(
    MIN_ACROSS,
    Math.round(
      Math.min(MAX_ACROSS, Math.max(MIN_ACROSS, wanted / spacing)) * tileScale,
    ),
  );
  const size = across * spacing;
  if (sizeOnly) return { size, grains: [] };
  const random = rng(shape.seed + seedOffset);
  const grains: Grain[] = [];

  // Stones and chips go on a jittered lattice, because they lie in one
  // layer and the lattice is what guarantees the ground is covered
  // without drawing four times as many of them.
  //
  // Shreds do not. A shred is five times longer than the lattice step
  // that would space it, so a lattice puts every piece's centre on a grid
  // an eye can still find under all that overlap — measured on the first
  // contact sheet as diagonal banding across a mulch bed. They are
  // scattered instead, and there are more of them to make up for the
  // clumping that scattering brings, which is anyway what a mulch bed
  // does.
  // A layer that is not covering the ground has no reason to sit on a
  // lattice, and every reason not to: a sparse lattice is a polka dot.
  const scattered = shape.kind === "strand" || density < 1;
  const count = Math.round(
    across * across * density * (shape.kind === "strand" ? 1.35 : 1),
  );

  for (let i = 0; i < count; i++) {
    const x = scattered
      ? random() * size
      : ((i % across) + 0.5 + (random() - 0.5) * 0.9) * spacing;
    const y = scattered
      ? random() * size
      : (Math.floor(i / across) + 0.5 + (random() - 0.5) * 0.9) * spacing;
    // Squared, so most pieces are small and a few are large. A uniform
    // draw gives every piece nearly the same size, and a bed where every
    // piece is the same size is the single loudest tell that a material
    // was drawn rather than photographed: real mulch and real gravel run
    // from dust to chunks.
    const scale = SMALLEST + (LARGEST - SMALLEST) * random() ** 2;
    // A big stone is bigger both ways; a long shred is not thicker. Mulch
    // is shredded off a log, so the pieces vary in length far more than
    // in thickness — scaling both together turned the large end of the
    // distribution into blobs, which is what a bed of it looked like next
    // to the real thing.
    const thickness = shape.kind === "strand" ? scale ** THICKENING : scale;
    const rx = (width * shape.aspect * scale) / 2;
    const ry = (width * thickness) / 2;
    const angle = random() * 360;
    const tone = Math.min(
      1,
      Math.max(0, 0.5 + (bell(random) - 0.5) * 2 * shape.toneSpread),
    );
    const grain: Grain = { x, y, rx, ry, angle, tone };
    if (shape.kind === "chip") grain.points = facets(random, rx, ry, angle);
    grains.push(grain);
  }

  // Anything crossing an edge, again on the far side. The pattern clips
  // content to the tile, so the two halves of a stone meet exactly.
  const wrapped: Grain[] = [];
  for (const grain of grains) {
    const reach = Math.max(grain.rx, grain.ry);
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        if (dx === 0 && dy === 0) continue;
        const x = grain.x + dx;
        const y = grain.y + dy;
        if (x + reach < 0 || x - reach > size) continue;
        if (y + reach < 0 || y - reach > size) continue;
        wrapped.push({ ...grain, x, y });
      }
    }
  }

  return { size, grains: [...grains, ...wrapped] };
}

/** A chip's outline as path data, at its own centre. */
export function facetPath(points: readonly [number, number][]): string {
  return `${points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ")}Z`;
}
