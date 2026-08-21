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
import type { SegmentationResult } from "../vision/types";

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

export type SegmentationState =
  | { status: "pending" }
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
