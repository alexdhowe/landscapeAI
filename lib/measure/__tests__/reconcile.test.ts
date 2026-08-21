import { describe, expect, it } from "vitest";

import type { Quantity } from "@/lib/pricing/types";
import type { SegmentedRegion } from "@/lib/vision/types";

import { measureRing, rectangleRing } from "../area";
import {
  AGREEMENT_MAX_DELTA_PCT,
  DISAGREEMENT_MIN_DELTA_PCT,
  TIGHTEN_BAND_FACTOR,
  WIDEN_BAND_FACTOR,
  areaDeltaPct,
  photoAreaQuantity,
  reconcileDesign,
  reconcileRegion,
  verdictForDelta,
} from "../reconcile";

const NOW = () => "2026-08-21T00:00:00Z";

function aerialQty(value: number, confidence = 0.85): Quantity {
  return { value, unit: "SF", source: "user_drawn", confidence, capturedAt: NOW() };
}

function photoRegion(
  id: string,
  estimatedAreaSf: number | undefined,
  overrides: Partial<SegmentedRegion> = {},
): SegmentedRegion {
  return {
    id,
    kind: "bed",
    label: `Region ${id}`,
    polygon: [
      [0.1, 0.5],
      [0.5, 0.5],
      [0.5, 0.8],
      [0.1, 0.8],
    ],
    existingMaterial: "hardwood mulch",
    condition: "faded",
    estimatedAreaSf,
    confidence: 0.85,
    ...overrides,
  };
}

describe("verdictForDelta", () => {
  it("applies the map's thresholds: ≤15% agrees, >25% disagrees, between holds", () => {
    expect(verdictForDelta(0)).toBe("agreement");
    expect(verdictForDelta(AGREEMENT_MAX_DELTA_PCT)).toBe("agreement");
    expect(verdictForDelta(20)).toBe("inconclusive");
    expect(verdictForDelta(DISAGREEMENT_MIN_DELTA_PCT)).toBe("inconclusive");
    expect(verdictForDelta(25.1)).toBe("disagreement");
    expect(verdictForDelta(null)).toBe("inconclusive");
  });
});

describe("areaDeltaPct", () => {
  it("measures the delta against the aerial number, the trusted denominator", () => {
    expect(areaDeltaPct(400, 300)).toBeCloseTo(25);
    expect(areaDeltaPct(300, 400)).toBeCloseTo(33.33, 1);
  });
});

describe("photoAreaQuantity", () => {
  it("labels the photo guess with source 'photo' and capped confidence", () => {
    const qty = photoAreaQuantity(photoRegion("bed_1", 300), NOW());
    expect(qty).toMatchObject({ value: 300, unit: "SF", source: "photo" });
    expect(qty!.confidence).toBeLessThanOrEqual(0.4);
  });

  it("returns null when the model offered no usable estimate", () => {
    expect(photoAreaQuantity(photoRegion("bed_1", undefined), NOW())).toBeNull();
    expect(photoAreaQuantity(photoRegion("bed_1", 0), NOW())).toBeNull();
  });
});

describe("reconcileRegion — arbitration, not averaging", () => {
  it("aerial wins horizontal area: the value is never blended toward the photo", () => {
    const result = reconcileRegion(photoRegion("bed_1", 300), aerialQty(310));
    expect(result.areaSf.value).toBe(310);
    expect(result.areaSf.source).toBe("user_drawn");
  });

  it("photo wins material identity and condition", () => {
    const result = reconcileRegion(
      photoRegion("bed_1", 300, {
        existingMaterial: "river rock",
        condition: "settled, fabric showing",
      }),
      aerialQty(310),
    );
    expect(result.existingMaterial).toBe("river rock");
    expect(result.condition).toBe("settled, fabric showing");
  });

  it("agreement raises confidence in the aerial number", () => {
    const result = reconcileRegion(photoRegion("bed_1", 300), aerialQty(310, 0.85));
    expect(result.verdict).toBe("agreement");
    expect(result.areaSf.confidence).toBeGreaterThan(0.85);
  });

  it("disagreement lowers confidence but leaves the aerial value standing", () => {
    const result = reconcileRegion(photoRegion("bed_1", 300), aerialQty(900, 0.85));
    expect(result.verdict).toBe("disagreement");
    expect(result.areaSf.value).toBe(900);
    expect(result.areaSf.confidence).toBeLessThan(0.85);
  });

  it("a mid-zone delta (15–25%) holds: verdict inconclusive, confidence untouched", () => {
    const result = reconcileRegion(photoRegion("bed_1", 300), aerialQty(375, 0.85));
    expect(result.deltaPct).toBeCloseTo(20);
    expect(result.verdict).toBe("inconclusive");
    expect(result.areaSf.confidence).toBe(0.85);
  });
});

describe("reconcileDesign", () => {
  it("tightens the band when every compared region agrees", () => {
    const report = reconcileDesign(
      { regions: [photoRegion("bed_1", 300), photoRegion("lawn_1", 1100)] },
      { bed_1: aerialQty(310), lawn_1: aerialQty(1050) },
    );
    expect(report.outcome).toBe("tighten");
    expect(report.flagged).toBe(false);
    expect(report.bandWidthFactor).toBe(TIGHTEN_BAND_FACTOR);
    expect(report.comparedRegionIds).toEqual(["bed_1", "lawn_1"]);
  });

  it("holds when the photo offers no estimates to compare", () => {
    const report = reconcileDesign(
      { regions: [photoRegion("bed_1", undefined)] },
      { bed_1: aerialQty(310) },
    );
    expect(report.outcome).toBe("hold");
    expect(report.bandWidthFactor).toBe(1);
    expect(report.comparedRegionIds).toEqual([]);
  });

  it("carries the photo's vertical elements and blind spots through — photo wins vertical", () => {
    const report = reconcileDesign(
      {
        regions: [photoRegion("bed_1", 300)],
        verticalElements: [
          { kind: "retaining_wall", description: "timber wall along drive", confidence: 0.8 },
        ],
        cannotSee: ["back yard"],
      },
      { bed_1: aerialQty(310) },
    );
    expect(report.verticalElements).toHaveLength(1);
    expect(report.verticalElements[0].kind).toBe("retaining_wall");
    expect(report.cannotSee).toEqual(["back yard"]);
  });

  it("ignores photo regions never measured on the aerial", () => {
    const report = reconcileDesign(
      { regions: [photoRegion("bed_1", 300), photoRegion("side_yard", 500)] },
      { bed_1: aerialQty(310) },
    );
    expect(report.regions.map((r) => r.photoRegionId)).toEqual(["bed_1"]);
  });

  // The Phase 4 acceptance test: pair the photo with the WRONG property's
  // address and the disagreement flag must fire. Both aerial legs go
  // through the real measurement engine (rectangleRing → measureRing).
  it("flags for review when the photo is paired with a different property's address", () => {
    // The photo: a modest front bed the model pegs at ~300 SF.
    const photo = {
      regions: [photoRegion("front_bed", 300)],
      cannotSee: ["back yard"],
    };

    // The RIGHT property (Madison, WI): the customer traces their bed on
    // the aerial and it comes out near what the photo shows.
    const home = { lat: 43.0731, lng: -89.4012 };
    const homeBed = measureRing(rectangleRing(home, 320), "user_drawn", 0.85, NOW);
    const rightProperty = reconcileDesign(photo, { front_bed: homeBed.areaSf });
    expect(rightProperty.flagged).toBe(false);
    expect(rightProperty.outcome).toBe("tighten");

    // The WRONG property (a large HOA frontage across town): the drawn bed
    // measures ~1900 SF — the photo cannot be of this yard.
    const wrongAddress = { lat: 43.1121, lng: -89.3358 };
    const wrongBed = measureRing(rectangleRing(wrongAddress, 1900), "user_drawn", 0.85, NOW);
    const wrongProperty = reconcileDesign(photo, { front_bed: wrongBed.areaSf });

    expect(wrongProperty.flagged).toBe(true);
    expect(wrongProperty.flaggedRegionIds).toEqual(["front_bed"]);
    expect(wrongProperty.outcome).toBe("review");
    expect(wrongProperty.bandWidthFactor).toBe(WIDEN_BAND_FACTOR);
    const region = wrongProperty.regions[0];
    expect(region.verdict).toBe("disagreement");
    expect(region.deltaPct).toBeGreaterThan(DISAGREEMENT_MIN_DELTA_PCT);
    // Arbitration holds even under disagreement: the aerial value stands.
    expect(region.areaSf.value).toBe(wrongBed.areaSf.value);
  });

  it("one disagreeing region flags the whole design even when others agree", () => {
    const report = reconcileDesign(
      { regions: [photoRegion("bed_1", 300), photoRegion("lawn_1", 1100)] },
      { bed_1: aerialQty(310), lawn_1: aerialQty(3000) },
    );
    expect(report.flagged).toBe(true);
    expect(report.flaggedRegionIds).toEqual(["lawn_1"]);
    expect(report.outcome).toBe("review");
  });
});
