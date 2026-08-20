/**
 * The click-to-swap catalog. Every option a customer can pick maps to real
 * assemblies in the seed price book — the catalog is the guardrail: nothing
 * can be selected that the pricing engine cannot price (map section 1).
 *
 * Pure data + filters. No I/O.
 */
import type { JobType } from "../pricing/typology";
import type { RegionKind } from "../vision/types";

/** Deterministic SVG fill pattern rendered for a swapped region. */
export type SwatchId =
  | "mulch_brown"
  | "mulch_dark"
  | "mulch_red"
  | "stone_gray"
  | "stone_granite"
  | "stone_buff"
  | "planting_mixed";

export type CatalogOption = {
  id: string;
  label: string;
  description: string;
  /** "surface" replaces what covers the region; "addon" layers on top. */
  slot: "surface" | "addon";
  appliesTo: RegionKind[];
  /** Assemblies from the seed price book that this option is built from. */
  assemblyIds: string[];
  /** SKU rendered/named in generative prompts — always a catalog SKU id. */
  skuIds: string[];
  swatch: SwatchId;
  /**
   * The historical job-type distribution this option's band draws from.
   * Picking the option is what makes the opening band defensible.
   */
  jobType: JobType;
};

export const CATALOG_OPTIONS: CatalogOption[] = [
  // -- surfaces: mulch -------------------------------------------------
  {
    id: "surface_mulch_hardwood",
    label: "Shredded hardwood mulch",
    description: "Fresh 3in hardwood mulch over the existing bed.",
    slot: "surface",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["mulch_install_hardwood"],
    skuIds: ["mulch_hardwood"],
    swatch: "mulch_brown",
    jobType: "bed_renovation",
  },
  {
    id: "surface_mulch_dyed_brown",
    label: "Dyed brown mulch",
    description: "Color-stable dyed brown mulch, 3in depth.",
    slot: "surface",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["mulch_install_hardwood"],
    skuIds: ["mulch_dyed_brown"],
    swatch: "mulch_dark",
    jobType: "bed_renovation",
  },
  {
    id: "surface_mulch_cedar",
    label: "Cedar mulch",
    description: "Aromatic cedar mulch, 3in depth.",
    slot: "surface",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["mulch_install_hardwood"],
    skuIds: ["mulch_cedar"],
    swatch: "mulch_red",
    jobType: "bed_renovation",
  },
  // -- surfaces: stone conversions ------------------------------------
  {
    id: "surface_stone_river_rock",
    label: "Washed river rock",
    description: "Mulch-to-stone conversion: 1.5in river rock over fabric.",
    slot: "surface",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["stone_bed_conversion"],
    skuIds: ["stone_river_rock", "weed_fabric"],
    swatch: "stone_gray",
    jobType: "mulch_to_stone",
  },
  {
    id: "surface_stone_granite_chips",
    label: "Granite chips",
    description: "Mulch-to-stone conversion: 3/8in granite chips over fabric.",
    slot: "surface",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["stone_bed_conversion"],
    skuIds: ["stone_granite_chips", "weed_fabric"],
    swatch: "stone_granite",
    jobType: "mulch_to_stone",
  },
  {
    id: "surface_stone_limestone",
    label: "Buff limestone chips",
    description: "Mulch-to-stone conversion: buff limestone over fabric.",
    slot: "surface",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["stone_bed_conversion"],
    skuIds: ["stone_limestone_chips", "weed_fabric"],
    swatch: "stone_buff",
    jobType: "mulch_to_stone",
  },
  // -- presets ---------------------------------------------------------
  {
    id: "addon_bed_renovation",
    label: "Full bed renovation",
    description:
      "Strip out, amend soil, replant shrubs and perennials, re-mulch.",
    slot: "addon",
    appliesTo: ["bed"],
    assemblyIds: [
      "bed_prep_renovation",
      "mulch_install_hardwood",
      "install_plant_hydrangea_annabelle",
      "install_plant_daylily_stella",
    ],
    skuIds: ["plant_hydrangea_annabelle", "plant_daylily_stella", "mulch_hardwood"],
    swatch: "planting_mixed",
    jobType: "bed_renovation",
  },
  {
    id: "addon_foundation_refresh",
    label: "Foundation planting refresh",
    description:
      "Remove tired shrubs, replant boxwood and hosta, fresh mulch.",
    slot: "addon",
    appliesTo: ["foundation_planting"],
    assemblyIds: [
      "shrub_removal",
      "install_plant_boxwood_green_velvet",
      "install_plant_hosta_patriot",
      "mulch_install_hardwood",
    ],
    skuIds: ["plant_boxwood_green_velvet", "plant_hosta_patriot", "mulch_hardwood"],
    swatch: "planting_mixed",
    jobType: "foundation_planting_refresh",
  },
  // -- edging + accents ------------------------------------------------
  {
    id: "addon_steel_edging",
    label: "Steel edging",
    description: "Crisp 4in steel edge around the bed.",
    slot: "addon",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["steel_edging_install"],
    skuIds: ["edging_steel"],
    swatch: "stone_gray",
    jobType: "bed_renovation",
  },
  {
    id: "addon_boulder_accent",
    label: "Accent boulders",
    description: "A pair of 18-24in granite boulders placed in the bed.",
    slot: "addon",
    appliesTo: ["bed", "foundation_planting"],
    assemblyIds: ["boulder_place_18", "boulder_place_24"],
    skuIds: ["boulder_18in", "boulder_24in"],
    swatch: "stone_granite",
    jobType: "bed_renovation",
  },
];

/** Options a customer may pick for a region of the given kind. */
export function optionsForKind(kind: RegionKind): CatalogOption[] {
  return CATALOG_OPTIONS.filter((o) => o.appliesTo.includes(kind));
}

export function getOption(id: string): CatalogOption | undefined {
  return CATALOG_OPTIONS.find((o) => o.id === id);
}
