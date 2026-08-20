/**
 * Vision segmentation types.
 *
 * A segmented region is a labeled polygon in normalized image coordinates
 * (0-1, origin top-left). It carries NO quantity: nothing has been measured
 * yet, and per the architectural invariants a picture is never parsed to
 * get a quantity back out. Quantities arrive in Phase 3 from the aerial.
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
  /** Model confidence in the kind + material call, 0-1. */
  confidence: number;
};

export type SegmentationResult = {
  regions: SegmentedRegion[];
  /**
   * Things the model reports it cannot determine from this photo
   * (e.g. "area behind the house", "drainage"). Phase 4 reconciliation
   * consumes this list.
   */
  cannotSee: string[];
  /** "claude" for a real vision call, "demo" for the no-API-key fallback. */
  source: "claude" | "demo";
};

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
