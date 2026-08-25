/**
 * The second look at the outlines.
 *
 * The first pass produces the right areas with the wrong edges — a curved
 * bed comes back as a few straight chords, covering lawn on one side and
 * missing bed on the other. That is what a model can do when asked to
 * produce coordinates blind. Asking it to *correct* an outline it can see
 * drawn on the photograph is a different and much easier question, so the
 * first answer is rendered onto the picture (`lib/image/annotate.ts`) and
 * sent back with this prompt.
 *
 * Everything here is pure: the prompt text, the parse, and the merge. The
 * call itself lives in classify.ts.
 *
 * The merge is deliberately conservative. A refinement may only replace
 * the *shape* of a region, or of a plant standing in one, that already
 * exists — it cannot invent either, delete either, or change a region's
 * kind, label, material or confidence.
 * Every one of those was established by a pass that could see the
 * unannotated photo, and a second pass looking at a picture with coloured
 * lines drawn on it is not better placed to judge them. If the refinement
 * comes back unusable, the first pass stands.
 */
import type { OutlineLegend } from "../image/annotate";
import type { NormalizedPoint, Planting, SegmentedRegion } from "./types";

export function refinementPrompt(legend: readonly OutlineLegend[]): string {
  const lines = legend.map((entry) => `- "${entry.id}" is outlined in ${entry.color}`);
  return `This is the same yard photo, with the region outlines you produced drawn on top of it. Each outline is a different colour, and its vertices are marked with dots:

${lines.join("\n")}

Look at where each coloured outline actually falls against the photograph, and correct it. What to look for, in order:

1. **A straight line where the real edge curves.** This is the most common fault and the easiest to see: look along each outline and find any segment that cuts a chord across a curving bed edge, leaving bed on one side of the line and lawn on the other. Add vertices there and put them on the real edge. 20-40 along a curved bed edge is normal.
2. **An outline running across the bed's hard border.** Most beds are edged with river-rock cobbles, steel edging, brick or a paver course. That border is not part of the bed. If the outline sits on top of the border or outside it, move it to the INNER edge — where the mulch actually stops — so the border sits outside the outline. An outline drawn across a cobble border paints gravel over the border the homeowner already has.
3. **Outlines that overlap each other**, or that include ground belonging to a different region. Each piece of ground belongs to exactly one region.
4. **Outlines that ride up a vertical surface** — a wall, a step face, a fence — instead of stopping where it meets the ground.
5. **Whole edges in the wrong place**: an outline that stops short of the real boundary, or runs past it.

The rings inside each outline are the plants you found, in the same colour as the region they stand in. Correct these too, and be strict about them: a ring that is a few percent off is the difference between a plant staying put when the homeowner swaps the mulch and gravel being painted across its leaves. Move each ring onto its plant and size it to cover the whole visible mass including the outer foliage. Keep the same ids — you are moving the plants you already found, not finding new ones.

Return corrected shapes in the same normalized coordinates as before: x and y between 0 and 1, origin at the top-left, x rightward, y downward. Return every region you were given, keyed by the same id. If something is already right, return it unchanged.

Respond with ONLY a JSON object, no other text:
{
  "regions": [
    {
      "id": "the same id",
      "polygon": [[x, y], [x, y], ...],
      "plantings": [
        { "id": "the same plant id", "cx": x, "cy": y, "rx": r, "ry": r }
      ]
    }
  ]
}`;
}

/** id → corrected shape, for whatever came back parseable. */
export type RefinedEllipse = { cx: number; cy: number; rx: number; ry: number };

export type RefinedShapes = {
  polygons: Map<string, NormalizedPoint[]>;
  /** Keyed by planting id, flat across regions — the ids are unique. */
  plantings: Map<string, RefinedEllipse>;
};

function points(raw: unknown, minimum: number): NormalizedPoint[] | null {
  if (!Array.isArray(raw)) return null;
  const out: NormalizedPoint[] = [];
  for (const pt of raw) {
    if (
      Array.isArray(pt) &&
      typeof pt[0] === "number" &&
      typeof pt[1] === "number" &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1])
    ) {
      out.push([Math.min(1, Math.max(0, pt[0])), Math.min(1, Math.max(0, pt[1]))]);
    }
  }
  return out.length >= minimum ? out : null;
}

/** Parse a refinement response. Never throws: an unusable body is no shapes. */
function ellipse(raw: unknown): RefinedEllipse | null {
  if (raw === null || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const nums = [e.cx, e.cy, e.rx, e.ry];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [cx, cy, rx, ry] = nums as number[];
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const radius = (v: number) => Math.min(0.5, Math.abs(v));
  if (radius(rx) <= 0 || radius(ry) <= 0) return null;
  return { cx: clamp01(cx), cy: clamp01(cy), rx: radius(rx), ry: radius(ry) };
}

export function parseRefinement(text: string, extractJson: (t: string) => string): RefinedShapes {
  const empty: RefinedShapes = { polygons: new Map(), plantings: new Map() };
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    return empty;
  }
  if (data === null || typeof data !== "object") return empty;
  // A `ground_line` the model volunteers anyway is read and dropped on the
  // floor: this pass does not get to move the ground. See mergeRefinement.
  const obj = data as { regions?: unknown };
  const polygons = new Map<string, NormalizedPoint[]>();
  const plantings = new Map<string, RefinedEllipse>();
  if (Array.isArray(obj.regions)) {
    for (const raw of obj.regions) {
      if (raw === null || typeof raw !== "object") continue;
      const r = raw as { id?: unknown; polygon?: unknown; plantings?: unknown };
      if (typeof r.id !== "string" || !r.id.trim()) continue;
      const polygon = points(r.polygon, 3);
      if (polygon) polygons.set(r.id.trim(), polygon);
      if (Array.isArray(r.plantings)) {
        for (const rawPlant of r.plantings) {
          if (rawPlant === null || typeof rawPlant !== "object") continue;
          const id = (rawPlant as { id?: unknown }).id;
          if (typeof id !== "string" || !id.trim()) continue;
          const shape = ellipse(rawPlant);
          if (shape) plantings.set(id.trim(), shape);
        }
      }
    }
  }
  return { polygons, plantings };
}

/**
 * How much of a region's outline a second look may move.
 *
 * These were 0.5 and 2, written on the assumption that the first pass is
 * roughly right and the second pass nudges an edge. A real photograph
 * showed that assumption failing in the direction nobody had planned for.
 *
 * On a brick house with a black mulch bed, the first pass placed *every*
 * region about 0.2 of the frame too high — bed on the wall, plants on the
 * shutters, and a ground line to match, all internally consistent and all
 * wrong. The second pass, which could see its own outlines drawn on the
 * photograph, corrected all of it: bed onto the mulch, lawn onto the
 * grass, driveway onto the concrete, every plant onto its shrub.
 *
 * The merge then kept one correction out of three. The bed passed at 1.55.
 * The lawn — inflated by the first pass to 43.1% of the frame because it
 * included a slab of house — came back at 16.1%, a ratio of **0.37**, and
 * was refused. The driveway went 0.4% → 1.0%, a ratio of **2.37**, and was
 * refused. Both refusals were corrections *away from* a badly wrong answer.
 *
 * That is the shape of the problem: when the first pass is wholesale wrong,
 * every correction worth having is a large one, and a bound tuned for
 * nudges rejects exactly the corrections that matter most. So the bounds
 * are wide now — wide enough to admit a wholesale relocation, tight enough
 * that a collapsed or exploded polygon is still refused.
 */
const MIN_AREA_RATIO = 0.2;
const MAX_AREA_RATIO = 5;

function doubleArea(polygon: readonly NormalizedPoint[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum);
}

/**
 * Take the corrected shapes onto the first pass's regions.
 *
 * Shape only, and only within bounds. Anything else about a region — kind,
 * label, material, condition, footprint estimate, confidence, the plants
 * standing in it — is carried through untouched.
 */
/**
 * How far a plant may be corrected.
 *
 * Nudging a ring onto the shrub it was drawn beside is the point. Moving
 * it across the bed is a different claim — most likely the model matching
 * ids to the wrong plants — and the first pass, which found these plants
 * in the first place, is the better authority on which is which. Same
 * reasoning for the radii: growing a ring to cover foliage the first pass
 * clipped is a correction; a tenfold change is a disagreement.
 */
const MAX_PLANT_MOVE = 0.15;
const MIN_PLANT_RADIUS_RATIO = 0.4;
const MAX_PLANT_RADIUS_RATIO = 2.5;

/**
 * Which correction belongs to which plant.
 *
 * The prompt asks the second pass to return the ids it was given. On a
 * real photograph it returned `plant_1 … plant_8` for plants this pass
 * calls `front_corner_mulch_bed_plant_1 …`, and every one of seven
 * corrections was dropped on an exact string comparison — reported as
 * `plants 0/0`, which reads as "nothing was offered" rather than "nothing
 * matched". The customer kept a set of rings sitting on the brickwork.
 *
 * Asking more firmly is not a fix; a model shortening an id it was told to
 * echo is ordinary. So the match tolerates one id being a tail of the
 * other, which is exactly the shortening observed and cannot collide:
 * plant ids are `<regionId>_plant_<n>`, so a tail match still pins the
 * number, and the region is already fixed by the loop that calls this.
 */
function plantIdMatches(ours: string, theirs: string): boolean {
  if (ours === theirs) return true;
  const a = ours.toLowerCase();
  const b = theirs.toLowerCase();
  return a.endsWith(`_${b}`) || b.endsWith(`_${a}`);
}

/** The correction offered for this plant, however the model spelled the id. */
export function findPlantCorrection(
  plant: Planting,
  refined: ReadonlyMap<string, RefinedEllipse>,
): RefinedEllipse | undefined {
  const exact = refined.get(plant.id);
  if (exact) return exact;
  for (const [id, shape] of refined) {
    if (plantIdMatches(plant.id, id)) return shape;
  }
  return undefined;
}

/** The mean of a ring's vertices. Enough to say how far a region moved. */
function centroid(ring: readonly NormalizedPoint[]): NormalizedPoint {
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  return [x / ring.length, y / ring.length];
}

/**
 * How far the region a plant stands in was itself corrected.
 *
 * A plant may move that far and then some. When the second pass is fixing
 * a systematic error it moves the bed and everything standing in it by the
 * same amount, and a fixed allowance rejects the whole set — the plants
 * most in need of correction being, by definition, the ones furthest out.
 * A plant flung across a bed that did not move is still refused, which is
 * what the allowance was protecting against in the first place.
 */
function plantAllowance(
  before: readonly NormalizedPoint[] | undefined,
  after: readonly NormalizedPoint[] | undefined,
): number {
  if (!before || !after || before.length === 0 || after.length === 0) return MAX_PLANT_MOVE;
  const [bx, by] = centroid(before);
  const [ax, ay] = centroid(after);
  return MAX_PLANT_MOVE + Math.hypot(ax - bx, ay - by);
}

/**
 * Is this correction to a region's outline one we will take?
 *
 * Split out from the merge so that counting what a refinement changed and
 * actually changing it cannot drift apart. `summarizeRefinement` reports
 * the same decision this makes, from the same constants — the alternative
 * was a tally that re-derived the bounds and slowly stopped agreeing with
 * them.
 */
export function polygonCorrectionAccepted(
  before: readonly NormalizedPoint[],
  after: readonly NormalizedPoint[],
): boolean {
  const was = doubleArea(before);
  if (was <= 0) return false;
  const ratio = doubleArea(after) / was;
  return ratio >= MIN_AREA_RATIO && ratio <= MAX_AREA_RATIO;
}

/**
 * Is this correction to a plant's ellipse one we will take?
 *
 * `allowance` is how far this plant's own region moved, plus the nudge the
 * plant is allowed on its own; see `plantAllowance`.
 */
export function plantCorrectionAccepted(
  before: Planting,
  after: RefinedEllipse,
  allowance: number = MAX_PLANT_MOVE,
): boolean {
  if (Math.hypot(after.cx - before.cx, after.cy - before.cy) > allowance) return false;
  for (const ratio of [after.rx / before.rx, after.ry / before.ry]) {
    if (ratio < MIN_PLANT_RADIUS_RATIO || ratio > MAX_PLANT_RADIUS_RATIO) return false;
  }
  return true;
}

/**
 * The transform a region's own accepted correction implies.
 *
 * Taken from the bounding boxes rather than fitted, because the thing being
 * captured is coarse — the region went from *there* to *here*, this much
 * smaller — and a least-squares fit over two polygons with different vertex
 * counts would be precision this does not have.
 */
type BoxTransform = { sx: number; sy: number; bx: number; by: number; ax: number; ay: number };

function boundingBox(ring: readonly NormalizedPoint[]) {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function boxTransform(
  before: readonly NormalizedPoint[],
  after: readonly NormalizedPoint[],
): BoxTransform | null {
  if (before.length < 3 || after.length < 3) return null;
  const b = boundingBox(before);
  const a = boundingBox(after);
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  if (bw <= 0 || bh <= 0) return null;
  return { sx: (a.x1 - a.x0) / bw, sy: (a.y1 - a.y0) / bh, bx: b.x0, by: b.y0, ax: a.x0, ay: a.y0 };
}

const through = (t: BoxTransform, cx: number, cy: number): NormalizedPoint => [
  t.ax + (cx - t.bx) * t.sx,
  t.ay + (cy - t.by) * t.sy,
];

/**
 * How far from where a plant is *expected* to be a correction may be claimed
 * for it. Generous, because the expectation is a coarse box transform; small
 * enough that two shrubs a bed apart cannot be swapped.
 */
const MAX_PLANT_SNAP = 0.12;

/**
 * Move a region's plants with the region.
 *
 * Matching corrections to plants by id does not work and cannot be made to.
 * Asked twice to echo the ids it was given, the same model returned
 * `plant_1 … plant_8` on one run and `shrub_1 … shrub_8` on the next, for
 * plants this pass calls `front_foundation_bed_plant_1 …`. Nine plants, then
 * eight, renamed differently each time. No amount of instruction fixes a
 * model that is re-describing what it sees rather than relabelling a list.
 *
 * So the id is a hint and the geometry is the authority. When a region's own
 * outline correction is accepted, that correction says where everything
 * standing in the region went — so each plant is carried through the same
 * transform, and the model's ellipse is claimed for it only if one landed
 * near where the plant is now expected to be.
 *
 * The fallback matters as much as the match. A plant left where it was while
 * its region moves ends up **outside its own region**: the mask punches a
 * hole in nothing, and the glyph and its tap target render on the brickwork.
 * That is what "a couple of weird plants up in the air" looks like, and it
 * is not a cosmetic problem — it is a plant the customer cannot tap and a
 * shrub that gets gravel painted over it.
 */
function refinePlantings(
  plantings: Planting[] | undefined,
  refined: ReadonlyMap<string, RefinedEllipse>,
  before: readonly NormalizedPoint[],
  taken: readonly NormalizedPoint[] | undefined,
): { plantings: Planting[] | undefined; matched: number; carried: number } {
  if (!plantings || plantings.length === 0) {
    return { plantings, matched: 0, carried: 0 };
  }
  const transform = taken ? boxTransform(before, taken) : null;
  const allowance = plantAllowance(before, taken);
  const claimed = new Set<RefinedEllipse>();
  let matched = 0;
  let carried = 0;

  const next = plantings.map((plant) => {
    // An id the model did echo is the strongest signal there is.
    const byId = findPlantCorrection(plant, refined);
    if (byId && !claimed.has(byId) && plantCorrectionAccepted(plant, byId, allowance)) {
      claimed.add(byId);
      matched += 1;
      return { ...plant, cx: byId.cx, cy: byId.cy, rx: byId.rx, ry: byId.ry };
    }
    // Otherwise: where does this region's correction say the plant went, and
    // did a corrected ellipse land near there?
    if (!transform) return plant;
    const [px, py] = through(transform, plant.cx, plant.cy);
    let best: RefinedEllipse | undefined;
    let bestDistance = MAX_PLANT_SNAP;
    for (const shape of refined.values()) {
      if (claimed.has(shape)) continue;
      const distance = Math.hypot(shape.cx - px, shape.cy - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = shape;
      }
    }
    if (best) {
      claimed.add(best);
      matched += 1;
      return { ...plant, cx: best.cx, cy: best.cy, rx: best.rx, ry: best.ry };
    }
    // Nothing claimed it, but its region still moved. Carry it along rather
    // than leaving it stranded outside the region it belongs to.
    carried += 1;
    return {
      ...plant,
      cx: px,
      cy: py,
      rx: plant.rx * Math.abs(transform.sx),
      ry: plant.ry * Math.abs(transform.sy),
    };
  });

  return { plantings: next, matched, carried };
}

/**
 * What a second look actually bought, counted.
 *
 * The refinement costs a whole extra vision call per upload against the
 * thirty-second budget in map section 2, and until this existed nothing
 * measured either side of that trade. Elapsed time alone does not settle
 * it: a pass that takes four seconds and has most of its corrections
 * refused by the bounds above is a different problem from one that takes
 * four seconds and lands every one of them. The first is a merge to
 * loosen, the second is a model to make faster.
 *
 * "Offered" counts shapes that came back for something the first pass
 * found; a correction for an id nobody recognises is not offered to
 * anything and is not counted.
 */
export type RefinementTally = {
  outlinesOffered: number;
  outlinesAccepted: number;
  plantsOffered: number;
  plantsAccepted: number;
  /**
   * Plants nothing was offered for, moved with their region's own accepted
   * correction. Reported because it is the difference between a plant that
   * followed its bed and one stranded on the wall behind it.
   */
  plantsCarried: number;
};

export function summarizeRefinement(
  regions: readonly SegmentedRegion[],
  refined: RefinedShapes,
): RefinementTally {
  const tally: RefinementTally = {
    outlinesOffered: 0,
    outlinesAccepted: 0,
    plantsOffered: 0,
    plantsAccepted: 0,
    plantsCarried: 0,
  };
  for (const region of regions) {
    const polygon = refined.polygons.get(region.id);
    const takeShape = polygon !== undefined && polygonCorrectionAccepted(region.polygon, polygon);
    if (polygon) {
      tally.outlinesOffered += 1;
      if (takeShape) tally.outlinesAccepted += 1;
    }
    // Counted from the same routine the merge uses, so the line and the
    // regions cannot come to disagree about what was kept.
    const { matched, carried } = refinePlantings(
      region.plantings,
      refined.plantings,
      region.polygon,
      takeShape ? polygon : undefined,
    );
    tally.plantsOffered += (region.plantings ?? []).length;
    tally.plantsAccepted += matched;
    tally.plantsCarried += carried;
  }
  return tally;
}

export function mergeRefinement(
  regions: readonly SegmentedRegion[],
  refined: RefinedShapes,
): SegmentedRegion[] {
  const merged = regions.map((region) => {
    const polygon = refined.polygons.get(region.id);
    const takeShape = polygon !== undefined && polygonCorrectionAccepted(region.polygon, polygon);
    // The plants move with the region they stand in.
    const { plantings } = refinePlantings(
      region.plantings,
      refined.plantings,
      region.polygon,
      takeShape ? polygon : undefined,
    );
    const withPlants = plantings === region.plantings ? region : { ...region, plantings };
    return takeShape ? { ...withPlants, polygon: polygon! } : withPlants;
  });
  // The refinement does NOT get to re-decide the ground line, and this is
  // the one place that rule was broken. It used to re-run the clamp with
  // the second pass's own line, on the theory that a pass which had seen
  // where its outlines fell was better placed to say where the ground is.
  //
  // It is not, and a real yard proved it. On a photo of a raised
  // stone-walled bed the second pass returned a ground line along the
  // bottom edge of the frame; every region was pulled down onto it, and a
  // 27-point bed covering 25.5% of the picture became a 0.2% ribbon along
  // the wall. The customer saw a scribble where their bed was.
  //
  // It is the same principle as every other field here: everything except
  // shape was established by the pass that saw the unannotated photograph,
  // and a pass looking at a picture with coloured lines drawn all over it
  // is a worse judge of it, not a better one. A ground line is emphatically
  // one of those things. The first pass's line has already been applied by
  // the time these regions arrive.
  return merged;
}
