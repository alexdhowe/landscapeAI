/**
 * Pure pricing domain types. This module (and everything in lib/pricing)
 * must never import from app/, lib/db/, or anything that does I/O.
 */

/** Units a measured quantity may carry. */
export type QuantityUnit = "SF" | "LF" | "EA" | "CY";

/** Units a cost item may be priced in (measured units plus labor/equipment hours and bulk tons). */
export type CostUnit = QuantityUnit | "HR" | "TON";

export type QuantitySource =
  | "aerial"
  | "photo"
  | "user_drawn"
  | "rep_confirmed"
  | "as_built";

/**
 * Architectural invariant: no bare numbers. Every quantity carries
 * provenance, confidence, and lineage.
 */
export type Quantity = {
  value: number;
  unit: QuantityUnit;
  source: QuantitySource;
  confidence: number; // 0-1
  capturedAt: string; // ISO
  supersedes?: string; // id of the quantity this replaced
};

export type CostItemKind = "material" | "labor" | "equipment" | "disposal";

export type CostItem = {
  id: string;
  name: string;
  kind: CostItemKind;
  unit: CostUnit;
  unitCost: number;
  /** Applied to cost (labor burden: taxes, insurance, benefits). */
  burdenPct?: number;
  /** Applied to quantity (material overage: cuts, spillage, compaction). */
  wasteFactorPct?: number;
};

export type AssemblyComponent = {
  costItemId: string;
  /**
   * Cost-item units consumed per assembly unit (e.g. 0.0093 CY of stone
   * per SF for a 3in lift). Ignored when productionRate is set.
   */
  qtyPerUnit?: number;
  /**
   * Assembly units produced per labor/equipment hour. When set, hours =
   * assemblyQty / productionRate and qtyPerUnit must be omitted.
   */
  productionRate?: number;
};

export type Assembly = {
  id: string;
  name: string;
  unit: QuantityUnit;
  components: AssemblyComponent[];
};

export type PriceBook = {
  costItems: CostItem[];
  assemblies: Assembly[];
};

export type MarginConfig = {
  targetGmPct: number;
  minGmPct: number;
  contingencyPct: number;
};

export type TierMultiplier = {
  label: string;
  multiplier: number;
};

export type DisclosurePolicy = {
  mode: "band" | "tiers" | "figure";
  /** Half-width of the band as a percent of the sell price. */
  bandWidthPct: number;
  /** Must stay false: unit rates never reach a customer surface. */
  showUnitRates: false;
  /** Prices are rounded to this increment before display. */
  roundTo: number;
  /** Tier definitions for mode "tiers"; defaults to Good/Better/Best. */
  tierMultipliers?: TierMultiplier[];
};

/** One priced component inside a line item — internal only. */
export type ComponentCost = {
  costItemId: string;
  name: string;
  kind: CostItemKind;
  /** Quantity after waste factor, in the cost item's unit. */
  quantity: number;
  unit: CostUnit;
  unitCost: number;
  /** Cost including burden. */
  extendedCost: number;
};

export type CostByKind = Record<CostItemKind, number>;

/** One priced assembly at a quantity — internal only. */
export type LineItem = {
  assemblyId: string;
  description: string;
  /** Provenance-carrying quantity this line was priced from, unchanged. */
  quantity: Quantity;
  components: ComponentCost[];
  costByKind: CostByKind;
  directCost: number;
};

export type Selection = {
  assemblyId: string;
  quantity: Quantity;
};

/** The internal estimate. Never rendered to a customer surface. */
export type InternalEstimate = {
  lineItems: LineItem[];
  directCost: number;
  contingency: number;
  totalCost: number;
  /** Gross margin percent actually applied (after floor clamp). */
  appliedGmPct: number;
  grossMargin: number;
  sellPrice: number;
};

/**
 * What the customer sees: a projection of the estimate through the
 * disclosure policy. Contains no unit rates, no costs, no margin — only
 * display prices and scope descriptions.
 */
export type CustomerFacingPayload =
  | { mode: "band"; currency: "USD"; low: number; high: number; scope: string[] }
  | {
      mode: "tiers";
      currency: "USD";
      tiers: { label: string; price: number }[];
      scope: string[];
    }
  | { mode: "figure"; currency: "USD"; price: number; scope: string[] };
