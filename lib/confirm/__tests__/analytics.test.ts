/**
 * The corpus query — mean and P90 error by job type. project-map §6 calls
 * it the whole business, so it gets hand-checkable numbers rather than
 * snapshot assertions.
 */
import { describe, expect, it } from "vitest";

import type { Quantity } from "../../pricing/types";
import { EMPTY_STATS, analyzeDeltas, errorStats, percentile } from "../analytics";
import { recordCorrection } from "../deltas";
import type { ConfirmableUnit, MeasurementDelta } from "../types";

let seq = 0;
const mint = () => `id-${++seq}`;

function delta(opts: {
  before: number;
  after: number;
  unit?: ConfirmableUnit;
  source?: Quantity["source"];
  jobType?: "mulch_to_stone" | "bed_renovation" | "foundation_planting_refresh";
  projectId?: string;
}): MeasurementDelta {
  const unit = opts.unit ?? "SF";
  return recordCorrection(
    { photoRegionId: "demo_bed", unit, value: opts.after },
    {
      value: opts.before,
      unit,
      source: opts.source ?? "user_drawn",
      confidence: 0.85,
      capturedAt: "2026-04-01T12:00:00.000Z",
    },
    {
      projectId: opts.projectId ?? "project-1",
      jobType: opts.jobType ?? "mulch_to_stone",
      marketContext: "residential",
      correctedBy: "Sam Rep",
      regionLabels: { demo_bed: "Bed along walkway" },
    },
    { mint, now: () => "2026-05-02T15:30:00.000Z" },
  );
}

describe("percentile", () => {
  it("is nearest-rank, not interpolated", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 90)).toBe(9);
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 100)).toBe(10);
  });

  it("handles the single-observation and empty cases", () => {
    expect(percentile([42], 90)).toBe(42);
    expect(percentile([], 90)).toBe(0);
  });
});

describe("errorStats", () => {
  it("is empty for no deltas", () => {
    expect(errorStats([])).toEqual(EMPTY_STATS);
  });

  it("separates bias from magnitude", () => {
    // +20% and -20%: the estimator misses by 20% every time, but has no
    // systematic lean. A signed mean alone would report it as perfect.
    const stats = errorStats([
      delta({ before: 120, after: 100 }),
      delta({ before: 80, after: 100 }),
    ]);
    expect(stats.count).toBe(2);
    expect(stats.meanErrorPct).toBe(0);
    expect(stats.meanAbsErrorPct).toBe(20);
    expect(stats.p90AbsErrorPct).toBe(20);
  });

  it("computes mean and P90 against a hand-checked set", () => {
    // Errors of +10, +20, +30, +40, +50, +60, +70, +80, +90, +100 percent.
    const deltas = [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0].map((factor) =>
      delta({ before: 100 * factor, after: 100 }),
    );
    const stats = errorStats(deltas);
    expect(stats.count).toBe(10);
    expect(stats.meanErrorPct).toBe(55);
    expect(stats.meanAbsErrorPct).toBe(55);
    expect(stats.medianAbsErrorPct).toBe(50);
    // Nearest rank at n=10: the 9th of 10 sorted errors.
    expect(stats.p90AbsErrorPct).toBe(90);
    expect(stats.maxAbsErrorPct).toBe(100);
  });
});

describe("analyzeDeltas", () => {
  const deltas = [
    delta({ before: 400, after: 470, jobType: "mulch_to_stone" }),
    delta({ before: 500, after: 500, jobType: "mulch_to_stone" }),
    delta({
      before: 300,
      after: 600,
      jobType: "bed_renovation",
      source: "typology",
      projectId: "project-2",
    }),
    delta({ before: 80, after: 92, unit: "LF", jobType: "mulch_to_stone" }),
  ];

  it("cuts by job type", () => {
    const { byJobType } = analyzeDeltas(deltas);
    expect(byJobType.mulch_to_stone!.count).toBe(3);
    expect(byJobType.bed_renovation!.count).toBe(1);
    // The typology guess was 50% low on its single job.
    expect(byJobType.bed_renovation!.meanErrorPct).toBe(-50);
  });

  it("cuts by the provenance of the estimate that was corrected", () => {
    // The cut that justifies imagery spend: drawn-on-aerial error against
    // typology error, side by side.
    const { bySource } = analyzeDeltas(deltas);
    expect(bySource.user_drawn!.count).toBe(3);
    expect(bySource.typology!.count).toBe(1);
    expect(bySource.typology!.meanAbsErrorPct).toBeGreaterThan(
      bySource.user_drawn!.meanAbsErrorPct,
    );
  });

  it("cuts by dimension", () => {
    const { byUnit } = analyzeDeltas(deltas);
    expect(byUnit.SF!.count).toBe(3);
    expect(byUnit.LF!.count).toBe(1);
  });

  it("ranks the biggest misses first and caps the list", () => {
    const analytics = analyzeDeltas(deltas, 2);
    expect(analytics.worst).toHaveLength(2);
    expect(analytics.worst[0].errorPct).toBe(-50);
    expect(Math.abs(analytics.worst[0].errorPct)).toBeGreaterThanOrEqual(
      Math.abs(analytics.worst[1].errorPct),
    );
  });

  it("reports an empty corpus without dividing by zero", () => {
    const analytics = analyzeDeltas([]);
    expect(analytics.overall).toEqual(EMPTY_STATS);
    expect(analytics.byJobType).toEqual({});
    expect(analytics.worst).toEqual([]);
  });
});
