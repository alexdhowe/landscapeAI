/**
 * Pure parser for the vision model's segmentation response. No I/O — the
 * Claude call lives in classify.ts; this module turns untrusted model text
 * into a validated SegmentationResult and is unit-tested in isolation.
 */
import { holdRegionsToGround } from "./groundLine";
import type {
  NormalizedPoint,
  Planting,
  RegionKind,
  SegmentationResult,
  SegmentedRegion,
  VerticalElement,
  VerticalElementKind,
} from "./types";
import { REGION_KINDS, VERTICAL_ELEMENT_KINDS } from "./types";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Model output may wrap JSON in prose or a ```json fence — extract it. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function parsePoints(raw: unknown, minimum: number): NormalizedPoint[] | null {
  if (!Array.isArray(raw)) return null;
  const points: NormalizedPoint[] = [];
  for (const pt of raw) {
    if (
      Array.isArray(pt) &&
      pt.length >= 2 &&
      typeof pt[0] === "number" &&
      typeof pt[1] === "number" &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1])
    ) {
      points.push([clamp01(pt[0]), clamp01(pt[1])]);
    } else if (
      pt !== null &&
      typeof pt === "object" &&
      typeof (pt as { x?: unknown }).x === "number" &&
      typeof (pt as { y?: unknown }).y === "number"
    ) {
      const { x, y } = pt as { x: number; y: number };
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push([clamp01(x), clamp01(y)]);
      }
    }
  }
  return points.length >= minimum ? points : null;
}

/** A polygon needs at least 3 vertices to enclose anything. */
function parsePolygon(raw: unknown): NormalizedPoint[] | null {
  return parsePoints(raw, 3);
}

/** A polyline needs two. The ground line across a photo is often exactly two. */
function parsePolyline(raw: unknown): NormalizedPoint[] | null {
  return parsePoints(raw, 2);
}

/**
 * How many plants are worth carrying per region.
 *
 * The list exists to stop gravel being painted over a shrub, and a bed
 * with thirty separate entries is a model enumerating ground cover leaf by
 * leaf rather than naming the shrubs. Past this point the extra shapes
 * cost render time and buy nothing.
 */
const MAX_PLANTINGS_PER_REGION = 24;

/**
 * The smallest plant worth punching out of a swap: below this an ellipse
 * is a speck that only stipples the new material.
 */
const MIN_PLANTING_RADIUS = 0.004;

function parsePlantings(raw: unknown, regionId: string): Planting[] {
  if (!Array.isArray(raw)) return [];
  const plantings: Planting[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const nums = [e.cx, e.cy, e.rx, e.ry];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const [cx, cy, rx, ry] = nums as number[];
    // A radius is a fraction of the frame, so half the picture is already
    // absurd for one shrub; clamping rather than dropping keeps a merely
    // over-generous guess usable.
    const clampR = (r: number) => Math.min(0.5, Math.abs(r));
    if (clampR(rx) < MIN_PLANTING_RADIUS || clampR(ry) < MIN_PLANTING_RADIUS) continue;
    plantings.push({
      id: `${regionId}_plant_${plantings.length + 1}`,
      cx: clamp01(cx),
      cy: clamp01(cy),
      rx: clampR(rx),
      ry: clampR(ry),
      label: asString(e.label),
    });
    if (plantings.length >= MAX_PLANTINGS_PER_REGION) break;
  }
  return plantings;
}

function parseKind(raw: unknown): RegionKind | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((REGION_KINDS as string[]).includes(normalized)) {
    return normalized as RegionKind;
  }
  // Common synonyms the model may emit.
  if (normalized === "lawn" || normalized === "grass") return "turf";
  if (normalized === "planting_bed" || normalized === "garden_bed" || normalized === "mulch_bed") {
    return "bed";
  }
  if (
    normalized === "patio" ||
    normalized === "walkway" ||
    normalized === "driveway" ||
    normalized === "paving"
  ) {
    return "hardscape";
  }
  return null;
}

/** Sanity ceiling on the photo's footprint guess — a yard, not a ranch. */
const MAX_ESTIMATED_AREA_SF = 100_000;

function parseEstimatedAreaSf(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.round(Math.min(raw, MAX_ESTIMATED_AREA_SF));
}

function parseVerticalKind(raw: unknown): VerticalElementKind | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((VERTICAL_ELEMENT_KINDS as string[]).includes(normalized)) {
    return normalized as VerticalElementKind;
  }
  // Common synonyms the model may emit.
  if (normalized === "wall" || normalized === "seat_wall") return "retaining_wall";
  if (normalized === "stairs" || normalized === "step") return "steps";
  if (normalized === "slope" || normalized === "grade" || normalized === "berm") {
    return "grade_change";
  }
  if (normalized === "planter" || normalized === "planter_box") return "raised_bed";
  return null;
}

function parseVerticalElements(raw: unknown): VerticalElement[] {
  if (!Array.isArray(raw)) return [];
  const elements: VerticalElement[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const kind = parseVerticalKind(e.kind);
    const description = asString(e.description);
    if (!kind || !description) continue;
    elements.push({
      kind,
      description,
      confidence:
        typeof e.confidence === "number" && Number.isFinite(e.confidence)
          ? clamp01(e.confidence)
          : 0.5,
    });
  }
  return elements;
}

/**
 * Parse model text into a SegmentationResult. Invalid regions are dropped
 * rather than failing the whole response; throws only when no JSON object
 * can be recovered at all.
 */
export function parseSegmentation(
  text: string,
  source: SegmentationResult["source"] = "claude",
): SegmentationResult {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    throw new Error("Vision response contained no parseable JSON");
  }
  if (data === null || typeof data !== "object") {
    throw new Error("Vision response JSON was not an object");
  }

  const obj = data as {
    regions?: unknown;
    ground_line?: unknown;
    groundLine?: unknown;
    vertical_elements?: unknown;
    verticalElements?: unknown;
    cannot_see?: unknown;
    cannotSee?: unknown;
  };
  const rawRegions = Array.isArray(obj.regions) ? obj.regions : [];

  const regions: SegmentedRegion[] = [];
  rawRegions.forEach((raw, i) => {
    if (raw === null || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const kind = parseKind(r.kind);
    const polygon = parsePolygon(r.polygon);
    if (!kind || !polygon) return;
    const confidence =
      typeof r.confidence === "number" && Number.isFinite(r.confidence)
        ? clamp01(r.confidence)
        : 0.5;
    const regionId = asString(r.id) ?? `region_${i + 1}`;
    const plantings = parsePlantings(r.plantings, regionId);
    regions.push({
      id: regionId,
      kind,
      label: asString(r.label) ?? `Region ${i + 1}`,
      polygon,
      ...(plantings.length > 0 ? { plantings } : {}),
      existingMaterial: asString(r.existing_material) ?? asString(r.existingMaterial),
      condition: asString(r.condition),
      estimatedAreaSf:
        parseEstimatedAreaSf(r.estimated_area_sf) ??
        parseEstimatedAreaSf(r.estimatedAreaSf),
      confidence,
    });
  });

  const rawCannotSee = obj.cannot_see ?? obj.cannotSee;
  const cannotSee = Array.isArray(rawCannotSee)
    ? rawCannotSee.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];

  // The prompt has always forbidden outlining the house; this is where
  // that stops being a request. A region drawn up the wall is pulled back
  // down to the ground line, and one drawn entirely on the wall is
  // dropped. Without a usable ground line nothing moves.
  const groundLine = parsePolyline(obj.ground_line ?? obj.groundLine) ?? undefined;

  return {
    regions: holdRegionsToGround(regions, groundLine),
    verticalElements: parseVerticalElements(obj.vertical_elements ?? obj.verticalElements),
    cannotSee,
    source,
  };
}
