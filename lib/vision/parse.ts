/**
 * Pure parser for the vision model's segmentation response. No I/O — the
 * Claude call lives in classify.ts; this module turns untrusted model text
 * into a validated SegmentationResult and is unit-tested in isolation.
 */
import type {
  NormalizedPoint,
  RegionKind,
  SegmentationResult,
  SegmentedRegion,
} from "./types";
import { REGION_KINDS } from "./types";

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

function parsePolygon(raw: unknown): NormalizedPoint[] | null {
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
  // A polygon needs at least 3 vertices to enclose anything.
  return points.length >= 3 ? points : null;
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

  const obj = data as { regions?: unknown; cannot_see?: unknown; cannotSee?: unknown };
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
    regions.push({
      id: asString(r.id) ?? `region_${i + 1}`,
      kind,
      label: asString(r.label) ?? `Region ${i + 1}`,
      polygon,
      existingMaterial: asString(r.existing_material) ?? asString(r.existingMaterial),
      confidence,
    });
  });

  const rawCannotSee = obj.cannot_see ?? obj.cannotSee;
  const cannotSee = Array.isArray(rawCannotSee)
    ? rawCannotSee.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];

  return { regions, cannotSee, source };
}
