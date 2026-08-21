import { describe, expect, it } from "vitest";

import { wiBandPolicy, wiTypologyConfig } from "../../../seed/pricebook.seed";
import { demoSegmentation } from "../../vision/demo";
import { quoteProject } from "../quote";
import type { AerialRegion, DesignProject } from "../types";

const NOW = "2026-08-21T12:00:00.000Z";
const now = () => NOW;

function baseProject(overrides: Partial<DesignProject> = {}): DesignProject {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    createdAt: NOW,
    status: "playing",
    photo: { fileName: "photo.jpg", mediaType: "image/jpeg" },
    segmentation: { status: "ready", ...demoSegmentation() },
    selections: {
      demo_bed: { surfaceOptionId: "surface_stone_river_rock", addonOptionIds: [] },
    },
    marketContext: "residential",
    ...overrides,
  };
}

function aerialBed(areaSf: number): AerialRegion {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    photoRegionId: "demo_bed",
    ring: [
      [-89.4, 43.07],
      [-89.3999, 43.07],
      [-89.3999, 43.0701],
      [-89.4, 43.0701],
    ],
    areaSf: {
      value: areaSf,
      unit: "SF",
      source: "user_drawn",
      confidence: 0.85,
      capturedAt: NOW,
    },
    perimeterLf: {
      value: 80,
      unit: "LF",
      source: "user_drawn",
      confidence: 0.85,
      capturedAt: NOW,
    },
  };
}

/** Recursively collect every key name in a JSON-ish value. */
function allKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, into);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      allKeys(v, into);
    }
  }
  return into;
}

const INTERNAL_KEYS = [
  "unitCost",
  "extendedCost",
  "directCost",
  "totalCost",
  "contingency",
  "costItemId",
  "costByKind",
  "appliedGmPct",
  "grossMargin",
  "sellPrice",
  "lineItems",
];

describe("quoteProject", () => {
  it("returns null before anything is selected", () => {
    expect(
      quoteProject(baseProject({ selections: {} }), wiTypologyConfig, wiBandPolicy, now),
    ).toBeNull();
  });

  it("prices on the typology basis before any measurement, with an internal estimate", () => {
    const quote = quoteProject(baseProject(), wiTypologyConfig, wiBandPolicy, now);
    expect(quote).not.toBeNull();
    expect(quote!.basis).toBe("typology");
    expect(quote!.jobType).toBe("mulch_to_stone");
    expect(quote!.customerPayload.band.basis).toBe("typology");
    expect(quote!.customerPayload.band.low).toBeGreaterThan(0);
    expect(quote!.customerPayload.band.high).toBeGreaterThan(
      quote!.customerPayload.band.low,
    );
    // The internal side exists even though nothing was measured — the rep
    // needs line items with honest typology provenance.
    expect(quote!.estimate).not.toBeNull();
    expect(quote!.estimate!.lineItems.length).toBeGreaterThan(0);
    for (const li of quote!.estimate!.lineItems) {
      expect(li.quantity.source).toBe("typology");
    }
  });

  it("switches to the measured basis once a selected region is drawn", () => {
    const quote = quoteProject(
      baseProject({ aerialRegions: [aerialBed(300)] }),
      wiTypologyConfig,
      wiBandPolicy,
      now,
    );
    expect(quote!.basis).toBe("measured");
    const payload = quote!.customerPayload;
    if (!("measurement" in payload)) throw new Error("expected measured payload");
    expect(payload.typologyBand.low).toBeGreaterThan(0);
    expect(payload.measurement.measuredRegions).toBe(1);
    expect(payload.measurement.totalAreaSf).toBe(300);
    expect(quote!.estimate!.sellPrice).toBeGreaterThan(0);
  });

  it("tightens the disclosure band when the photo corroborates the aerial", () => {
    // demo_bed's photo estimate is 300 SF; a 300 SF aerial is full agreement.
    const quote = quoteProject(
      baseProject({ aerialRegions: [aerialBed(300)] }),
      wiTypologyConfig,
      wiBandPolicy,
      now,
    );
    expect(quote!.reconciliation?.outcome).toBe("tighten");
    expect(quote!.policyUsed.bandWidthPct).toBeCloseTo(wiBandPolicy.bandWidthPct * 0.6);
  });

  it("flags and widens when the photo disagrees with the aerial", () => {
    // 600 SF aerial vs the photo's 300 SF guess: 50% off → review.
    const quote = quoteProject(
      baseProject({ aerialRegions: [aerialBed(600)] }),
      wiTypologyConfig,
      wiBandPolicy,
      now,
    );
    expect(quote!.reconciliation?.flagged).toBe(true);
    expect(quote!.policyUsed.bandWidthPct).toBeCloseTo(wiBandPolicy.bandWidthPct * 1.5);
    const payload = quote!.customerPayload;
    if (!("measurement" in payload)) throw new Error("expected measured payload");
    expect(payload.reconciliation?.outcome).toBe("review");
    expect(payload.reconciliation?.flaggedRegions.map((r) => r.id)).toEqual(["demo_bed"]);
  });

  it("keeps every internal key out of the customer payload, both bases", () => {
    for (const project of [
      baseProject(),
      baseProject({ aerialRegions: [aerialBed(300)] }),
    ]) {
      const quote = quoteProject(project, wiTypologyConfig, wiBandPolicy, now);
      const keys = allKeys(quote!.customerPayload);
      for (const internal of INTERNAL_KEYS) {
        expect(keys.has(internal), `customer payload leaked "${internal}"`).toBe(false);
      }
    }
  });

  it("still quotes (typology basis) when the customer declined an address", () => {
    const quote = quoteProject(
      baseProject({ addressDeclined: true }),
      wiTypologyConfig,
      wiBandPolicy,
      now,
    );
    expect(quote!.basis).toBe("typology");
    expect(quote!.estimate).not.toBeNull();
  });
});
