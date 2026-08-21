/**
 * The correction primitive: lineage, provenance, and the error measure the
 * whole corpus is built on.
 */
import { describe, expect, it } from "vitest";

import type { Quantity } from "../../pricing/types";
import {
  InvalidCorrectionError,
  MAX_CONFIRMED_VALUE,
  REP_CONFIRMED_CONFIDENCE,
  confirmQuantity,
  confirmedQuantity,
  confirmedRegionIds,
  errorPct,
  identifyQuantity,
  recordCorrection,
} from "../deltas";
import type { Correction, MeasurementDelta } from "../types";

const AERIAL_400: Quantity = {
  value: 400,
  unit: "SF",
  source: "user_drawn",
  confidence: 0.85,
  capturedAt: "2026-04-01T12:00:00.000Z",
};

/** Deterministic ids so lineage assertions read as lineage, not as luck. */
function minter(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const context = {
  projectId: "project-1",
  jobType: "mulch_to_stone" as const,
  marketContext: "residential" as const,
  correctedBy: "Sam Rep",
  regionLabels: { demo_bed: "Bed along walkway" },
};

const options = (prefix = "q") => ({
  mint: minter(prefix),
  now: () => "2026-05-02T15:30:00.000Z",
});

describe("identifyQuantity", () => {
  it("gives an unidentified quantity an id", () => {
    const identified = identifyQuantity(AERIAL_400, minter("q"));
    expect(identified.id).toBe("q-1");
    expect(identified.value).toBe(400);
    // The original is untouched — nothing in this layer mutates.
    expect(AERIAL_400.id).toBeUndefined();
  });

  it("leaves an already-identified quantity alone", () => {
    const already = { ...AERIAL_400, id: "existing" };
    expect(identifyQuantity(already, minter("q")).id).toBe("existing");
  });
});

describe("confirmQuantity", () => {
  it("mints a rep_confirmed quantity that supersedes the one it replaces", () => {
    const { before, after } = confirmQuantity(AERIAL_400, 470, options());
    expect(after.value).toBe(470);
    expect(after.unit).toBe("SF");
    expect(after.source).toBe("rep_confirmed");
    expect(after.confidence).toBe(REP_CONFIRMED_CONFIDENCE);
    expect(after.capturedAt).toBe("2026-05-02T15:30:00.000Z");
    // The lineage: the new quantity points at the identified old one.
    expect(after.supersedes).toBe(before.id);
    expect(after.id).not.toBe(before.id);
  });

  it("chains: correcting a confirmed quantity supersedes that one, not the original", () => {
    const first = confirmQuantity(AERIAL_400, 470, options("a"));
    const second = confirmQuantity(first.after, 455, options("b"));
    expect(second.before.id).toBe(first.after.id);
    expect(second.after.supersedes).toBe(first.after.id);
    // The original estimate is still reachable one hop further back.
    expect(first.after.supersedes).toBe(first.before.id);
  });

  it("rejects values a tape could not have produced", () => {
    for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => confirmQuantity(AERIAL_400, value)).toThrow(InvalidCorrectionError);
    }
    expect(() => confirmQuantity(AERIAL_400, MAX_CONFIRMED_VALUE + 1)).toThrow(
      InvalidCorrectionError,
    );
  });
});

describe("recordCorrection", () => {
  const correction: Correction = { photoRegionId: "demo_bed", unit: "SF", value: 470 };

  it("captures everything the corpus needs at write time", () => {
    const delta = recordCorrection(correction, AERIAL_400, context, options());
    expect(delta.projectId).toBe("project-1");
    expect(delta.regionId).toBe("demo_bed");
    expect(delta.regionLabel).toBe("Bed along walkway");
    expect(delta.jobType).toBe("mulch_to_stone");
    expect(delta.marketContext).toBe("residential");
    expect(delta.unit).toBe("SF");
    expect(delta.beforeQty.value).toBe(400);
    // The provenance of what was corrected is the corpus's independent
    // variable — it must survive on the record.
    expect(delta.beforeQty.source).toBe("user_drawn");
    expect(delta.afterQty.value).toBe(470);
    expect(delta.source).toBe("rep_confirmed");
    expect(delta.correctedBy).toBe("Sam Rep");
    expect(delta.correctedAt).toBe(delta.afterQty.capturedAt);
  });

  it("falls back to the region id when the label is unknown", () => {
    const delta = recordCorrection(
      { photoRegionId: "unlabelled", unit: "SF", value: 200 },
      AERIAL_400,
      context,
      options(),
    );
    expect(delta.regionLabel).toBe("unlabelled");
  });

  it("refuses to correct a quantity in a different unit", () => {
    expect(() =>
      recordCorrection(
        { photoRegionId: "demo_bed", unit: "LF", value: 90 },
        AERIAL_400,
        context,
        options(),
      ),
    ).toThrow(InvalidCorrectionError);
  });

  it("records a correction that matches the estimate exactly", () => {
    // Zero-error confirmations are evidence the estimator works. Dropping
    // them would bias the corpus toward its own misses.
    const delta = recordCorrection(
      { photoRegionId: "demo_bed", unit: "SF", value: 400 },
      AERIAL_400,
      context,
      options(),
    );
    expect(errorPct(delta)).toBe(0);
    expect(delta.afterQty.source).toBe("rep_confirmed");
  });

  it("keeps a site note when one is given", () => {
    const delta = recordCorrection(
      { ...correction, note: "bed wraps behind the downspout" },
      AERIAL_400,
      context,
      options(),
    );
    expect(delta.note).toBe("bed wraps behind the downspout");
  });
});

describe("errorPct", () => {
  const delta = (before: number, after: number): MeasurementDelta =>
    recordCorrection(
      { photoRegionId: "demo_bed", unit: "SF", value: after },
      { ...AERIAL_400, value: before },
      context,
      options(),
    );

  it("is negative when the estimate was low", () => {
    // 400 estimated, 470 confirmed: we would have under-bid by 14.9%.
    expect(errorPct(delta(400, 470))).toBeCloseTo(-14.894, 2);
  });

  it("is positive when the estimate was high", () => {
    expect(errorPct(delta(500, 400))).toBeCloseTo(25, 6);
  });
});

describe("confirmedQuantity", () => {
  const first = recordCorrection(
    { photoRegionId: "demo_bed", unit: "SF", value: 470 },
    AERIAL_400,
    context,
    options("a"),
  );
  const second = recordCorrection(
    { photoRegionId: "demo_bed", unit: "SF", value: 455 },
    first.afterQty,
    context,
    options("b"),
  );
  const perimeter = recordCorrection(
    { photoRegionId: "demo_bed", unit: "LF", value: 92 },
    { ...AERIAL_400, unit: "LF", value: 80 },
    context,
    options("c"),
  );
  const deltas = [first, second, perimeter];

  it("returns the newest correction for the region and dimension", () => {
    expect(confirmedQuantity(deltas, "demo_bed", "SF")!.value).toBe(455);
    expect(confirmedQuantity(deltas, "demo_bed", "LF")!.value).toBe(92);
  });

  it("returns null for a region or dimension nobody corrected", () => {
    expect(confirmedQuantity(deltas, "demo_turf", "SF")).toBeNull();
    expect(confirmedQuantity([], "demo_bed", "SF")).toBeNull();
  });

  it("lists every corrected region once", () => {
    expect(confirmedRegionIds(deltas)).toEqual(["demo_bed"]);
  });
});
