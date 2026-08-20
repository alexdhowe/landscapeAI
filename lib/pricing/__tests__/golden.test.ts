/**
 * Phase 1 golden tests. Every expected value is hand-calculated in the
 * comment above its assertion; assertions match to within $1 (most are
 * exact to the cent). When real bid data replaces the fixture price book,
 * recompute these by hand the same way.
 */
import { describe, expect, it } from "vitest";
import { buildEstimate } from "../engine";
import { applyDisclosure } from "../disclosure";
import { indexCostItems, rollupAssembly } from "../assemblies";
import {
  bandPolicy,
  figurePolicy,
  marginConfig,
  priceBook,
  qty,
  tiersPolicy,
} from "./fixtures";

const costItemsById = indexCostItems(priceBook.costItems);
const assembly = (id: string) => {
  const found = priceBook.assemblies.find((a) => a.id === id);
  if (!found) throw new Error(`fixture missing assembly ${id}`);
  return found;
};

const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

describe("assembly rollup", () => {
  // Scenario 1 — material with waste factor.
  // Fabric @ 400 SF: 400 × 1.05 waste = 420 SF × $0.25 = $105.00
  // Stone @ 400 SF: 400 × 0.0093 = 3.72 CY × 1.10 waste = 4.092 CY × $85 = $347.82
  it("applies waste factor to material quantity", () => {
    const line = rollupAssembly(assembly("stone_bed_conversion"), qty(400, "SF"), costItemsById);
    const fabric = line.components.find((c) => c.costItemId === "weed_fabric")!;
    expect(fabric.quantity).toBeCloseTo(420, 6);
    near(fabric.extendedCost, 105.0);
    const stone = line.components.find((c) => c.costItemId === "stone_38_minus")!;
    expect(stone.quantity).toBeCloseTo(4.092, 6);
    near(stone.extendedCost, 347.82);
  });

  // Scenario 2 — labor from production rate, with burden.
  // 400 SF ÷ 20 SF/HR = 20 HR × $58 = $1,160 × 1.35 burden = $1,566.00
  it("derives labor hours from production rate and applies burden", () => {
    const line = rollupAssembly(assembly("stone_bed_conversion"), qty(400, "SF"), costItemsById);
    const labor = line.components.find((c) => c.costItemId === "labor_crew")!;
    expect(labor.quantity).toBeCloseTo(20, 6);
    near(labor.extendedCost, 1566.0);
  });

  // Scenario 3 — full multi-component line.
  // stone 347.82 + fabric 105.00 + disposal (400 × 0.0062 = 2.48 CY × $60 =
  // 148.80) + labor 1,566.00 + skid steer (400 × 0.01 = 4 HR × $45 = 180.00)
  // = $2,347.62 direct
  it("rolls the full stone conversion to the hand-calculated direct cost", () => {
    const line = rollupAssembly(assembly("stone_bed_conversion"), qty(400, "SF"), costItemsById);
    near(line.directCost, 2347.62);
    near(line.costByKind.material, 452.82); // stone + fabric
    near(line.costByKind.labor, 1566.0);
    near(line.costByKind.equipment, 180.0);
    near(line.costByKind.disposal, 148.8);
  });

  // Scenario 4 — mulch refresh @ 250 SF.
  // mulch: 250 × 0.0062 = 1.55 CY × 1.10 = 1.705 CY × $38 = $64.79
  // labor: 250 ÷ 80 = 3.125 HR × $58 × 1.35 = $244.69
  // direct = $309.48
  it("prices a mulch refresh", () => {
    const line = rollupAssembly(assembly("mulch_refresh"), qty(250, "SF"), costItemsById);
    near(line.directCost, 309.48);
  });

  // Scenario 5 — boulder placement @ 3 EA.
  // boulders: 3 × $95 = $285.00
  // labor: 3 ÷ 2 = 1.5 HR × $58 × 1.35 = $117.45
  // skid steer: 3 × 0.5 = 1.5 HR × $45 = $67.50
  // direct = $469.95
  it("prices EA-unit point elements", () => {
    const line = rollupAssembly(assembly("boulder_place"), qty(3, "EA"), costItemsById);
    near(line.directCost, 469.95);
  });

  it("preserves quantity provenance on the line item unchanged", () => {
    const quantity = qty(400, "SF", "aerial");
    const line = rollupAssembly(assembly("stone_bed_conversion"), quantity, costItemsById);
    expect(line.quantity).toEqual(quantity);
    expect(line.quantity.source).toBe("aerial");
  });

  it("rejects a quantity whose unit does not match the assembly", () => {
    expect(() =>
      rollupAssembly(assembly("stone_bed_conversion"), qty(400, "LF"), costItemsById),
    ).toThrow(/does not match/);
  });
});

describe("estimate: contingency and margin", () => {
  // Scenario 6 — single line estimate.
  // direct 2,347.62 → contingency 5% = 117.38 → total cost 2,465.00
  // sell at 45% GM = 2,465.00 ÷ 0.55 = $4,481.82
  it("applies contingency then margin-on-price", () => {
    const est = buildEstimate(
      [{ assemblyId: "stone_bed_conversion", quantity: qty(400, "SF") }],
      priceBook,
      marginConfig,
    );
    near(est.directCost, 2347.62);
    near(est.contingency, 117.38);
    near(est.totalCost, 2465.0);
    expect(est.appliedGmPct).toBe(45);
    near(est.sellPrice, 4481.82);
  });

  // Scenario 7 — margin floor.
  // Requested 20% GM is below the 35% floor → clamped to 35%.
  // sell = 2,465.00 ÷ 0.65 = $3,792.31
  it("clamps an override margin to the configured floor", () => {
    const est = buildEstimate(
      [{ assemblyId: "stone_bed_conversion", quantity: qty(400, "SF") }],
      priceBook,
      marginConfig,
      { overrideGmPct: 20 },
    );
    expect(est.appliedGmPct).toBe(35);
    near(est.sellPrice, 3792.31);
  });

  // Scenario 8 — multi-line project.
  // stone conversion 400 SF = 2,347.62
  // shrub install 12 EA: shrubs 12 × $28 = 336.00; soil 12 × 0.05 = 0.6 CY
  //   × 1.10 = 0.66 CY × $45 = 29.70; labor 12 ÷ 3 = 4 HR × $58 × 1.35 =
  //   313.20 → 678.90
  // steel edging 60 LF: steel 60 × 1.05 = 63 LF × $4.50 = 283.50; labor
  //   60 ÷ 10 = 6 HR × $58 × 1.35 = 469.80 → 753.30
  // direct = 3,779.82 → contingency 188.99 → total 3,968.81
  // sell = 3,968.81 ÷ 0.55 = $7,216.02
  it("rolls a multi-line project to the hand-calculated sell price", () => {
    const est = buildEstimate(
      [
        { assemblyId: "stone_bed_conversion", quantity: qty(400, "SF") },
        { assemblyId: "shrub_install_3gal", quantity: qty(12, "EA") },
        { assemblyId: "steel_edging", quantity: qty(60, "LF") },
      ],
      priceBook,
      marginConfig,
    );
    near(est.directCost, 3779.82);
    near(est.sellPrice, 7216.02);
    expect(est.lineItems).toHaveLength(3);
  });

  it("rejects an unknown assembly id", () => {
    expect(() =>
      buildEstimate(
        [{ assemblyId: "nope", quantity: qty(1, "EA") }],
        priceBook,
        marginConfig,
      ),
    ).toThrow(/Unknown assembly/);
  });
});

describe("disclosure projection", () => {
  const multiLine = () =>
    buildEstimate(
      [
        { assemblyId: "stone_bed_conversion", quantity: qty(400, "SF") },
        { assemblyId: "shrub_install_3gal", quantity: qty(12, "EA") },
        { assemblyId: "steel_edging", quantity: qty(60, "LF") },
      ],
      priceBook,
      marginConfig,
    );

  // Scenario 9 — band mode.
  // sell 7,216.02, ±15% → raw 6,133.62 / 8,298.42
  // rounded outward to $50 → low 6,100, high 8,300
  it("produces an outward-rounded band containing the sell price", () => {
    const payload = applyDisclosure(multiLine(), bandPolicy);
    if (payload.mode !== "band") throw new Error("expected band");
    expect(payload.low).toBe(6100);
    expect(payload.high).toBe(8300);
    expect(payload.low).toBeLessThan(multiLine().sellPrice);
    expect(payload.high).toBeGreaterThan(multiLine().sellPrice);
  });

  // Scenario 10 — Good/Better/Best tiers.
  // Good 7,216.02 → 7,200; Better ×1.15 = 8,298.42 → 8,300;
  // Best ×1.35 = 9,741.63 → 9,750 (all rounded to $50)
  it("produces ascending Good/Better/Best tiers", () => {
    const payload = applyDisclosure(multiLine(), tiersPolicy);
    if (payload.mode !== "tiers") throw new Error("expected tiers");
    expect(payload.tiers.map((t) => t.label)).toEqual(["Good", "Better", "Best"]);
    expect(payload.tiers.map((t) => t.price)).toEqual([7200, 8300, 9750]);
  });

  // Scenario 11 — single figure mode. 7,216.02 rounded to $10 → 7,220.
  it("produces a rounded single figure", () => {
    const payload = applyDisclosure(multiLine(), figurePolicy);
    if (payload.mode !== "figure") throw new Error("expected figure");
    expect(payload.price).toBe(7220);
  });

  // Scenario 12 — the invariant that kills contractor objections: nothing
  // internal leaks into any customer payload.
  it("leaks no internal rates, costs, or totals into any customer payload", () => {
    const est = multiLine();
    for (const policy of [bandPolicy, tiersPolicy, figurePolicy]) {
      const payload = applyDisclosure(est, policy);
      const serialized = JSON.stringify(payload);
      for (const forbidden of [
        "unitCost",
        "burden",
        "margin",
        "cost",
        "rate",
        "lineItems",
        "internal",
        "2347.62", // line direct cost
        "3779.82", // project direct cost
        "3968.81", // total cost with contingency
        "7216.02", // unrounded sell price
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      // Payload shape is a strict whitelist — nothing rides along.
      const allowedKeys: Record<string, string[]> = {
        band: ["mode", "currency", "low", "high", "scope"],
        tiers: ["mode", "currency", "tiers", "scope"],
        figure: ["mode", "currency", "price", "scope"],
      };
      expect(Object.keys(payload).sort()).toEqual(allowedKeys[payload.mode].sort());
    }
  });

  it("refuses a policy that tries to show unit rates", () => {
    const bad = { ...bandPolicy, showUnitRates: true as unknown as false };
    expect(() => applyDisclosure(multiLine(), bad)).toThrow(/never reach/);
  });
});
