/**
 * Phase 1.5 — typology bands.
 *
 * The opening price shown before anything is measured: take the P25/P50/P75
 * of quantity from historical bid distributions for a job type, run each
 * percentile through the Phase 1 engine, and present the P25→P75 sell
 * prices as a band. Pure function — distributions and price book come in
 * as arguments.
 */
import { buildEstimate } from "./engine";
import { ceilTo, floorTo, roundTo } from "./rounding";
import type {
  MarginConfig,
  PriceBook,
  Quantity,
  QuantityUnit,
  Selection,
} from "./types";

export type JobType =
  | "bed_renovation"
  | "mulch_to_stone"
  | "foundation_planting_refresh";

export type MarketContext = "residential" | "hoa_commercial";

/** Percentiles of one driving quantity across historical bids. */
export type QuantityDistribution = {
  unit: QuantityUnit;
  p25: number;
  p50: number;
  p75: number;
};

/** One line of a job-type recipe: which assembly, driven by which distribution. */
export type RecipeLine = {
  assemblyId: string;
  distributionKey: string;
};

export type TypologyConfig = {
  priceBook: PriceBook;
  margin: MarginConfig;
  /** Display rounding increment for the band endpoints. */
  roundTo: number;
  recipes: Record<JobType, RecipeLine[]>;
  distributions: Record<
    JobType,
    Record<MarketContext, Record<string, QuantityDistribution>>
  >;
};

export type TypologyBand = {
  jobType: JobType;
  context: MarketContext;
  currency: "USD";
  /** P25 sell price, rounded down to the display increment. */
  low: number;
  /** P75 sell price, rounded up to the display increment. */
  high: number;
  /** P50 sell price, rounded to the display increment. */
  typical: number;
  basis: "typology";
};

function percentileQuantity(
  dist: QuantityDistribution,
  percentile: "p25" | "p50" | "p75",
  capturedAt: string,
): Quantity {
  return {
    value: dist[percentile],
    unit: dist.unit,
    source: "typology",
    confidence: 0.3,
    capturedAt,
  };
}

function sellAtPercentile(
  jobType: JobType,
  percentile: "p25" | "p50" | "p75",
  dists: Record<string, QuantityDistribution>,
  config: TypologyConfig,
  capturedAt: string,
): number {
  const selections: Selection[] = config.recipes[jobType].map((line) => {
    const dist = dists[line.distributionKey];
    if (!dist) {
      throw new Error(
        `Job type "${jobType}" recipe needs distribution "${line.distributionKey}" but none is configured`,
      );
    }
    return {
      assemblyId: line.assemblyId,
      quantity: percentileQuantity(dist, percentile, capturedAt),
    };
  });
  return buildEstimate(selections, config.priceBook, config.margin).sellPrice;
}

export function getTypologyBand(
  jobType: JobType,
  context: MarketContext,
  config: TypologyConfig,
  now: () => string = () => new Date().toISOString(),
): TypologyBand {
  const dists = config.distributions[jobType]?.[context];
  if (!dists) {
    throw new Error(`No distributions configured for ${jobType}/${context}`);
  }
  const capturedAt = now();

  const sellP25 = sellAtPercentile(jobType, "p25", dists, config, capturedAt);
  const sellP50 = sellAtPercentile(jobType, "p50", dists, config, capturedAt);
  const sellP75 = sellAtPercentile(jobType, "p75", dists, config, capturedAt);

  return {
    jobType,
    context,
    currency: "USD",
    low: floorTo(sellP25, config.roundTo),
    high: ceilTo(sellP75, config.roundTo),
    typical: roundTo(sellP50, config.roundTo),
    basis: "typology",
  };
}
