/**
 * What the customer's plant choices mean for the estimate.
 *
 * A plant swap is one plant: `install_<sku>` at quantity 1 EA. That
 * assembly already exists for every plant in the price book — the seed
 * builds one per SKU with the plant, its soil, the crew time for its size
 * class and a skidsteer where the size class needs one — so a per-plant
 * choice prices through exactly the same engine as every other selection.
 *
 * Two rules this module exists to keep:
 *
 *   **A selection is only real if the plant is still there.** Selections
 *   are keyed by planting id and stored beside the segmentation, not
 *   inside it. Re-segmenting a photo produces new plants and can leave a
 *   stored choice pointing at one that no longer exists. Every reader
 *   resolves against the CURRENT segmentation, so a stale choice is
 *   ignored rather than priced — nothing puts a line item on the rep's
 *   quote for a shrub nobody can point at.
 *
 *   **A plant is only offerable if the book can price it.** The option id
 *   is resolved against the catalog derived from the org's own price book,
 *   so an id the customer's browser made up buys nothing.
 *
 * Pure. No I/O.
 */
import type { PlantOption } from "../catalog/plants";
import { PLANT_REMOVAL_ASSEMBLY, plantJobTypeForRegion } from "../catalog/plants";
import type { JobType } from "../pricing/typology";
import type { Planting, SegmentedRegion } from "../vision/types";

/** One resolved choice: the plant that is there, and what replaces it. */
export type ResolvedPlantChoice = {
  region: SegmentedRegion;
  planting: Planting;
  option: PlantOption;
  jobType: JobType;
};

/**
 * The choices that still name a plant in this segmentation and an option
 * this price book can install, in a stable order (region order, then the
 * order the plants were reported in).
 */
export function resolvePlantChoices(
  regions: readonly SegmentedRegion[],
  plantSelections: Record<string, string> | undefined,
  catalog: readonly PlantOption[],
): ResolvedPlantChoice[] {
  if (!plantSelections || Object.keys(plantSelections).length === 0) return [];
  const byId = new Map(catalog.map((o) => [o.id, o]));
  const resolved: ResolvedPlantChoice[] = [];
  for (const region of regions) {
    const jobType = plantJobTypeForRegion(region.kind);
    if (!jobType) continue;
    for (const planting of region.plantings ?? []) {
      const optionId = plantSelections[planting.id];
      if (!optionId) continue;
      const option = byId.get(optionId);
      if (!option) continue;
      resolved.push({ region, planting, option, jobType });
    }
  }
  return resolved;
}

/**
 * The scope lines a plant swap adds under the band.
 *
 * Counted, because "3 × Boxwood 'Green Velvet'" is what a customer
 * recognises as their design and three identical lines is what a bug looks
 * like.
 */
export function plantScopeLines(choices: readonly ResolvedPlantChoice[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const choice of choices) {
    const entry = counts.get(choice.option.id);
    if (entry) entry.n += 1;
    else counts.set(choice.option.id, { label: choice.option.label, n: 1 });
  }
  return [...counts.values()].map(({ label, n }) => (n > 1 ? `${n} × ${label}` : label));
}

/** assemblyId → how many of that plant the design now calls for. */
export function plantAssemblyCounts(
  choices: readonly ResolvedPlantChoice[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const choice of choices) {
    counts.set(choice.option.assemblyId, (counts.get(choice.option.assemblyId) ?? 0) + 1);
  }
  return counts;
}

/**
 * One plant the customer has taken out.
 *
 * Same resolution rules as a swap: a removal is only real if the plant is
 * still in the current segmentation, because a stale id must never put a
 * line item on the rep's quote for a shrub nobody can point at.
 */
export type ResolvedPlantRemoval = {
  region: SegmentedRegion;
  planting: Planting;
  jobType: JobType;
};

/**
 * The plants this design says to take out.
 *
 * A plant the customer both replaced and cleared cannot happen — the
 * store makes the two exclusive, because they are one decision about one
 * plant — but a reader that trusted that and was wrong would bill the
 * removal twice, so a replaced plant is skipped here explicitly.
 */
export function resolvePlantRemovals(
  regions: readonly SegmentedRegion[],
  clearedPlantings: readonly string[] | undefined,
  plantSelections: Record<string, string> | undefined,
): ResolvedPlantRemoval[] {
  if (!clearedPlantings || clearedPlantings.length === 0) return [];
  const cleared = new Set(clearedPlantings);
  const removals: ResolvedPlantRemoval[] = [];
  for (const region of regions) {
    const jobType = plantJobTypeForRegion(region.kind);
    if (!jobType) continue;
    for (const planting of region.plantings ?? []) {
      if (!cleared.has(planting.id)) continue;
      if (plantSelections?.[planting.id]) continue;
      removals.push({ region, planting, jobType });
    }
  }
  return removals;
}

/**
 * What taking plants out adds to the engine: one `shrub_removal` per
 * plant, or nothing at all.
 *
 * Empty when the book cannot price a removal. The design page does not
 * offer the control in that case, but the two are checked independently:
 * a project cleared while the assembly existed must not throw the whole
 * estimate the day a contractor deletes it from their book.
 */
export function plantRemovalCount(
  removals: readonly ResolvedPlantRemoval[],
  priceable: boolean,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (priceable && removals.length > 0) {
    counts.set(PLANT_REMOVAL_ASSEMBLY, removals.length);
  }
  return counts;
}

/**
 * The scope line taking plants out adds under the band.
 *
 * One line with a count, in the words a homeowner used when they asked
 * for it — not "shrub removal and disposal", which is the assembly's name
 * and the contractor's language.
 */
export function removalScopeLines(
  removals: readonly ResolvedPlantRemoval[],
): string[] {
  if (removals.length === 0) return [];
  return [
    removals.length === 1
      ? "1 existing plant taken out"
      : `${removals.length} existing plants taken out`,
  ];
}
