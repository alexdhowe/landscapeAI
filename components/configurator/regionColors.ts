import type { RegionKind } from "@/lib/vision/types";

/**
 * Tint + stroke for a region that has not been swapped yet.
 *
 * These are literals rather than design tokens on purpose, and this is the
 * only place in the app where that is true: they are drawn *over a
 * photograph*, where the job is to stay legible against grass, mulch and
 * concrete rather than to match the interface around them. They are still
 * one family — the same lightness, pulled apart in hue so four adjacent
 * regions read as four things.
 *
 * In its own module, with no "use client", because both the customer's
 * interactive canvas and the contractor's server-rendered one draw from
 * it.
 */
export const KIND_COLORS: Record<RegionKind, string> = {
  turf: "#4ade80",
  bed: "#fbbf24",
  hardscape: "#e2e8f0",
  foundation_planting: "#67e8f9",
};
