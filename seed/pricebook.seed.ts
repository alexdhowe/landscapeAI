/**
 * Seed price book — WISCONSIN STATE AVERAGES, NOT REAL BID DATA.
 *
 * The contractor's real numbers are not available yet, so every figure here
 * is a placeholder derived from published state/midwest averages (2025):
 * WI landscape labor wages ~$18-24/hr (ZipRecruiter/Indeed/CareerExplorer),
 * installed mulch $50-150/CY and stone mulch $40-120/CY material
 * (HomeGuide/LawnStarter), 3-gal shrub installs ~$65/hole (GreenPal),
 * steel edging $2-6/LF material (LawnStarter/Angi). Quantity distributions
 * are ESTIMATES for typical WI suburban lots — no public source exists for
 * them; they are exactly the proprietary data map section 7 says only the
 * contractor can produce.
 *
 * Replace file contents wholesale when real bids arrive; keep the exported
 * names stable.
 *
 * Pure data module: imports types only, no I/O.
 */
import type { PlantMeta } from "../lib/catalog/types";
import type {
  Assembly,
  CostItem,
  DisclosurePolicy,
  MarginConfig,
  PriceBook,
} from "../lib/pricing/types";
import type {
  JobType,
  MarketContext,
  QuantityDistribution,
  RecipeLine,
  TypologyConfig,
} from "../lib/pricing/typology";

// ---------------------------------------------------------------------------
// The tenant this price book belongs to
// ---------------------------------------------------------------------------

/**
 * The one contractor org for now (project-map section 5: Organization is
 * the tenant that owns the price book). Everything below is seeded onto it
 * by `npm run db:seed`, and routes resolve it by slug rather than importing
 * these constants.
 */
export const wiOrganization = {
  slug: "wi-reference",
  name: "Wisconsin Reference Contractor (placeholder data)",
};

// ---------------------------------------------------------------------------
// Hard goods, labor, equipment, disposal
// ---------------------------------------------------------------------------

const hardGoods: CostItem[] = [
  // materials — bulk (unitCost = contractor cost, delivered)
  { id: "mulch_hardwood", name: "Shredded hardwood mulch", kind: "material", unit: "CY", unitCost: 38, wasteFactorPct: 10 },
  { id: "mulch_dyed_brown", name: "Dyed brown mulch", kind: "material", unit: "CY", unitCost: 46, wasteFactorPct: 10 },
  { id: "mulch_cedar", name: "Cedar mulch", kind: "material", unit: "CY", unitCost: 55, wasteFactorPct: 10 },
  { id: "stone_river_rock", name: "Washed river rock 1.5in", kind: "material", unit: "CY", unitCost: 95, wasteFactorPct: 10 },
  { id: "stone_granite_chips", name: "Granite chips 3/8in", kind: "material", unit: "CY", unitCost: 110, wasteFactorPct: 10 },
  { id: "stone_limestone_chips", name: "Buff limestone chips", kind: "material", unit: "CY", unitCost: 75, wasteFactorPct: 10 },
  { id: "weed_fabric", name: "Woven weed fabric", kind: "material", unit: "SF", unitCost: 0.22, wasteFactorPct: 5 },
  { id: "edging_steel", name: "Steel edging 4in", kind: "material", unit: "LF", unitCost: 4.0, wasteFactorPct: 5 },
  { id: "edging_poly", name: "Professional poly edging", kind: "material", unit: "LF", unitCost: 2.25, wasteFactorPct: 5 },
  { id: "planting_soil", name: "Planting soil blend", kind: "material", unit: "CY", unitCost: 48, wasteFactorPct: 10 },
  { id: "compost", name: "Compost amendment", kind: "material", unit: "CY", unitCost: 40, wasteFactorPct: 10 },
  { id: "boulder_18in", name: "Granite boulder 18in", kind: "material", unit: "EA", unitCost: 85 },
  { id: "boulder_24in", name: "Granite boulder 24in", kind: "material", unit: "EA", unitCost: 160 },
  // labor (raw wage cost; burden covers taxes/insurance/benefits)
  { id: "labor_crew", name: "Landscape crew labor", kind: "labor", unit: "HR", unitCost: 22, burdenPct: 38 },
  { id: "labor_foreman", name: "Crew foreman", kind: "labor", unit: "HR", unitCost: 30, burdenPct: 38 },
  // equipment
  { id: "skidsteer", name: "Skid steer incl. fuel", kind: "equipment", unit: "HR", unitCost: 48 },
  { id: "mini_excavator", name: "Mini excavator incl. fuel", kind: "equipment", unit: "HR", unitCost: 62 },
  // disposal
  { id: "disposal_greenwaste", name: "Green waste disposal", kind: "disposal", unit: "CY", unitCost: 55 },
  { id: "disposal_spoils", name: "Mixed spoils disposal", kind: "disposal", unit: "CY", unitCost: 70 },
];

// ---------------------------------------------------------------------------
// Living SKUs — WI zone 4b-5b palette, wholesale contractor cost.
// Plant metadata is mandatory at seed time (powers the Phase 3.5 slider).
// ---------------------------------------------------------------------------

type SizeClassId = "perennial_1gal" | "shrub_3gal" | "shrub_5gal" | "evergreen_bb" | "tree_bb";

/** Install effort by container/root-ball class: soil per hole, holes per crew-hour. */
const sizeClasses: Record<
  SizeClassId,
  { soilCyPerEa: number; productionRate: number; skidsteerHrPerEa?: number }
> = {
  perennial_1gal: { soilCyPerEa: 0.02, productionRate: 8 },
  shrub_3gal: { soilCyPerEa: 0.05, productionRate: 3 },
  shrub_5gal: { soilCyPerEa: 0.08, productionRate: 2.5 },
  evergreen_bb: { soilCyPerEa: 0.12, productionRate: 1.5 },
  tree_bb: { soilCyPerEa: 0.3, productionRate: 0.75, skidsteerHrPerEa: 0.75 },
};

type PlantSku = {
  id: string;
  name: string;
  unitCost: number;
  sizeClass: SizeClassId;
  meta: PlantMeta;
};

export const plantSkus: PlantSku[] = [
  // deciduous shrubs
  { id: "plant_hydrangea_annabelle", name: "Hydrangea 'Annabelle'", unitCost: 32, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 5, matureSpreadFt: 5, growthRateClass: "fast", form: "mounded", hardinessZone: "3-9", foliage: "deciduous", category: "shrub" } },
  { id: "plant_hydrangea_limelight", name: "Hydrangea 'Limelight'", unitCost: 52, sizeClass: "shrub_5gal",
    meta: { installSize: "#5 container", matureHeightFt: 7, matureSpreadFt: 7, growthRateClass: "fast", form: "upright rounded", hardinessZone: "3-8", foliage: "deciduous", category: "shrub" } },
  { id: "plant_spirea_goldflame", name: "Spirea 'Goldflame'", unitCost: 26, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 3, matureSpreadFt: 4, growthRateClass: "medium", form: "mounded", hardinessZone: "4-8", foliage: "deciduous", category: "shrub" } },
  { id: "plant_ninebark_little_devil", name: "Ninebark 'Little Devil'", unitCost: 30, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 4, matureSpreadFt: 4, growthRateClass: "medium", form: "upright arching", hardinessZone: "3-7", foliage: "deciduous", category: "shrub" } },
  { id: "plant_dogwood_arctic_fire", name: "Red twig dogwood 'Arctic Fire'", unitCost: 30, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 4, matureSpreadFt: 4, growthRateClass: "medium", form: "upright suckering", hardinessZone: "3-7", foliage: "deciduous", category: "shrub" } },
  { id: "plant_weigela_wine_roses", name: "Weigela 'Wine & Roses'", unitCost: 32, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 5, matureSpreadFt: 5, growthRateClass: "medium", form: "arching mounded", hardinessZone: "4-8", foliage: "deciduous", category: "shrub" } },
  { id: "plant_potentilla_goldfinger", name: "Potentilla 'Goldfinger'", unitCost: 24, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 3, matureSpreadFt: 3, growthRateClass: "medium", form: "mounded", hardinessZone: "3-7", foliage: "deciduous", category: "shrub" } },
  { id: "plant_diervilla_kodiak", name: "Bush honeysuckle 'Kodiak Orange'", unitCost: 28, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 3.5, matureSpreadFt: 4, growthRateClass: "medium", form: "spreading mounded", hardinessZone: "4-7", foliage: "deciduous", category: "shrub" } },
  { id: "plant_viburnum_blue_muffin", name: "Viburnum 'Blue Muffin'", unitCost: 36, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 6, matureSpreadFt: 5, growthRateClass: "medium", form: "upright rounded", hardinessZone: "3-8", foliage: "deciduous", category: "shrub" } },
  { id: "plant_lilac_common", name: "Common purple lilac", unitCost: 48, sizeClass: "shrub_5gal",
    meta: { installSize: "#5 container", matureHeightFt: 12, matureSpreadFt: 10, growthRateClass: "medium", form: "upright multi-stem", hardinessZone: "3-7", foliage: "deciduous", category: "shrub" } },
  // evergreen shrubs
  { id: "plant_arborvitae_techny", name: "Arborvitae 'Techny'", unitCost: 110, sizeClass: "evergreen_bb",
    meta: { installSize: "4 ft B&B", matureHeightFt: 14, matureSpreadFt: 8, growthRateClass: "slow", form: "broad pyramidal", hardinessZone: "3-7", foliage: "evergreen", category: "evergreen_shrub" } },
  { id: "plant_boxwood_green_velvet", name: "Boxwood 'Green Velvet'", unitCost: 38, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 3, matureSpreadFt: 3, growthRateClass: "slow", form: "rounded", hardinessZone: "4-8", foliage: "evergreen", category: "evergreen_shrub" } },
  { id: "plant_juniper_sea_green", name: "Juniper 'Sea Green'", unitCost: 34, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 5, matureSpreadFt: 6, growthRateClass: "medium", form: "vase arching", hardinessZone: "4-9", foliage: "evergreen", category: "evergreen_shrub" } },
  { id: "plant_mugo_pine", name: "Dwarf mugo pine", unitCost: 42, sizeClass: "shrub_3gal",
    meta: { installSize: "#3 container", matureHeightFt: 4, matureSpreadFt: 5, growthRateClass: "slow", form: "broad mounded", hardinessZone: "2-7", foliage: "evergreen", category: "evergreen_shrub" } },
  // grasses + perennials
  { id: "plant_karl_foerster", name: "Feather reed grass 'Karl Foerster'", unitCost: 15, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 5, matureSpreadFt: 2, growthRateClass: "fast", form: "upright clumping", hardinessZone: "4-9", foliage: "deciduous", category: "grass" } },
  { id: "plant_prairie_dropseed", name: "Prairie dropseed", unitCost: 15, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 2.5, matureSpreadFt: 3, growthRateClass: "slow", form: "fountain clumping", hardinessZone: "3-9", foliage: "deciduous", category: "grass" } },
  { id: "plant_catmint_walkers_low", name: "Catmint 'Walker's Low'", unitCost: 13, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 2.5, matureSpreadFt: 3, growthRateClass: "fast", form: "sprawling mounded", hardinessZone: "4-8", foliage: "deciduous", category: "perennial" } },
  { id: "plant_daylily_stella", name: "Daylily 'Stella de Oro'", unitCost: 12, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 1.5, matureSpreadFt: 1.5, growthRateClass: "fast", form: "clumping", hardinessZone: "3-9", foliage: "deciduous", category: "perennial" } },
  { id: "plant_hosta_patriot", name: "Hosta 'Patriot'", unitCost: 14, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 1.5, matureSpreadFt: 3, growthRateClass: "medium", form: "clumping", hardinessZone: "3-9", foliage: "deciduous", category: "perennial" } },
  { id: "plant_rudbeckia_goldsturm", name: "Black-eyed Susan 'Goldsturm'", unitCost: 12, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 2, matureSpreadFt: 2, growthRateClass: "fast", form: "upright clumping", hardinessZone: "3-9", foliage: "deciduous", category: "perennial" } },
  { id: "plant_echinacea_purple", name: "Purple coneflower", unitCost: 12, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 3, matureSpreadFt: 2, growthRateClass: "fast", form: "upright clumping", hardinessZone: "3-8", foliage: "deciduous", category: "perennial" } },
  { id: "plant_sedum_autumn_joy", name: "Sedum 'Autumn Joy'", unitCost: 12, sizeClass: "perennial_1gal",
    meta: { installSize: "#1 container", matureHeightFt: 2, matureSpreadFt: 2, growthRateClass: "medium", form: "upright clumping", hardinessZone: "3-9", foliage: "deciduous", category: "perennial" } },
  // trees (juvenile form differs from mature — carry 2-3 render states in Phase 3.5)
  { id: "plant_maple_autumn_blaze", name: "Maple 'Autumn Blaze'", unitCost: 310, sizeClass: "tree_bb",
    meta: { installSize: "2 in caliper B&B", matureHeightFt: 50, matureSpreadFt: 40, growthRateClass: "fast", form: "upright oval", hardinessZone: "3-8", foliage: "deciduous", category: "tree" } },
  { id: "plant_river_birch_clump", name: "River birch, clump", unitCost: 250, sizeClass: "tree_bb",
    meta: { installSize: "8 ft clump B&B", matureHeightFt: 45, matureSpreadFt: 35, growthRateClass: "fast", form: "multi-stem oval", hardinessZone: "4-9", foliage: "deciduous", category: "tree" } },
  { id: "plant_serviceberry_ab", name: "Serviceberry 'Autumn Brilliance'", unitCost: 245, sizeClass: "tree_bb",
    meta: { installSize: "6 ft clump B&B", matureHeightFt: 20, matureSpreadFt: 15, growthRateClass: "medium", form: "multi-stem rounded", hardinessZone: "4-9", foliage: "deciduous", category: "tree" } },
  { id: "plant_spruce_black_hills", name: "Black Hills spruce", unitCost: 230, sizeClass: "tree_bb",
    meta: { installSize: "5 ft B&B", matureHeightFt: 35, matureSpreadFt: 20, growthRateClass: "slow", form: "dense pyramidal", hardinessZone: "3-6", foliage: "evergreen", category: "tree" } },
];

/** Plant metadata lookup for later phases (time slider, spacing validation). */
export const plantMetaBySku: Record<string, PlantMeta> = Object.fromEntries(
  plantSkus.map((p) => [p.id, p.meta]),
);

const plantCostItems: CostItem[] = plantSkus.map((p) => ({
  id: p.id,
  name: p.name,
  kind: "material",
  unit: "EA",
  unitCost: p.unitCost,
}));

// ---------------------------------------------------------------------------
// Assemblies
// ---------------------------------------------------------------------------

const fixedAssemblies: Assembly[] = [
  {
    id: "mulch_install_hardwood",
    name: "Hardwood mulch installation, 3in",
    unit: "SF",
    components: [
      { costItemId: "mulch_hardwood", qtyPerUnit: 0.0093 },
      { costItemId: "labor_crew", productionRate: 60 },
    ],
  },
  {
    id: "mulch_refresh",
    name: "Mulch bed refresh, 2in top-up",
    unit: "SF",
    components: [
      { costItemId: "mulch_hardwood", qtyPerUnit: 0.0062 },
      { costItemId: "labor_crew", productionRate: 80 },
    ],
  },
  {
    id: "stone_bed_conversion",
    name: "Mulch-to-stone bed conversion, 3in river rock over fabric",
    unit: "SF",
    components: [
      { costItemId: "disposal_greenwaste", qtyPerUnit: 0.0062 }, // old mulch out
      { costItemId: "weed_fabric", qtyPerUnit: 1 },
      { costItemId: "stone_river_rock", qtyPerUnit: 0.0093 },
      { costItemId: "labor_crew", productionRate: 18 },
      { costItemId: "skidsteer", qtyPerUnit: 0.01 },
    ],
  },
  {
    id: "bed_prep_renovation",
    name: "Bed strip-out and soil preparation",
    unit: "SF",
    components: [
      { costItemId: "disposal_greenwaste", qtyPerUnit: 0.0093 }, // old material + sod out
      { costItemId: "compost", qtyPerUnit: 0.0046 }, // 1.5in amendment tilled in
      { costItemId: "labor_crew", productionRate: 25 },
      { costItemId: "skidsteer", qtyPerUnit: 0.012 },
    ],
  },
  {
    id: "steel_edging_install",
    name: "Steel bed edging, installed",
    unit: "LF",
    components: [
      { costItemId: "edging_steel", qtyPerUnit: 1 },
      { costItemId: "labor_crew", productionRate: 10 },
    ],
  },
  {
    id: "poly_edging_install",
    name: "Poly bed edging, installed",
    unit: "LF",
    components: [
      { costItemId: "edging_poly", qtyPerUnit: 1 },
      { costItemId: "labor_crew", productionRate: 14 },
    ],
  },
  {
    id: "shrub_removal",
    name: "Existing shrub removal and disposal",
    unit: "EA",
    components: [
      { costItemId: "labor_crew", productionRate: 2 },
      { costItemId: "disposal_greenwaste", qtyPerUnit: 0.15 },
    ],
  },
  {
    /**
     * Moving a plant the yard already has, rather than buying one.
     *
     * Priced as its own assembly because it is its own work: lift the
     * root ball intact, carry it, dig and amend the new hole, set,
     * backfill and water. Slower than a removal (0.5 h) because the plant
     * has to survive it, and slower than planting a #3 container (0.33 h)
     * because the hole it comes out of has to be dug first — 0.83 h is
     * the two added together, and there is no disposal because nothing
     * leaves the site.
     *
     * A WI-average placeholder like everything else in this file (see
     * "Seed data" in the README): a contractor sets their own number in
     * `/pricebook` and this stops being a guess.
     */
    id: "shrub_transplant",
    name: "Transplant an existing shrub",
    unit: "EA",
    components: [
      { costItemId: "labor_crew", productionRate: 1.2 },
      { costItemId: "planting_soil", qtyPerUnit: 0.05 },
    ],
  },
  {
    id: "boulder_place_18",
    name: "Accent boulder placement, 18in",
    unit: "EA",
    components: [
      { costItemId: "boulder_18in", qtyPerUnit: 1 },
      { costItemId: "labor_crew", productionRate: 2 },
      { costItemId: "skidsteer", qtyPerUnit: 0.5 },
    ],
  },
  {
    id: "boulder_place_24",
    name: "Accent boulder placement, 24in",
    unit: "EA",
    components: [
      { costItemId: "boulder_24in", qtyPerUnit: 1 },
      { costItemId: "labor_crew", productionRate: 1.5 },
      { costItemId: "skidsteer", qtyPerUnit: 0.75 },
    ],
  },
];

/** One install assembly per living SKU: plant + soil + labor (+ machine for trees). */
const plantInstallAssemblies: Assembly[] = plantSkus.map((p) => {
  const sc = sizeClasses[p.sizeClass];
  const components: Assembly["components"] = [
    { costItemId: p.id, qtyPerUnit: 1 },
    { costItemId: "planting_soil", qtyPerUnit: sc.soilCyPerEa },
    { costItemId: "labor_crew", productionRate: sc.productionRate },
  ];
  if (sc.skidsteerHrPerEa) {
    components.push({ costItemId: "skidsteer", qtyPerUnit: sc.skidsteerHrPerEa });
  }
  return {
    id: `install_${p.id}`,
    name: `${p.name}, planted (${p.meta.installSize})`,
    unit: "EA",
    components,
  };
});

export const wiPriceBook: PriceBook = {
  costItems: [...hardGoods, ...plantCostItems],
  assemblies: [...fixedAssemblies, ...plantInstallAssemblies],
};

// ---------------------------------------------------------------------------
// Margin + disclosure defaults (WI-average placeholder)
// ---------------------------------------------------------------------------

export const wiMarginConfig: MarginConfig = {
  targetGmPct: 45,
  minGmPct: 35,
  contingencyPct: 5,
};

export const wiBandPolicy: DisclosurePolicy = {
  mode: "band",
  bandWidthPct: 15,
  showUnitRates: false,
  roundTo: 100,
};

/**
 * The disclosure used for the final quote, after a rep has confirmed
 * quantities on site (Phase 6). A figure rather than a band — the band
 * expressed uncertainty about quantities nobody had measured, and the site
 * visit is what removes it. Rounded finer than the band ($25 vs $100)
 * because a quote is a number the customer signs, not a range they browse.
 */
export const wiFinalQuotePolicy: DisclosurePolicy = {
  mode: "figure",
  bandWidthPct: 0,
  showUnitRates: false,
  roundTo: 25,
};

// ---------------------------------------------------------------------------
// Quantity distributions by job type — ESTIMATED, not from real bids.
// P25/P50/P75 for typical WI suburban residential lots and small HOA/
// commercial frontages. This is the table the contractor's history must
// eventually replace — it is the defensibility of the opening band.
// ---------------------------------------------------------------------------

export const wiDistributions: Record<
  JobType,
  Record<MarketContext, Record<string, QuantityDistribution>>
> = {
  mulch_to_stone: {
    residential: {
      bed_area_sf: { unit: "SF", p25: 150, p50: 300, p75: 550 },
      edging_lf: { unit: "LF", p25: 40, p50: 80, p75: 140 },
    },
    hoa_commercial: {
      bed_area_sf: { unit: "SF", p25: 600, p50: 1200, p75: 2500 },
      edging_lf: { unit: "LF", p25: 150, p50: 300, p75: 600 },
    },
  },
  bed_renovation: {
    residential: {
      bed_area_sf: { unit: "SF", p25: 200, p50: 350, p75: 600 },
      edging_lf: { unit: "LF", p25: 50, p50: 90, p75: 150 },
      shrubs_ea: { unit: "EA", p25: 6, p50: 10, p75: 16 },
      perennials_ea: { unit: "EA", p25: 8, p50: 15, p75: 24 },
    },
    hoa_commercial: {
      bed_area_sf: { unit: "SF", p25: 800, p50: 1500, p75: 3000 },
      edging_lf: { unit: "LF", p25: 180, p50: 350, p75: 700 },
      shrubs_ea: { unit: "EA", p25: 20, p50: 40, p75: 75 },
      perennials_ea: { unit: "EA", p25: 30, p50: 60, p75: 120 },
    },
  },
  foundation_planting_refresh: {
    residential: {
      removals_ea: { unit: "EA", p25: 5, p50: 8, p75: 12 },
      shrubs_ea: { unit: "EA", p25: 6, p50: 10, p75: 14 },
      perennials_ea: { unit: "EA", p25: 6, p50: 12, p75: 18 },
      bed_area_sf: { unit: "SF", p25: 150, p50: 250, p75: 400 },
    },
    hoa_commercial: {
      removals_ea: { unit: "EA", p25: 12, p50: 25, p75: 45 },
      shrubs_ea: { unit: "EA", p25: 15, p50: 30, p75: 55 },
      perennials_ea: { unit: "EA", p25: 20, p50: 40, p75: 70 },
      bed_area_sf: { unit: "SF", p25: 500, p50: 900, p75: 1600 },
    },
  },
};

/**
 * What a typical job of each type is made of. Representative SKUs stand in
 * for "a shrub" / "a perennial" until real bid mixes exist.
 */
export const wiRecipes: Record<JobType, RecipeLine[]> = {
  mulch_to_stone: [
    { assemblyId: "stone_bed_conversion", distributionKey: "bed_area_sf" },
    { assemblyId: "steel_edging_install", distributionKey: "edging_lf" },
  ],
  bed_renovation: [
    { assemblyId: "bed_prep_renovation", distributionKey: "bed_area_sf" },
    { assemblyId: "mulch_install_hardwood", distributionKey: "bed_area_sf" },
    { assemblyId: "steel_edging_install", distributionKey: "edging_lf" },
    { assemblyId: "install_plant_hydrangea_annabelle", distributionKey: "shrubs_ea" },
    { assemblyId: "install_plant_daylily_stella", distributionKey: "perennials_ea" },
  ],
  foundation_planting_refresh: [
    { assemblyId: "shrub_removal", distributionKey: "removals_ea" },
    { assemblyId: "install_plant_boxwood_green_velvet", distributionKey: "shrubs_ea" },
    { assemblyId: "install_plant_hosta_patriot", distributionKey: "perennials_ea" },
    { assemblyId: "mulch_install_hardwood", distributionKey: "bed_area_sf" },
  ],
};

export const wiTypologyConfig: TypologyConfig = {
  priceBook: wiPriceBook,
  margin: wiMarginConfig,
  roundTo: wiBandPolicy.roundTo,
  recipes: wiRecipes,
  distributions: wiDistributions,
};
