/**
 * The plants a customer may put in place of one that is already there.
 *
 * Derived from the org's price book rather than written out here, and that
 * is the whole point: a plant is offerable exactly when the book holds a
 * cost item for it, an `install_<sku>` assembly that plants it, and the
 * metadata section 3.5 needs to say how big it gets. A contractor who
 * removes a plant from `/pricebook` stops being asked to quote it, and one
 * who adds a plant can offer it without a code change. The catalog is the
 * guardrail (map section 1) — nothing can be selected that the pricing
 * engine cannot price — and deriving it is a stronger guarantee than a
 * list that a test checks.
 *
 * Nothing here carries a cost. This list is served to the browser, and
 * section 1 is explicit that internal rates never reach a customer
 * surface; the price is the assembly's job, on the server.
 *
 * Pure. No I/O.
 */
import type { PriceBook } from "../pricing/types";
import type { RegionKind } from "../vision/types";
import type { PlantMeta } from "./types";

/** What a plant looks like when it is drawn, deterministically, from the graph. */
export type PlantGlyphKind = "shrub" | "evergreen" | "grass" | "perennial" | "tree";

export type PlantOption = {
  /** Catalog option id, distinct from the SKU it installs. */
  id: string;
  skuId: string;
  assemblyId: string;
  label: string;
  category: PlantMeta["category"];
  foliage: PlantMeta["foliage"];
  form: string;
  installSize: string;
  matureHeightFt: number;
  matureSpreadFt: number;
  hardinessZone: string;
  glyph: PlantGlyphKind;
};

const GLYPH_BY_CATEGORY: Record<PlantMeta["category"], PlantGlyphKind> = {
  shrub: "shrub",
  evergreen_shrub: "evergreen",
  grass: "grass",
  perennial: "perennial",
  tree: "tree",
};

/** The option id for a SKU. One place, because two surfaces derive it. */
export function plantOptionId(skuId: string): string {
  return `plantsku_${skuId}`;
}

/**
 * Every plant the given price book can actually install, in a stable
 * order: biggest-growing first inside each category, so the picker reads
 * as a range of sizes rather than as whatever order the seed happened to
 * be written in.
 */
export function plantOptionsFor(
  priceBook: PriceBook,
  plantMeta: Record<string, PlantMeta>,
): PlantOption[] {
  const assemblies = new Set(priceBook.assemblies.map((a) => a.id));
  const options: PlantOption[] = [];
  for (const item of priceBook.costItems) {
    const meta = plantMeta[item.id];
    if (!meta) continue;
    const assemblyId = `install_${item.id}`;
    // No assembly, no price, no offer.
    if (!assemblies.has(assemblyId)) continue;
    options.push({
      id: plantOptionId(item.id),
      skuId: item.id,
      assemblyId,
      label: item.name,
      category: meta.category,
      foliage: meta.foliage,
      form: meta.form,
      installSize: meta.installSize,
      matureHeightFt: meta.matureHeightFt,
      matureSpreadFt: meta.matureSpreadFt,
      hardinessZone: meta.hardinessZone,
      glyph: GLYPH_BY_CATEGORY[meta.category],
    });
  }
  const order: PlantMeta["category"][] = [
    "evergreen_shrub",
    "shrub",
    "grass",
    "perennial",
    "tree",
  ];
  return options.sort(
    (a, b) =>
      order.indexOf(a.category) - order.indexOf(b.category) ||
      b.matureSpreadFt - a.matureSpreadFt ||
      a.label.localeCompare(b.label),
  );
}

/**
 * Which plants make sense in a region.
 *
 * A tree is not a foundation planting — it is the classic mistake this
 * catalog can prevent for free, since a 40-foot maple two feet from the
 * siding is a callback rather than a design. Beds take everything else.
 * Turf and hardscape have no plants to swap.
 */
export function plantOptionsForRegion(
  options: readonly PlantOption[],
  kind: RegionKind,
): PlantOption[] {
  if (kind === "turf" || kind === "hardscape") return [];
  if (kind === "foundation_planting") {
    return options.filter((o) => o.category !== "tree");
  }
  return [...options];
}

/**
 * The assembly that takes an existing plant out.
 *
 * "Existing shrub removal and disposal", per EA — crew time plus green
 * waste. It was already in the seed book and already in the foundation
 * refresh recipe before anything could select it, because a refresh has
 * always meant taking things out; what is new is that the customer can
 * now say which things.
 */
export const PLANT_REMOVAL_ASSEMBLY = "shrub_removal";

/**
 * Whether this contractor's book can price taking a plant out.
 *
 * The same guardrail as the plant catalog itself (map section 1): nothing
 * may be selected that the pricing engine cannot price, and the engine
 * throws on an assembly the book does not hold. A contractor who deletes
 * the removal assembly stops being offered removals rather than getting a
 * broken estimate — so this is what the design page asks before it shows
 * the control, and what the quote checks before it prices one.
 */
export function canRemovePlants(book: PriceBook): boolean {
  return book.assemblies.some((assembly) => assembly.id === PLANT_REMOVAL_ASSEMBLY);
}

/**
 * The job type a plant swap implies, from the region it stands in.
 *
 * Replanting against the house is a foundation refresh; replanting in a
 * bed is bed renovation. Both are job types the typology distributions
 * already carry, so a plant swap prices from the same evidence every other
 * selection does. Taking a plant out is the same question with the same
 * answer, so removals read this too.
 */
export function plantJobTypeForRegion(kind: RegionKind): "foundation_planting_refresh" | "bed_renovation" | null {
  if (kind === "foundation_planting") return "foundation_planting_refresh";
  if (kind === "bed") return "bed_renovation";
  return null;
}
