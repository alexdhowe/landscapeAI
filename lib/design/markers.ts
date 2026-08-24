/**
 * Where the region name sits on the photo.
 *
 * The overlay's name markers were placed at each polygon's centroid,
 * clamped away from the frame edge, and nothing else. That was fine
 * against the four-colour test fixture, where the regions are quadrants
 * and their centroids are a third of the picture apart. Against a real
 * photograph of a real yard it is not: a front lawn that wraps the walk
 * and the walk itself have centroids a few percent apart, both clamp to
 * roughly the middle of the frame, and one marker lands squarely on top
 * of the other. The result is one region with no visible name and a
 * stack of two pills that reads as a rendering fault.
 *
 * So placement is a function, here, rather than an expression inlined in
 * two components. It clamps, and then it pushes markers apart until they
 * do not overlap — vertically, because a marker is a wide, short pill and
 * vertical is the cheap direction to move in.
 *
 * Pure: coordinates in, coordinates out, no DOM. Both the customer's
 * interactive canvas and the contractor's server-rendered one use it, and
 * `__tests__/markers.test.ts` is where the rule lives.
 */

/** A polygon in normalised [0,1] photo coordinates. */
type Placeable = { id: string; polygon: [number, number][] };

export type MarkerPlacement = {
  id: string;
  /** Fraction of the photo's width, for the marker's centre. */
  x: number;
  /** Fraction of the photo's height, for the marker's centre. */
  y: number;
};

export type MarkerLayoutOptions = {
  /**
   * How far from the frame a marker's centre may sit. A marker is centred
   * on its point, so one at x=0.04 has half of itself outside the picture,
   * and a clipped label reads as a bug rather than as a region that
   * happens to hug the frame.
   */
  inset?: number;
  /** Vertical clearance between two markers, as a fraction of the height. */
  minGapY?: number;
  /**
   * Horizontal reach of a marker, as a fraction of the width. Two markers
   * further apart than this never overlap however close their rows are, so
   * they are left where their regions are.
   */
  overlapX?: number;
};

const DEFAULTS = {
  // A pill is ~28px tall on a 390px-wide 4:3 photo, so ~0.09 of the
  // height; 0.085 keeps a hairline of air between two stacked names.
  inset: 0.18,
  minGapY: 0.085,
  // Region names run long ("Bed along front walk"), so a marker covers a
  // wide slice of a phone-width photo.
  overlapX: 0.42,
} satisfies Required<MarkerLayoutOptions>;

function centroid(polygon: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return [x / polygon.length, y / polygon.length];
}

function verticalExtent(polygon: [number, number][]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [, py] of polygon) {
    if (py < min) min = py;
    if (py > max) max = py;
  }
  return [min, max];
}

/**
 * Marker positions for a set of regions, in the order they were given.
 *
 * Order-independent by construction: placement walks the regions top to
 * bottom (ties broken left to right, then by id), so the same regions
 * shuffled produce the same picture. Terminating by construction too —
 * there is a fixed ladder of candidate offsets and the first free one
 * wins, falling back to the clamped centroid if the ladder runs out.
 */
export function layoutRegionMarkers(
  regions: readonly Placeable[],
  options: MarkerLayoutOptions = {},
): MarkerPlacement[] {
  const inset = options.inset ?? DEFAULTS.inset;
  const minGapY = options.minGapY ?? DEFAULTS.minGapY;
  const overlapX = options.overlapX ?? DEFAULTS.overlapX;
  const lo = Math.min(inset, 0.5);
  const hi = Math.max(1 - inset, 0.5);
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));

  const seeds = regions.map((region) => {
    const [cx, cy] = centroid(region.polygon);
    // A name that has been nudged out of the region it names is a new
    // problem in place of the old one — "Front lawn" ends up over the
    // house. So each marker gets its own vertical range: inside its
    // region's extent, and inside the frame. Where those two cannot both
    // hold (a region hugging the top edge), the frame wins, because a
    // half-clipped label is worse than one sitting just off its shape.
    const [top, bottom] = verticalExtent(region.polygon);
    const room = Math.min(minGapY / 2, (bottom - top) / 2);
    const regionLo = Math.max(lo, top + room);
    const regionHi = Math.min(hi, bottom - room);
    const ordered = regionLo <= regionHi;
    const hold = (v: number) =>
      ordered ? Math.min(regionHi, Math.max(regionLo, v)) : clamp(v);
    return { id: region.id, x: clamp(cx), y: hold(cy), hold };
  });

  // Top to bottom, so a stack resolves downward from its highest member
  // rather than depending on which region the model happened to list first.
  const order = [...seeds].sort(
    (a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1),
  );

  // 0, then alternating below/above by whole gaps. Four rungs is two
  // markers either way, which is past the point where a fifth name in one
  // spot is a segmentation problem rather than a layout one.
  const ladder = [0, 1, -1, 2, -2, 3, -3, 4, -4].map((n) => n * minGapY);

  // Every candidate is a sum of gaps, so an exactly-one-gap separation is
  // the common case and lands a bit either side of the real number. Test
  // it with a tolerance, or the first correct answer gets rejected and the
  // marker walks off down the ladder looking for a worse one.
  const EPSILON = 1e-9;

  const placed: MarkerPlacement[] = [];
  for (const seed of order) {
    const free = (y: number) =>
      placed.every(
        (p) =>
          Math.abs(p.x - seed.x) >= overlapX - EPSILON ||
          Math.abs(p.y - y) >= minGapY - EPSILON,
      );
    // Two passes, in order of preference: first look for a clear spot
    // inside the region, then — only if the region is too small to hold
    // one — anywhere in the frame. Legible beats well-placed: two names
    // on top of each other cost a customer a whole region, and a name a
    // little off its shape costs them a glance.
    let chosen: number | null = null;
    for (const hold of [seed.hold, clamp]) {
      for (const offset of ladder) {
        const y = hold(seed.y + offset);
        if (free(y)) {
          chosen = y;
          break;
        }
      }
      if (chosen !== null) break;
    }
    placed.push({ id: seed.id, x: seed.x, y: chosen ?? seed.hold(seed.y) });
  }

  const byId = new Map(placed.map((p) => [p.id, p]));
  return regions.map(
    (region) => byId.get(region.id) ?? { id: region.id, x: 0.5, y: 0.5 },
  );
}
