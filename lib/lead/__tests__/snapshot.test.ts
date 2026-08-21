import { describe, expect, it } from "vitest";

import { wiBandPolicy, wiTypologyConfig } from "../../../seed/pricebook.seed";
import { quoteProject } from "../../design/quote";
import type { DesignProject } from "../../design/types";
import { demoSegmentation } from "../../vision/demo";
import {
  INTERNAL_ONLY_MARKERS,
  QuoteNotFreezableError,
  assertNoInternalLeak,
  freezeSnapshot,
  latestSnapshot,
  type SnapshotCustomerView,
} from "../snapshot";

const NOW = "2026-08-21T12:00:00.000Z";
const now = () => NOW;

function project(): DesignProject {
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
  };
}

describe("freezeSnapshot", () => {
  it("freezes the quote's customer payload as exact bytes plus the internal side", () => {
    const p = project();
    const quote = quoteProject(p, wiTypologyConfig, wiBandPolicy, now)!;
    const snapshot = freezeSnapshot(p, quote, { id: "snap-1", now });

    expect(snapshot.issuedAt).toBe(NOW);
    expect(snapshot.basis).toBe("typology");
    expect(snapshot.jobType).toBe("mulch_to_stone");
    expect(snapshot.lineItems).toEqual(quote.estimate!.lineItems);
    expect(snapshot.internalTotal).toBe(quote.estimate!.sellPrice);
    expect(snapshot.disclosurePolicyUsed).toEqual(quote.policyUsed);

    // The frozen bytes parse back to exactly the customer payload the
    // price rail was serving at submit time.
    const view = JSON.parse(snapshot.customerFacingPayload) as SnapshotCustomerView;
    expect(view.kind).toBe("estimate_snapshot");
    expect(view.snapshotId).toBe("snap-1");
    expect(view.projectId).toBe(p.id);
    expect(view.estimate).toEqual(quote.customerPayload);
  });

  it("never lets an internal pricing marker into the customer bytes", () => {
    const p = project();
    const quote = quoteProject(p, wiTypologyConfig, wiBandPolicy, now)!;
    const snapshot = freezeSnapshot(p, quote, { now });
    for (const marker of INTERNAL_ONLY_MARKERS) {
      expect(
        snapshot.customerFacingPayload.includes(marker),
        `frozen customer bytes contain "${marker}"`,
      ).toBe(false);
    }
  });

  it("refuses to freeze a payload that would leak internals (tripwire)", () => {
    expect(() => assertNoInternalLeak('{"unitCost":42}')).toThrow(/unitCost/);
    const p = project();
    const quote = quoteProject(p, wiTypologyConfig, wiBandPolicy, now)!;
    const doctored = {
      ...quote,
      customerPayload: {
        ...quote.customerPayload,
        sellPrice: 999,
      } as never,
    };
    expect(() => freezeSnapshot(p, doctored, { now })).toThrow(/sellPrice/);
  });

  it("refuses to freeze a quote with no priceable estimate", () => {
    const p = project();
    const quote = quoteProject(p, wiTypologyConfig, wiBandPolicy, now)!;
    expect(() => freezeSnapshot(p, { ...quote, estimate: null })).toThrow(
      QuoteNotFreezableError,
    );
  });
});

describe("latestSnapshot", () => {
  it("returns null before any submit and the newest snapshot after", () => {
    const p = project();
    expect(latestSnapshot(p)).toBeNull();
    const quote = quoteProject(p, wiTypologyConfig, wiBandPolicy, now)!;
    const first = freezeSnapshot(p, quote, { id: "snap-1", now });
    const second = freezeSnapshot(p, quote, { id: "snap-2", now });
    expect(latestSnapshot({ ...p, snapshots: [first, second] })?.id).toBe("snap-2");
  });
});
