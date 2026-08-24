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
 * the *shape* of a region that already exists — it cannot invent a region,
 * delete one, change its kind, its label, its material or its confidence.
 * Every one of those was established by a pass that could see the
 * unannotated photo, and a second pass looking at a picture with coloured
 * lines drawn on it is not better placed to judge them. If the refinement
 * comes back unusable, the first pass stands.
 */
import type { OutlineLegend } from "../image/annotate";
import { holdRegionsToGround } from "./groundLine";
import type { NormalizedPoint, SegmentedRegion } from "./types";

export function refinementPrompt(legend: readonly OutlineLegend[]): string {
  const lines = legend.map((entry) => `- "${entry.id}" is outlined in ${entry.color}`);
  return `This is the same yard photo, with the region outlines you produced drawn on top of it. Each outline is a different colour, and its vertices are marked with dots:

${lines.join("\n")}

Look at where each coloured outline actually falls against the photograph, and correct it. What to look for, in order:

1. **Edges cut across curves.** A bed boundary is usually a curve and a few vertices cannot follow one — the outline ends up inside the bed in places and out on the lawn in others. Add vertices and put them on the real edge. 20-40 along a curved bed edge is normal.
2. **Outlines that overlap each other**, or that include ground belonging to a different region. Each piece of ground belongs to exactly one region.
3. **Outlines that ride up a vertical surface** — a wall, a step face, a fence — instead of stopping where it meets the ground.
4. **Whole edges in the wrong place**: an outline that stops short of the real boundary, or runs past it.

Return corrected polygons in the same normalized coordinates as before: x and y between 0 and 1, origin at the top-left, x rightward, y downward. Return every region you were given, keyed by the same id. If an outline is already right, return it unchanged.

Respond with ONLY a JSON object, no other text:
{
  "ground_line": [[x, y], [x, y], ...],
  "regions": [
    { "id": "the same id", "polygon": [[x, y], [x, y], ...] }
  ]
}`;
}

/** id → corrected polygon, for whatever came back parseable. */
export type RefinedShapes = {
  polygons: Map<string, NormalizedPoint[]>;
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
export function parseRefinement(text: string, extractJson: (t: string) => string): RefinedShapes {
  const empty: RefinedShapes = { polygons: new Map() };
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    return empty;
  }
  if (data === null || typeof data !== "object") return empty;
  const obj = data as { regions?: unknown; ground_line?: unknown; groundLine?: unknown };
  const polygons = new Map<string, NormalizedPoint[]>();
  if (Array.isArray(obj.regions)) {
    for (const raw of obj.regions) {
      if (raw === null || typeof raw !== "object") continue;
      const r = raw as { id?: unknown; polygon?: unknown };
      if (typeof r.id !== "string" || !r.id.trim()) continue;
      const polygon = points(r.polygon, 3);
      if (polygon) polygons.set(r.id.trim(), polygon);
    }
  }
  const groundLine = points(obj.ground_line ?? obj.groundLine, 2) ?? undefined;
  return groundLine ? { polygons, groundLine } : { polygons };
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
export function mergeRefinement(
  regions: readonly SegmentedRegion[],
  refined: RefinedShapes,
): SegmentedRegion[] {
  const merged = regions.map((region) => {
    const polygon = refined.polygons.get(region.id);
    if (!polygon) return region;
    const before = doubleArea(region.polygon);
    const after = doubleArea(polygon);
    if (before <= 0) return region;
    const ratio = after / before;
    if (ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) return region;
    return { ...region, polygon };
  });
  // The refinement reports the ground line again, having now seen where its
  // own outlines fell against the house. Same enforcement as the first pass.
  return holdRegionsToGround(merged, refined.groundLine);
}
