import { describe, expect, it } from "vitest";

import { wiPriceBook } from "../../../seed/pricebook.seed";
import { CATALOG_OPTIONS, getOption, optionsForKind } from "../options";

describe("catalog options", () => {
  it("every option's assemblies exist in the price book (the catalog is the guardrail)", () => {
    const assemblyIds = new Set(wiPriceBook.assemblies.map((a) => a.id));
    for (const option of CATALOG_OPTIONS) {
      expect(option.assemblyIds.length).toBeGreaterThan(0);
      for (const id of option.assemblyIds) {
        expect(assemblyIds, `option ${option.id} references assembly ${id}`).toContain(id);
      }
    }
  });

  it("every option's SKUs exist as cost items — nothing can be offered that can't be priced", () => {
    const costItemIds = new Set(wiPriceBook.costItems.map((c) => c.id));
    for (const option of CATALOG_OPTIONS) {
      for (const id of option.skuIds) {
        expect(costItemIds, `option ${option.id} references SKU ${id}`).toContain(id);
      }
    }
  });

  it("option ids are unique", () => {
    const ids = CATALOG_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("beds get both mulch and stone surface options", () => {
    const surfaces = optionsForKind("bed").filter((o) => o.slot === "surface");
    expect(surfaces.some((o) => o.jobType === "bed_renovation")).toBe(true);
    expect(surfaces.some((o) => o.jobType === "mulch_to_stone")).toBe(true);
  });

  it("foundation plantings get the refresh preset", () => {
    const addons = optionsForKind("foundation_planting").filter((o) => o.slot === "addon");
    expect(addons.some((o) => o.jobType === "foundation_planting_refresh")).toBe(true);
  });

  it("turf and hardscape have no options in the MVP catalog", () => {
    expect(optionsForKind("turf")).toEqual([]);
    expect(optionsForKind("hardscape")).toEqual([]);
  });

  it("getOption round-trips and misses cleanly", () => {
    expect(getOption("surface_stone_river_rock")?.jobType).toBe("mulch_to_stone");
    expect(getOption("nope")).toBeUndefined();
  });
});
