/**
 * Design-state types for the Phase 2 configurator. A project at the "play"
 * stage: a photo, its segmentation, and the customer's catalog selections.
 * No quantities exist yet — the band shown is typology-based by definition.
 */
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

export type DesignProject = {
  id: string;
  createdAt: string;
  status: "playing";
  photo: ProjectPhoto;
  segmentation: SegmentationState;
  /** regionId → selection. */
  selections: Record<string, RegionSelection>;
  marketContext: MarketContext;
};
