/**
 * Design-state types for the customer flow. Phase 2: a photo, its
 * segmentation, and the customer's catalog selections — no quantities, the
 * band is typology-based by definition. Phase 3 adds the aerial leg: a
 * geocoded location and user-drawn polygons over satellite imagery, each
 * measured into provenance-carrying quantities.
 */
import type { MeasurementDelta } from "../confirm/types";
import type { EstimateSnapshot, LeadContact } from "../lead/types";
import type { LngLat } from "../measure/area";
import type { Quantity } from "../pricing/types";
import type { MarketContext } from "../pricing/typology";
import type { SegmentationEstimate } from "../vision/estimate";
import type { NormalizedPoint, SegmentationResult } from "../vision/types";

export type RegionSelection = {
  /** Surface option currently covering the region, if swapped. */
  surfaceOptionId?: string;
  /** Layered add-ons (edging, renovation preset, boulders...). */
  addonOptionIds: string[];
};

export type ProjectPhoto = {
  fileName: string;
  mediaType: string;
};

/** Which of the two vision passes is running right now. */
export type SegmentationStage = "reading" | "refining";

/**
 * What a segmentation that is still running can say about itself.
 *
 * The vision call takes 55–170 seconds (README, "The other number"), and
 * a wait that long has to be able to answer "is this working?" without
 * the customer guessing. Everything here is written by the vision route
 * as the passes complete, and read by the design page while it polls, so
 * what the customer sees is what the server actually did rather than an
 * animation timed to a guess.
 *
 * Absent on a project whose segmentation started before this existed, and
 * on one whose pass never got as far as recording anything — so every
 * reader treats it as optional and falls back to its own estimate.
 */
export type SegmentationProgress = {
  /** When the vision route started work, ISO. */
  startedAt: string;
  stage: SegmentationStage;
  /** What the wait was predicted to cost, from the photo's pixel count. */
  estimate: SegmentationEstimate;
  /** What the first pass actually took, once it has finished. */
  firstPassMs?: number;
  /**
   * The names the first pass gave the regions it found.
   *
   * There purely so the second half of the wait has something true in it:
   * the customer sees "Front lawn, Bed along the walk, Driveway" appear
   * a minute before the outlines do.
   */
  found?: string[];
};

export type SegmentationState =
  | { status: "pending"; progress?: SegmentationProgress }
  | { status: "failed"; error: string }
  | ({ status: "ready" } & SegmentationResult);

export type GeocodeSource = "nominatim" | "demo";

export type ProjectLocation = {
  /** The address as the customer confirmed it (geocoder display name). */
  address: string;
  lat: number;
  lng: number;
  source: GeocodeSource;
  capturedAt: string;
};

/**
 * One measured polygon drawn over the aerial, mapped to the photo region it
 * measures. At most one per photo region — re-drawing replaces it.
 */
export type AerialRegion = {
  id: string;
  photoRegionId: string;
  /** Open ring in [lng, lat]; first point not repeated. */
  ring: LngLat[];
  areaSf: Quantity;
  perimeterLf: Quantity;
};

export type DesignProject = {
  id: string;
  createdAt: string;
  /**
   * The lifecycle of one design:
   *
   *   playing    the customer is still configuring
   *   submitted  sent as a lead; the design is frozen alongside its
   *              snapshot (the frozen record must keep describing what the
   *              dashboard shows)
   *   confirmed  a rep has corrected quantities on site (Phase 6)
   *   quoted     the final quote has been issued from those quantities
   *
   * Everything past "playing" locks the customer-side mutators.
   */
  status: "playing" | "submitted" | "confirmed" | "quoted";
  photo: ProjectPhoto;
  segmentation: SegmentationState;
  /** regionId → selection. */
  selections: Record<string, RegionSelection>;
  /**
   * plantingId → plant catalog option id.
   *
   * Keyed by the plant rather than by the region, because the unit of
   * choice here is one plant: the customer taps the boxwood by the door
   * and puts a hydrangea in its place, and the four other shrubs in the
   * same bed are unaffected. Absent on projects created before plants
   * were swappable, so every reader must treat it as optional.
   */
  plantSelections?: Record<string, string>;
  /**
   * The plants the customer took out, by planting id.
   *
   * A plant is either left alone, replaced with something else, or taken
   * out — one decision about one plant, and the store keeps the last two
   * exclusive. Taking one out is a real instruction with a real cost: the
   * crew has to dig it up and haul it away, and a design that shows eight
   * shrubs gone without bidding their removal hands the contractor a quote
   * they lose money on.
   *
   * Absent on projects created before plants could be cleared, so every
   * reader treats it as optional.
   */
  clearedPlantings?: string[];
  /**
   * regionId → the outline after the customer corrected it.
   *
   * A model placing polygon vertices from a photograph gets close and not
   * exact, and past a point that is what the technique does rather than a
   * prompt that needs another round. The person holding the phone is
   * standing in the yard and can see where the mulch stops, so they get to
   * say. Absent for a region nobody has touched, which is nearly all of
   * them.
   */
  regionOutlines?: Record<string, NormalizedPoint[]>;
  marketContext: MarketContext;
  /** Set once the customer shares and confirms an address. */
  location?: ProjectLocation;
  /**
   * The customer explicitly chose not to share an address. They keep their
   * design and typology band, and the lead is still capturable (Phase 5).
   */
  addressDeclined?: boolean;
  /** Absent on projects created before the aerial phase. */
  aerialRegions?: AerialRegion[];
  /** Who to reach about this lead. Set at submit. */
  contact?: LeadContact;
  /** When the customer submitted (equals the latest snapshot's issuedAt). */
  submittedAt?: string;
  /**
   * Immutable estimate snapshots, oldest first. Append-only: nothing in
   * the store mutates an entry once written. Phase 6 rep corrections
   * append NEW records; the customer's original stays untouched.
   */
  snapshots?: EstimateSnapshot[];
  /**
   * Phase 6 — the rep's on-site corrections, oldest first. Append-only,
   * and the single record of them: the current confirmed quantity for a
   * region is the newest matching delta's afterQty, so there is no second
   * copy that can drift. Also the training corpus (project-map §5).
   */
  deltas?: MeasurementDelta[];
  /** When the final quote was issued from confirmed quantities. */
  quotedAt?: string;
};
