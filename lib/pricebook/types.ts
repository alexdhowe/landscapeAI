/**
 * The price book as an editable document.
 *
 * `PricingConfig` is everything that turns quantities into a price — the
 * book, the margin, both disclosure policies, and the bid distributions and
 * recipes behind the opening band. It is exactly what a revision holds and
 * exactly what lib/pricing needs handed to it, which is the point: what an
 * admin edits and what the engine consumes are the same object, so there is
 * no translation layer to get wrong.
 *
 * Pure types. No I/O.
 */
import type { PlantMeta } from "../catalog/types";
import type { DisclosurePolicy, MarginConfig, PriceBook } from "../pricing/types";
import type { TypologyConfig } from "../pricing/typology";

export type PricingConfig = {
  priceBook: PriceBook;
  /**
   * Plant metadata by SKU. Section 7 requires it at seed time — the time
   * slider cannot exist without it and it cannot be backfilled from a bid —
   * so it travels with the book rather than beside it. Not pricing data,
   * which is why it is here and not on CostItem: lib/pricing has no use for
   * a mature spread.
   */
  plantMeta: Record<string, PlantMeta>;
  margin: MarginConfig;
  bandPolicy: DisclosurePolicy;
  finalQuotePolicy: DisclosurePolicy;
  recipes: TypologyConfig["recipes"];
  distributions: TypologyConfig["distributions"];
};

export type RevisionStatus = "draft" | "published";

/** A revision's identity, without its contents. */
export type RevisionMeta = {
  id: string;
  revision: number;
  status: RevisionStatus;
  label: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
  publishedBy: string | null;
  /** Null while a draft. Point-in-time lookups order by this. */
  publishedAt: string | null;
};

export type PriceBookRevision = RevisionMeta & { config: PricingConfig };

/** The `roundTo` a band is displayed at comes from the band policy. */
export function toTypologyConfig(config: PricingConfig): TypologyConfig {
  return {
    priceBook: config.priceBook,
    margin: config.margin,
    roundTo: config.bandPolicy.roundTo,
    recipes: config.recipes,
    distributions: config.distributions,
  };
}
