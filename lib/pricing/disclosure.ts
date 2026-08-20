import type {
  CustomerFacingPayload,
  DisclosurePolicy,
  InternalEstimate,
} from "./types";

const DEFAULT_TIERS = [
  { label: "Good", multiplier: 1.0 },
  { label: "Better", multiplier: 1.15 },
  { label: "Best", multiplier: 1.35 },
];

function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Project the internal estimate through the contractor's disclosure policy.
 *
 * This is the only path from an InternalEstimate to a customer surface.
 * The payload carries display prices and scope descriptions only — no unit
 * rates, no cost breakdown, no margin, no internal totals.
 */
export function applyDisclosure(
  estimate: InternalEstimate,
  policy: DisclosurePolicy,
): CustomerFacingPayload {
  if (policy.showUnitRates !== false) {
    throw new Error("Unit rates must never reach a customer surface");
  }
  if (policy.roundTo <= 0) {
    throw new Error("roundTo must be a positive increment");
  }

  const scope = estimate.lineItems.map((li) => li.description);
  const sell = estimate.sellPrice;

  switch (policy.mode) {
    case "band": {
      // Round the band outward so the displayed range always contains the
      // computed sell price.
      const low = floorTo(sell * (1 - policy.bandWidthPct / 100), policy.roundTo);
      const high = ceilTo(sell * (1 + policy.bandWidthPct / 100), policy.roundTo);
      return { mode: "band", currency: "USD", low, high, scope };
    }
    case "tiers": {
      const tiers = (policy.tierMultipliers ?? DEFAULT_TIERS).map((tier) => ({
        label: tier.label,
        price: roundTo(sell * tier.multiplier, policy.roundTo),
      }));
      return { mode: "tiers", currency: "USD", tiers, scope };
    }
    case "figure": {
      return {
        mode: "figure",
        currency: "USD",
        price: roundTo(sell, policy.roundTo),
        scope,
      };
    }
  }
}
