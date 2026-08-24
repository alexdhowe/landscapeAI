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
import { holdRegionsToGround } from "./groundLine";
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
  "ground_line": [[x, y], [x, y], ...],
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
  groundLine?: NormalizedPoint[];
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
  const obj = data as { regions?: unknown; ground_line?: unknown; groundLine?: unknown };
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
  const groundLine = points(obj.ground_line ?? obj.groundLine, 2) ?? undefined;
  return groundLine ? { polygons, plantings, groundLine } : { polygons, plantings };
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

function refinePlantings(
  plantings: Planting[] | undefined,
  refined: Map<string, RefinedEllipse>,
): Planting[] | undefined {
  if (!plantings || plantings.length === 0) return plantings;
  return plantings.map((plant) => {
    const next = refined.get(plant.id);
    if (!next) return plant;
    const moved = Math.hypot(next.cx - plant.cx, next.cy - plant.cy);
    if (moved > MAX_PLANT_MOVE) return plant;
    const rxRatio = next.rx / plant.rx;
    const ryRatio = next.ry / plant.ry;
    for (const ratio of [rxRatio, ryRatio]) {
      if (ratio < MIN_PLANT_RADIUS_RATIO || ratio > MAX_PLANT_RADIUS_RATIO) return plant;
    }
    // Its identity, its label and the customer's choice about it all stay
    // attached to the id; only where and how big it is can move.
    return { ...plant, cx: next.cx, cy: next.cy, rx: next.rx, ry: next.ry };
  });
}

export function mergeRefinement(
  regions: readonly SegmentedRegion[],
  refined: RefinedShapes,
): SegmentedRegion[] {
  const merged = regions.map((region) => {
    const plantings = refinePlantings(region.plantings, refined.plantings);
    const withPlants = plantings === region.plantings ? region : { ...region, plantings };
    const polygon = refined.polygons.get(region.id);
    if (!polygon) return withPlants;
    const before = doubleArea(region.polygon);
    const after = doubleArea(polygon);
    if (before <= 0) return withPlants;
    const ratio = after / before;
    if (ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) return withPlants;
    return { ...withPlants, polygon };
  });
  // The refinement reports the ground line again, having now seen where its
  // own outlines fell against the house. Same enforcement as the first pass.
  return holdRegionsToGround(merged, refined.groundLine);
}
