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
 * A refinement that halves a region or doubles it is not tightening an
 * edge, it is disagreeing with the first pass about what the region *is* —
 * and the pass that could see the unannotated photograph is the better
 * judge of that. Bounded, so the worst a bad refinement can do is leave
 * the first answer in place.
 */
const MIN_AREA_RATIO = 0.5;
const MAX_AREA_RATIO = 2;

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

/** Is this correction to a plant's ellipse one we will take? */
export function plantCorrectionAccepted(before: Planting, after: RefinedEllipse): boolean {
  if (Math.hypot(after.cx - before.cx, after.cy - before.cy) > MAX_PLANT_MOVE) return false;
  for (const ratio of [after.rx / before.rx, after.ry / before.ry]) {
    if (ratio < MIN_PLANT_RADIUS_RATIO || ratio > MAX_PLANT_RADIUS_RATIO) return false;
  }
  return true;
}

function refinePlantings(
  plantings: Planting[] | undefined,
  refined: Map<string, RefinedEllipse>,
): Planting[] | undefined {
  if (!plantings || plantings.length === 0) return plantings;
  return plantings.map((plant) => {
    const next = refined.get(plant.id);
    if (!next || !plantCorrectionAccepted(plant, next)) return plant;
    // Its identity, its label and the customer's choice about it all stay
    // attached to the id; only where and how big it is can move.
    return { ...plant, cx: next.cx, cy: next.cy, rx: next.rx, ry: next.ry };
  });
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
  };
  for (const region of regions) {
    const polygon = refined.polygons.get(region.id);
    if (polygon) {
      tally.outlinesOffered += 1;
      if (polygonCorrectionAccepted(region.polygon, polygon)) tally.outlinesAccepted += 1;
    }
    for (const plant of region.plantings ?? []) {
      const next = refined.plantings.get(plant.id);
      if (!next) continue;
      tally.plantsOffered += 1;
      if (plantCorrectionAccepted(plant, next)) tally.plantsAccepted += 1;
    }
  }
  return tally;
}

export function mergeRefinement(
  regions: readonly SegmentedRegion[],
  refined: RefinedShapes,
): SegmentedRegion[] {
  const merged = regions.map((region) => {
    const plantings = refinePlantings(region.plantings, refined.plantings);
    const withPlants = plantings === region.plantings ? region : { ...region, plantings };
    const polygon = refined.polygons.get(region.id);
    if (!polygon || !polygonCorrectionAccepted(region.polygon, polygon)) return withPlants;
    return { ...withPlants, polygon };
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
