import { indexCostItems, rollupAssembly } from "./assemblies";
import type {
  InternalEstimate,
  LineItem,
  MarginConfig,
  PriceBook,
  Selection,
} from "./types";

/**
 * The pricing engine. Pure function: quantities + price book + config in,
 * internal estimate out. No I/O of any kind lives in this module.
 */
export function buildEstimate(
  selections: Selection[],
  priceBook: PriceBook,
  margin: MarginConfig,
  options?: {
    /** Rep-adjusted margin; clamped to the configured floor. */
    overrideGmPct?: number;
  },
): InternalEstimate {
  if (selections.length === 0) {
    throw new Error("Cannot build an estimate from zero selections");
  }

  const costItemsById = indexCostItems(priceBook.costItems);
  const assembliesById = new Map(priceBook.assemblies.map((a) => [a.id, a]));

  const lineItems: LineItem[] = selections.map((selection) => {
    const assembly = assembliesById.get(selection.assemblyId);
    if (!assembly) {
      throw new Error(`Unknown assembly "${selection.assemblyId}"`);
    }
    return rollupAssembly(assembly, selection.quantity, costItemsById);
  });

  const directCost = lineItems.reduce((sum, li) => sum + li.directCost, 0);
  const contingency = directCost * (margin.contingencyPct / 100);
  const totalCost = directCost + contingency;

  const requestedGm = options?.overrideGmPct ?? margin.targetGmPct;
  const appliedGmPct = Math.max(requestedGm, margin.minGmPct);
  if (appliedGmPct >= 100) {
    throw new Error(`Gross margin ${appliedGmPct}% is not achievable`);
  }

  // Margin on price, not markup on cost: sell = cost / (1 - gm).
  const sellPrice = totalCost / (1 - appliedGmPct / 100);
  const grossMargin = sellPrice - totalCost;

  return {
    lineItems,
    directCost,
    contingency,
    totalCost,
    appliedGmPct,
    grossMargin,
    sellPrice,
  };
}
