/**
 * The corpus query — mean and P90 estimation error by job type.
 *
 * project-map §6 calls this "the whole business", and it is: every delta
 * is a paid site visit that told you exactly how wrong your remote
 * estimate was. Aggregated, it says which job types you can price
 * sight-unseen, how wide the band has to be to stay honest, and whether
 * you are systematically over- or under-estimating.
 *
 * Two error measures, because they answer different questions:
 *
 *   - meanErrorPct is SIGNED. It is the bias — a fleet-wide +8% says the
 *     aerial reads long on this job type and the estimator can be
 *     corrected. Averaging signed errors hides magnitude, which is why it
 *     never appears alone.
 *   - meanAbsErrorPct and p90AbsErrorPct are the spread — how wrong a
 *     single estimate can be. p90 is the one that sets band width: it is
 *     what the ninth-worst estimate in a hundred does, and a band narrower
 *     than that will be wrong in front of a customer.
 *
 * Pure; takes deltas in, returns numbers out.
 */
import type { JobType } from "../pricing/typology";
import type { QuantitySource } from "../pricing/types";
import { errorPct } from "./deltas";
import type { ConfirmableUnit, MeasurementDelta } from "./types";

export type ErrorStats = {
  /** Deltas behind these numbers. Read the rest with this in mind. */
  count: number;
  /** Signed mean error: the bias. Positive = we estimate high. */
  meanErrorPct: number;
  /** Mean absolute error: typical magnitude of a miss, direction ignored. */
  meanAbsErrorPct: number;
  /** Median absolute error — robust to the one wild delta. */
  medianAbsErrorPct: number;
  /** P90 absolute error (nearest rank): what the band has to survive. */
  p90AbsErrorPct: number;
  /** Worst single miss in the set. */
  maxAbsErrorPct: number;
};

export const EMPTY_STATS: ErrorStats = {
  count: 0,
  meanErrorPct: 0,
  meanAbsErrorPct: 0,
  medianAbsErrorPct: 0,
  p90AbsErrorPct: 0,
  maxAbsErrorPct: 0,
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Nearest-rank percentile on an ascending array: the smallest value at or
 * below which at least p% of observations fall. No interpolation — with
 * the double-digit sample sizes a contractor actually has, interpolating
 * between two points invents precision that isn't there.
 */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length, Math.max(1, rank)) - 1];
}

/** Aggregate one set of deltas. */
export function errorStats(deltas: MeasurementDelta[]): ErrorStats {
  if (deltas.length === 0) return EMPTY_STATS;
  const signed = deltas.map(errorPct);
  const absolute = signed.map(Math.abs).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

  return {
    count: deltas.length,
    meanErrorPct: round1(mean(signed)),
    meanAbsErrorPct: round1(mean(absolute)),
    medianAbsErrorPct: round1(percentile(absolute, 50)),
    p90AbsErrorPct: round1(percentile(absolute, 90)),
    maxAbsErrorPct: round1(absolute[absolute.length - 1]),
  };
}

function groupBy<K extends string>(
  deltas: MeasurementDelta[],
  key: (delta: MeasurementDelta) => K,
): Record<K, ErrorStats> {
  const buckets = new Map<K, MeasurementDelta[]>();
  for (const delta of deltas) {
    const k = key(delta);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(delta);
    else buckets.set(k, [delta]);
  }
  const out = {} as Record<K, ErrorStats>;
  for (const [k, bucket] of buckets) out[k] = errorStats(bucket);
  return out;
}

export type DeltaAnalytics = {
  overall: ErrorStats;
  /** The headline cut: how wrong are we, per kind of job. */
  byJobType: Partial<Record<JobType, ErrorStats>>;
  /**
   * By the provenance of the estimate that was corrected. This is the cut
   * that justifies spend: if 'user_drawn' aerial error is materially lower
   * than 'typology' error, the aerial leg is paying for itself.
   */
  bySource: Partial<Record<QuantitySource, ErrorStats>>;
  /** Area vs edge run — they miss for different reasons and by different amounts. */
  byUnit: Partial<Record<ConfirmableUnit, ErrorStats>>;
  /** Deltas with the largest absolute error first — the ones worth reading. */
  worst: { delta: MeasurementDelta; errorPct: number }[];
};

/**
 * The whole corpus, cut the ways that change a decision. `worstLimit`
 * caps the outlier list.
 */
export function analyzeDeltas(
  deltas: MeasurementDelta[],
  worstLimit = 10,
): DeltaAnalytics {
  return {
    overall: errorStats(deltas),
    byJobType: groupBy(deltas, (d) => d.jobType),
    bySource: groupBy(deltas, (d) => d.beforeQty.source),
    byUnit: groupBy(deltas, (d) => d.unit),
    worst: deltas
      .map((delta) => ({ delta, errorPct: round1(errorPct(delta)) }))
      .sort((a, b) => Math.abs(b.errorPct) - Math.abs(a.errorPct))
      .slice(0, worstLimit),
  };
}
