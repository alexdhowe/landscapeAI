/**
 * Phase 3.5 — growth domain types.
 *
 * Growth is a rendering parameter derived from plant metadata, not a
 * separate model. This module (and everything in lib/growth) is pure:
 * never import from app/, lib/db/, or anything that does I/O.
 */

/** A plant's rendered size at a given number of years after planting. */
export type PlantSizeAtYear = {
  year: number;
  heightFt: number;
  spreadFt: number;
  /** 0-1 fraction of mature size (applied to both height and spread). */
  fractionOfMature: number;
};

/**
 * Trees carry discrete render states because a juvenile tree is not a
 * scaled-down mature specimen. Everything else is one asset, scaled.
 */
export type TreeRenderState = "juvenile" | "semi_mature" | "mature";

/**
 * Which asset to draw and at what scale. `assetKey` is the lookup key into
 * the (future) asset store: the SKU id for single-asset plants, or
 * `${skuId}__${state}` for staged tree assets.
 */
export type RenderSpec =
  | { kind: "scaled"; assetKey: string; scale: number }
  | { kind: "staged"; assetKey: string; state: TreeRenderState; scale: number };

/** A plant placed in a design, in bed-local feet. */
export type PlantPlacement = {
  id: string;
  skuId: string;
  xFt: number;
  yFt: number;
};

/** Two placed plants whose canopies collide by the evaluation year. */
export type CrowdingWarning = {
  aId: string;
  bId: string;
  skuIds: [string, string];
  /** Center-to-center distance as placed. */
  distanceFt: number;
  /** Required center-to-center separation at full maturity. */
  matureSeparationFt: number;
  /** Canopy overlap at the evaluation year (positive = crowded). */
  overlapAtEvalYearFt: number;
  /** First whole year the canopies collide, or null if only at maturity. */
  crowdsByYear: number | null;
};

/** Suggested fix for an over-planted run of one SKU. */
export type RowCorrection = {
  skuId: string;
  currentCount: number;
  /** Length of the placed run, end plant to end plant. */
  rowLengthFt: number;
  /** How many of this SKU actually fit the run at mature spread. */
  correctedCount: number;
  /** Suggested center-to-center spacing for the corrected count. */
  correctedSpacingFt: number;
};

export type SpacingReport = {
  ok: boolean;
  /** Year the crowding check was evaluated at (default 5). */
  evaluationYear: number;
  warnings: CrowdingWarning[];
  /** One correction per SKU that appears in a warning. */
  corrections: RowCorrection[];
};
