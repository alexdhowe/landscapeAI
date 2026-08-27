/**
 * Plants the customer put in that the photograph never had.
 *
 * ---------------------------------------------------------------------
 * Why this is its own module
 * ---------------------------------------------------------------------
 * The three plant verbs already built — swap it, take it out, move it —
 * are all *about* a plant the segmentation found, and all keyed by its
 * planting id. This one has no plant to key off. It is the verb that
 * makes the other three worth having: nobody designing a bed only ever
 * wants a plant exactly where a plant already is, and until a customer
 * can put one in an empty spot the design is still a rearrangement of
 * what the camera happened to see.
 *
 * ---------------------------------------------------------------------
 * It prices as an install, because that is what it is
 * ---------------------------------------------------------------------
 * An added plant is one `install_<sku>` at quantity 1 EA — the same
 * assembly a swap bills, off the same catalog, through the same engine.
 * There is nothing to remove and nothing to lift, so no other line
 * appears. The two rules the swap path keeps apply here unchanged: the
 * option id is resolved against the catalog derived from the org's own
 * price book, so an id a browser made up buys nothing; and the region id
 * is resolved against the CURRENT segmentation, so a plant dropped into a
 * bed that a re-segmentation no longer finds is ignored rather than
 * priced.
 *
 * ---------------------------------------------------------------------
 * How big it is drawn
 * ---------------------------------------------------------------------
 * At the size it will actually be. The catalog carries `matureSpreadFt`,
 * the photograph carries a scale (`lib/design/scale.ts`) and now a
 * perspective (`lib/design/perspective.ts`), so a five-foot viburnum
 * dropped at the front of a bed is drawn five feet across at the front of
 * that bed. That is the point of dropping it on a photograph rather than
 * picking it off a list: a customer finds out it will not fit *before* a
 * crew plants it.
 *
 * Pure. No I/O.
 */
import type { PlantOption } from "../catalog/plants";
import { plantJobTypeForRegion } from "../catalog/plants";
import type { JobType } from "../pricing/typology";
import type { NormalizedPoint, Planting, SegmentedRegion } from "../vision/types";
import type { AddedPlant } from "./types";

/** One added plant that still names a real region and a real option. */
export type ResolvedAddedPlant = {
  region: SegmentedRegion;
  added: AddedPlant;
  option: PlantOption;
  jobType: JobType;
};

/**
 * The added plants this design can actually price, in a stable order:
 * region order, then the order they were added in.
 */
export function resolveAddedPlants(
  regions: readonly SegmentedRegion[],
  addedPlants: readonly AddedPlant[] | undefined,
  catalog: readonly PlantOption[],
): ResolvedAddedPlant[] {
  if (!addedPlants || addedPlants.length === 0) return [];
  const byOption = new Map(catalog.map((option) => [option.id, option]));
  const resolved: ResolvedAddedPlant[] = [];
  for (const region of regions) {
    const jobType = plantJobTypeForRegion(region.kind);
    if (!jobType) continue;
    for (const added of addedPlants) {
      if (added.regionId !== region.id) continue;
      const option = byOption.get(added.optionId);
      if (!option) continue;
      resolved.push({ region, added, option, jobType });
    }
  }
  return resolved;
}

/** The scope line adding plants puts under the band. */
export function addedScopeLines(added: readonly ResolvedAddedPlant[]): string[] {
  if (added.length === 0) return [];
  return [added.length === 1 ? "1 plant added" : `${added.length} plants added`];
}

/**
 * How wide and tall to draw an added plant, in normalized image units.
 *
 * `perFoot` is the region's own scale and `depth` the perspective
 * multiplier at the row it stands in, so the same plant dropped at the
 * front of a bed is drawn bigger than at the back — which is what makes
 * "will it fit" answerable from the picture.
 *
 * `aspect` is how squat the photograph draws a plant: a shrub seen from
 * standing height is wider than it is tall on the image, and how much is
 * a property of the camera angle. It comes from the plants already in the
 * region, which were measured by the pass that could see them, and falls
 * back to a value in the middle of what front-yard photos produce.
 */
export function addedPlantEllipse(input: {
  spreadFt: number;
  perFoot: number;
  frameWidth: number;
  frameHeight: number;
  depth: number;
  aspect: number;
}): { rx: number; ry: number } {
  const halfPx = (Math.max(MIN_SPREAD_FT, input.spreadFt) / 2) * input.perFoot * input.depth;
  const rx = halfPx / input.frameWidth;
  // The vertical radius is the same number of *pixels* times the aspect,
  // not the same fraction: normalized units are anisotropic, and a plant
  // that ignored that would come out stretched on any photo that is not
  // square.
  const ry = (halfPx * input.aspect) / input.frameHeight;
  return {
    rx: clamp(rx, MIN_RADIUS, MAX_RADIUS),
    ry: clamp(ry, MIN_RADIUS, MAX_RADIUS),
  };
}

/**
 * How squat this region draws its plants, from the ones already in it.
 *
 * Three or more, because two ellipses that happen to agree are not a
 * measurement. Below that, and for a bed with nothing in it, the fallback
 * is what a front-yard photograph taken from standing height produces.
 */
export function plantAspect(plantings: readonly Planting[] | undefined): number {
  const plants = plantings ?? [];
  if (plants.length < 3) return DEFAULT_ASPECT;
  const ratios = plants
    .filter((plant) => plant.rx > 0)
    .map((plant) => plant.ry / plant.rx)
    .sort((a, b) => a - b);
  if (ratios.length < 3) return DEFAULT_ASPECT;
  const median = ratios[Math.floor(ratios.length / 2)];
  return clamp(median, 0.4, 1.6);
}

/** Where an added plant stands. Trivial, and named so callers read right. */
export function addedPlantPosition(added: AddedPlant): NormalizedPoint {
  return added.at;
}

/** A plant narrower than this is a plug, and a plug is not a design. */
const MIN_SPREAD_FT = 0.75;

/** Nothing is drawn smaller than a few pixels or wider than a bed. */
const MIN_RADIUS = 0.004;
const MAX_RADIUS = 0.28;

/** Front-yard photographs taken from standing height cluster here. */
const DEFAULT_ASPECT = 0.72;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
