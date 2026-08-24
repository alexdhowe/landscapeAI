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

/**
 * A plant standing in a region — a shrub, a grass, a perennial clump.
 *
 * An ellipse rather than a polygon: shrubs are blobby, four numbers is a
 * tenth of the output tokens of an outline, and the only thing this has to
 * be good enough for is not painting gravel over a boxwood.
 *
 * Why it exists: swapping a bed's surface used to fill the whole polygon
 * with the new material, so choosing river rock turned every shrub in the
 * bed grey too. The mulch is what changes; the plants stay. That needs the
 * plants to be objects in the graph, which is also where a future "swap
 * this shrub for that one" has to read them from — project-map section 5
 * calls these PointElements.
 */
export type Planting = {
  /**
   * Stable within the project, assigned by the parser rather than by the
   * model — a customer's choice of what to replace this plant with is
   * keyed by it, so it has to survive a page reload and a trip through the
   * store. Derived from the region id and the plant's position in the
   * list, both of which the same segmentation always reports the same way.
   */
  id: string;
  /** Centre, in normalized image coordinates. */
  cx: number;
  cy: number;
  /** Radii, as fractions of image width and height. */
  rx: number;
  ry: number;
  /** What it appears to be, e.g. "boxwood", "ornamental grass". */
  label?: string;
};

export type SegmentedRegion = {
  id: string;
  kind: RegionKind;
  /** Short human label, e.g. "Front lawn", "Bed along walkway". */
  label: string;
  polygon: NormalizedPoint[];
  /**
   * Plants standing in this region. Empty when the model reports none —
   * every consumer must render correctly with an empty list, because that
   * is what every stored segmentation from before this existed has.
   */
  plantings?: Planting[];
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

/**
 * The result of a segmentation pass, and — because it is stored verbatim —
 * exactly what comes back out of the store.
 *
 * The model is also asked for a **ground line**: where vertical surfaces
 * meet the ground, left to right. That is deliberately not a field here.
 * It is an input to parsing, consumed by `lib/vision/groundLine.ts` to pull
 * regions that climbed the house wall back down onto the ground, and
 * nothing downstream reads it — so carrying it would mean either a column
 * nobody queries or a result that does not survive a round trip through
 * the store. The regions that come out have already been held to it.
 */
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
