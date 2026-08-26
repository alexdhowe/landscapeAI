/**
 * What the bed is already made of, as something we can draw.
 *
 * ---------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------
 * When the customer takes the plants out of a bed, something has to fill
 * the holes where they were standing. The photograph cannot: those pixels
 * are a shrub, and no amount of masking turns a shrub into the mulch
 * behind it.
 *
 * The answer is not to invent the missing mulch — it is to stop treating
 * the bed as a photograph. Once somebody has cleared a bed and started
 * placing plants in it, what is on screen is a *design*, and §1 has said
 * from the beginning that the image is a view generated from the object
 * graph rather than an artifact in its own right. So a cleared bed is
 * painted in its own material, edge to edge, at the gauge
 * `lib/design/scale.ts` works out — the same procedural surfaces the swap
 * already draws, and the same ones that now look like the materials they
 * name.
 *
 * The model tells us what is there. Every region carries
 * `existing_material` in the segmentation's own words — "dyed black
 * hardwood mulch, freshly installed", "3/4in washed river rock", "turf
 * grass" — and this maps that sentence onto the closest swatch we can
 * draw.
 *
 * ---------------------------------------------------------------------
 * What this must not become
 * ---------------------------------------------------------------------
 * A **choice**. Painting a bed in the mulch that is already in it is a
 * drawing decision and nothing else: it adds no line item, moves no band,
 * and puts no chip in the picker. The customer did not order the mulch
 * they already have. Everything here feeds the canvas and nothing else,
 * which is why it returns a `SwatchId` rather than a catalog option id —
 * an option id would be selectable, and a selection is priced.
 *
 * Pure: a sentence in, a swatch out.
 */
import type { SwatchId } from "../catalog/options";
import type { RegionKind } from "../vision/types";

/**
 * Which family the description belongs to, decided before which member.
 *
 * Two passes rather than one ordered list, because one list gets this
 * wrong in a way that is easy to miss: "wood chips" is mulch and "granite
 * chips" is stone, and any single ordering of patterns containing "chips"
 * mis-reads one of them. Asking "is this mulch?" first, and only then
 * "which mulch?", cannot.
 *
 * Mulch wins the tie on purpose. Every word stone shares with mulch —
 * chips, shredded — belongs to mulch more often in a bed.
 */
const MULCH = /mulch|bark|wood|shred|pine\s*straw|compost|soil|dirt|bare/i;
const STONE = /gravel|stone|rock|chip|granite|limestone|slate|pebble|cobble|lava/i;
const GREEN = /turf|grass|lawn|sod|ground\s*cover|planted|perennial|ivy/i;

/** Which mulch, once we know it is mulch. */
function mulchSwatch(description: string): SwatchId {
  if (/cedar|cypress|redwood|red\s*mulch|dyed\s*red/i.test(description)) return "mulch_red";
  if (/black|dark|dyed|espresso|brown/i.test(description)) return "mulch_dark";
  return "mulch_brown";
}

/** Which stone, once we know it is stone. */
function stoneSwatch(description: string): SwatchId {
  if (/limestone|buff|tan|pea\s*gravel|decomposed|beige|cream/i.test(description)) {
    return "stone_buff";
  }
  if (/granite|trap\s*rock|basalt|lava|black|dark|crushed/i.test(description)) {
    return "stone_granite";
  }
  return "stone_gray";
}

/**
 * What a region is covered in when its description says nothing useful.
 *
 * Beds are mulched far more often than they are anything else, which
 * makes hardwood mulch the right guess where there is nothing to go on —
 * and a bed drawn as the wrong brown is a much smaller error than a bed
 * drawn as gravel.
 */
const DEFAULT_BY_KIND: Record<RegionKind, SwatchId> = {
  bed: "mulch_brown",
  foundation_planting: "mulch_brown",
  turf: "planting_mixed",
  hardscape: "stone_gray",
};

/** The closest drawable surface to what this region already has. */
export function existingSurfaceSwatch(region: {
  kind: RegionKind;
  existingMaterial?: string;
}): SwatchId {
  const description = region.existingMaterial?.trim();
  if (description) {
    if (MULCH.test(description)) return mulchSwatch(description);
    if (STONE.test(description)) return stoneSwatch(description);
    if (GREEN.test(description)) return "planting_mixed";
  }
  return DEFAULT_BY_KIND[region.kind];
}
