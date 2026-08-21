/**
 * Editing a draft.
 *
 * Every operation is a pure function from one PricingConfig to the next, so
 * the interesting behaviour — what happens when you delete a SKU three
 * assemblies use — is unit-testable without a database anywhere near it.
 * lib/db/queries.ts does the read, applies one of these, and writes the
 * result back in a single transaction.
 *
 * Deletes refuse rather than cascade. Removing a SKU that assemblies price
 * with, or an assembly a recipe is built from, is nearly always a mistake,
 * and a cascade would carry it out silently across the book.
 *
 * Pure. No I/O.
 */
import type { Assembly, CostItem } from "../pricing/types";
import type { JobType, MarketContext, QuantityDistribution, RecipeLine } from "../pricing/typology";

import type { PricingConfig } from "./types";

/** Thrown when an edit would leave the book referring to something absent. */
export class PriceBookEditError extends Error {
  readonly conflicts: string[];
  constructor(message: string, conflicts: string[] = []) {
    super(message);
    this.name = "PriceBookEditError";
    this.conflicts = conflicts;
  }
}

const clone = (config: PricingConfig): PricingConfig => structuredClone(config);

const sortById = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.id.localeCompare(b.id));

export function upsertCostItem(config: PricingConfig, item: CostItem): PricingConfig {
  const next = clone(config);
  const rest = next.priceBook.costItems.filter((c) => c.id !== item.id);
  next.priceBook.costItems = sortById([...rest, item]);
  return next;
}

export function removeCostItem(config: PricingConfig, sku: string): PricingConfig {
  const users = config.priceBook.assemblies
    .filter((a) => a.components.some((c) => c.costItemId === sku))
    .map((a) => a.name);
  if (users.length > 0) {
    throw new PriceBookEditError(
      `"${sku}" is priced into ${users.length} assembl${users.length === 1 ? "y" : "ies"}. Remove it from those first.`,
      users,
    );
  }
  const next = clone(config);
  next.priceBook.costItems = next.priceBook.costItems.filter((c) => c.id !== sku);
  return next;
}

export function upsertAssembly(config: PricingConfig, assembly: Assembly): PricingConfig {
  const skus = new Set(config.priceBook.costItems.map((c) => c.id));
  const missing = assembly.components
    .map((c) => c.costItemId)
    .filter((sku) => !skus.has(sku));
  if (missing.length > 0) {
    throw new PriceBookEditError(
      `This assembly prices with SKUs that are not in the book: ${missing.join(", ")}.`,
      missing,
    );
  }
  const next = clone(config);
  const rest = next.priceBook.assemblies.filter((a) => a.id !== assembly.id);
  next.priceBook.assemblies = sortById([...rest, assembly]);
  return next;
}

export function removeAssembly(config: PricingConfig, key: string): PricingConfig {
  const recipeUsers = (Object.entries(config.recipes) as [JobType, RecipeLine[]][])
    .filter(([, lines]) => lines.some((l) => l.assemblyId === key))
    .map(([jobType]) => jobType);
  if (recipeUsers.length > 0) {
    throw new PriceBookEditError(
      `"${key}" is part of the opening band for ${recipeUsers.join(", ")}. Change those recipes first.`,
      recipeUsers,
    );
  }
  const next = clone(config);
  next.priceBook.assemblies = next.priceBook.assemblies.filter((a) => a.id !== key);
  return next;
}

export function updateSettings(
  config: PricingConfig,
  patch: Partial<Pick<PricingConfig, "margin" | "bandPolicy" | "finalQuotePolicy">>,
): PricingConfig {
  const next = clone(config);
  if (patch.margin) next.margin = { ...next.margin, ...patch.margin };
  // showUnitRates is typed `false` and stays that way: a policy is not a
  // place a contractor can decide to show costs to a customer.
  if (patch.bandPolicy) {
    next.bandPolicy = { ...next.bandPolicy, ...patch.bandPolicy, showUnitRates: false };
  }
  if (patch.finalQuotePolicy) {
    next.finalQuotePolicy = {
      ...next.finalQuotePolicy,
      ...patch.finalQuotePolicy,
      showUnitRates: false,
    };
  }
  return next;
}

export function upsertDistribution(
  config: PricingConfig,
  jobType: JobType,
  context: MarketContext,
  key: string,
  distribution: QuantityDistribution,
): PricingConfig {
  const next = clone(config);
  next.distributions[jobType][context][key] = distribution;
  return next;
}

export function removeDistribution(
  config: PricingConfig,
  jobType: JobType,
  context: MarketContext,
  key: string,
): PricingConfig {
  const used = (config.recipes[jobType] ?? []).some((l) => l.distributionKey === key);
  if (used) {
    throw new PriceBookEditError(
      `The ${jobType} recipe is driven by "${key}". Change the recipe first.`,
      [key],
    );
  }
  const next = clone(config);
  delete next.distributions[jobType][context][key];
  return next;
}

export function setRecipe(
  config: PricingConfig,
  jobType: JobType,
  lines: RecipeLine[],
): PricingConfig {
  const assemblies = new Set(config.priceBook.assemblies.map((a) => a.id));
  const missing = lines.map((l) => l.assemblyId).filter((id) => !assemblies.has(id));
  if (missing.length > 0) {
    throw new PriceBookEditError(
      `This recipe names assemblies that are not in the book: ${missing.join(", ")}.`,
      missing,
    );
  }
  const next = clone(config);
  next.recipes[jobType] = [...lines];
  return next;
}
