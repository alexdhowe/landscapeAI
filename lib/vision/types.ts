/**
 * Vision segmentation types.
 *
 * A segmented region is a labeled polygon in normalized image coordinates
 * (0-1, origin top-left). It carries NO priced quantity: per the
 * architectural invariants a picture is never the source of a quantity the
 * customer is billed from. Quantities arrive from the aerial (Phase 3).
 *
 * Phase 4 makes the photo the SECOND SENSOR: it also reports existing
 * material and condition per region, vertical elements the aerial cannot
 * see, a rough visible-footprint estimate used ONLY as a QA cross-check
 * against the aerial number (lib/measure/reconcile.ts), and what it cannot
 * determine at all.
 */

export type RegionKind = "turf" | "bed" | "hardscape" | "foundation_planting";

/** [x, y] in normalized image coordinates, 0-1, origin top-left. */
export type NormalizedPoint = [number, number];

export type SegmentedRegion = {
  id: string;
  kind: RegionKind;
  /** Short human label, e.g. "Front lawn", "Bed along walkway". */
  label: string;
  polygon: NormalizedPoint[];
  /** What appears to be there now, e.g. "hardwood mulch", "concrete". */
  existingMaterial?: string;
  /** Observed condition, e.g. "faded, weeds coming through". Photo-only. */
  condition?: string;
  /**
   * Rough visible ground footprint in square feet. A QA signal for
   * reconciliation against the aerial ONLY — never priced, never rendered
   * to a customer, never stored as the region's quantity. Aerial wins
   * horizontal area; this exists so the two sensors can disagree loudly.
   */
  estimatedAreaSf?: number;
  /** Model confidence in the kind + material call, 0-1. */
  confidence: number;
};

export type VerticalElementKind =
  | "retaining_wall"
  | "steps"
  | "fence"
  | "grade_change"
  | "raised_bed"
  | "other";

/**
 * Something vertical the photo can see and the aerial cannot: walls,
 * steps, fences, grade changes. The photo is authoritative for these —
 * they surface as scope notes and rep-visit items, never as measured
 * quantities.
 */
export type VerticalElement = {
  kind: VerticalElementKind;
  /** Short human description, e.g. "timber retaining wall along driveway". */
  description: string;
  /** Model confidence the element is present, 0-1. */
  confidence: number;
};

export type SegmentationResult = {
  regions: SegmentedRegion[];
  /** Vertical elements present in the photo. Photo wins these outright. */
  verticalElements: VerticalElement[];
  /**
   * Things the model reports it cannot determine from this photo
   * (e.g. "area behind the house", "drainage"). Phase 4 reconciliation
   * consumes this list.
   */
  cannotSee: string[];
  /** "claude" for a real vision call, "demo" for the no-API-key fallback. */
  source: "claude" | "demo";
};

export const VERTICAL_ELEMENT_KINDS: VerticalElementKind[] = [
  "retaining_wall",
  "steps",
  "fence",
  "grade_change",
  "raised_bed",
  "other",
];

export const REGION_KINDS: RegionKind[] = [
  "turf",
  "bed",
  "hardscape",
  "foundation_planting",
];

export const REGION_KIND_LABELS: Record<RegionKind, string> = {
  turf: "Lawn",
  bed: "Planting bed",
  hardscape: "Hardscape",
  foundation_planting: "Foundation planting",
};
