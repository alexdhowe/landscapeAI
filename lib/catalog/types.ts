/**
 * Catalog metadata types. Plant metadata is captured at seed time because
 * the Phase 3.5 time slider cannot exist without it (map section 7).
 */

export type GrowthRateClass = "slow" | "medium" | "fast";

export type PlantMeta = {
  /** e.g. "#3 container", "4 ft B&B", "2 in caliper B&B" */
  installSize: string;
  matureHeightFt: number;
  matureSpreadFt: number;
  growthRateClass: GrowthRateClass;
  /** form/habit, e.g. "mounded", "upright pyramidal", "clumping" */
  form: string;
  /** USDA range, e.g. "4-8". Wisconsin is zones 3b-5b. */
  hardinessZone: string;
  foliage: "deciduous" | "evergreen";
  category: "shrub" | "evergreen_shrub" | "perennial" | "grass" | "tree";
};
