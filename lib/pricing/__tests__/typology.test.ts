/**
 * Phase 1.5 golden tests — typology bands.
 *
 * The WI seed config is a state-average placeholder (see seed/pricebook.seed.ts),
 * so the WI assertions check structure and self-consistency against the
 * engine rather than pinned dollar values. The synthetic scenario pins exact
 * hand-calculated numbers.
 */
import { describe, expect, it } from "vitest";
import { buildEstimate } from "../engine";
import { getTypologyBand, type TypologyConfig } from "../typology";
import { ceilTo, floorTo } from "../rounding";
import {
  wiTypologyConfig,
} from "../../../seed/pricebook.seed";
import { marginConfig, priceBook } from "./fixtures";

describe("getTypologyBand — hand-calculated synthetic case", () => {
  // One-line recipe on the fixture price book: mulch_refresh.
  // Per SF: mulch 0.0062 CY × 1.10 waste × $38 = $0.25916
  //         labor (1 ÷ 80) HR × $58 × 1.35 burden = $0.97875
  //         direct = $1.23791/SF
  // P25 100 SF: 123.79 × 1.05 contingency = 129.98 ÷ 0.55 = $236.33 → floor 50 = 200
  // P50 200 SF: 247.58 × 1.05 = 259.96 ÷ 0.55 = $472.66 → round 50 = 450
  // P75 300 SF: 371.37 × 1.05 = 389.94 ÷ 0.55 = $708.98 → ceil 50 = 750
  const syntheticConfig = {
    priceBook,
    margin: marginConfig,
    roundTo: 50,
    recipes: {
      mulch_to_stone: [{ assemblyId: "mulch_refresh", distributionKey: "bed_area_sf" }],
      bed_renovation: [],
      foundation_planting_refresh: [],
    },
    distributions: {
      mulch_to_stone: {
        residential: { bed_area_sf: { unit: "SF", p25: 100, p50: 200, p75: 300 } },
        hoa_commercial: { bed_area_sf: { unit: "SF", p25: 400, p50: 800, p75: 1200 } },
      },
      bed_renovation: { residential: {}, hoa_commercial: {} },
      foundation_planting_refresh: { residential: {}, hoa_commercial: {} },
    },
  } satisfies TypologyConfig;

  it("matches the hand-calculated band endpoints", () => {
    const band = getTypologyBand("mulch_to_stone", "residential", syntheticConfig);
    expect(band.low).toBe(200);
    expect(band.typical).toBe(450);
    expect(band.high).toBe(750);
    expect(band.basis).toBe("typology");
    expect(band.currency).toBe("USD");
  });

  it("throws when a recipe references a missing distribution", () => {
    expect(() =>
      getTypologyBand("bed_renovation", "residential", {
        ...syntheticConfig,
        recipes: {
          ...syntheticConfig.recipes,
          bed_renovation: [{ assemblyId: "mulch_refresh", distributionKey: "nope" }],
        },
      }),
    ).toThrow(/needs distribution/);
  });
});

describe("getTypologyBand — WI seed config (acceptance)", () => {
  it("returns a defensible band for mulch_to_stone residential", () => {
    const band = getTypologyBand("mulch_to_stone", "residential", wiTypologyConfig);
    expect(band.low).toBeGreaterThan(0);
    expect(band.low).toBeLessThan(band.typical);
    expect(band.typical).toBeLessThan(band.high);
    expect(band.low % wiTypologyConfig.roundTo).toBe(0);
    expect(band.high % wiTypologyConfig.roundTo).toBe(0);
  });

  it("band endpoints are exactly the engine's P25/P75 sell prices, rounded outward", () => {
    const band = getTypologyBand("mulch_to_stone", "residential", wiTypologyConfig);
    const dists = wiTypologyConfig.distributions.mulch_to_stone.residential;
    const sellAt = (p: "p25" | "p75") =>
      buildEstimate(
        wiTypologyConfig.recipes.mulch_to_stone.map((line) => ({
          assemblyId: line.assemblyId,
          quantity: {
            value: dists[line.distributionKey][p],
            unit: dists[line.distributionKey].unit,
            source: "typology" as const,
            confidence: 0.3,
            capturedAt: "2026-08-20T12:00:00.000Z",
          },
        })),
        wiTypologyConfig.priceBook,
        wiTypologyConfig.margin,
      ).sellPrice;
    expect(band.low).toBe(floorTo(sellAt("p25"), wiTypologyConfig.roundTo));
    expect(band.high).toBe(ceilTo(sellAt("p75"), wiTypologyConfig.roundTo));
  });

  it("HOA/commercial bands sit above residential for every job type", () => {
    for (const jobType of [
      "mulch_to_stone",
      "bed_renovation",
      "foundation_planting_refresh",
    ] as const) {
      const res = getTypologyBand(jobType, "residential", wiTypologyConfig);
      const hoa = getTypologyBand(jobType, "hoa_commercial", wiTypologyConfig);
      expect(hoa.low).toBeGreaterThan(res.low);
      expect(hoa.high).toBeGreaterThan(res.high);
    }
  });

  it("every job type and context produces a valid ordered band", () => {
    for (const jobType of [
      "mulch_to_stone",
      "bed_renovation",
      "foundation_planting_refresh",
    ] as const) {
      for (const context of ["residential", "hoa_commercial"] as const) {
        const band = getTypologyBand(jobType, context, wiTypologyConfig);
        expect(band.low).toBeGreaterThan(0);
        expect(band.low).toBeLessThanOrEqual(band.typical);
        expect(band.typical).toBeLessThanOrEqual(band.high);
      }
    }
  });
});

describe("WI seed price book integrity", () => {
  it("every assembly component references an existing cost item", () => {
    const ids = new Set(wiTypologyConfig.priceBook.costItems.map((c) => c.id));
    for (const assembly of wiTypologyConfig.priceBook.assemblies) {
      for (const component of assembly.components) {
        expect(ids.has(component.costItemId), `${assembly.id} → ${component.costItemId}`).toBe(true);
      }
    }
  });

  it("every recipe line references an existing assembly and distribution in both contexts", () => {
    const assemblyIds = new Set(wiTypologyConfig.priceBook.assemblies.map((a) => a.id));
    for (const [jobType, lines] of Object.entries(wiTypologyConfig.recipes)) {
      for (const line of lines) {
        expect(assemblyIds.has(line.assemblyId), line.assemblyId).toBe(true);
        for (const context of ["residential", "hoa_commercial"] as const) {
          const dist =
            wiTypologyConfig.distributions[jobType as keyof typeof wiTypologyConfig.distributions][
              context
            ][line.distributionKey];
          expect(dist, `${jobType}/${context}/${line.distributionKey}`).toBeDefined();
          expect(dist.p25).toBeLessThanOrEqual(dist.p50);
          expect(dist.p50).toBeLessThanOrEqual(dist.p75);
        }
      }
    }
  });
});
