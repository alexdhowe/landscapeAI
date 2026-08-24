/**
 * The catalog is the guardrail: nothing may be offered that the pricing
 * engine cannot price. For plants that guarantee is structural rather than
 * asserted — the list is derived from the price book, so a plant with no
 * install assembly cannot appear in it at all.
 */
import { describe, expect, it } from "vitest";

import { plantMetaBySku, wiPriceBook } from "../../../seed/pricebook.seed";
import {
  plantJobTypeForRegion,
  plantOptionId,
  plantOptionsFor,
  plantOptionsForRegion,
} from "../plants";

const OPTIONS = plantOptionsFor(wiPriceBook, plantMetaBySku);

describe("plantOptionsFor", () => {
  it("offers the seed's plants", () => {
    expect(OPTIONS.length).toBeGreaterThan(10);
    expect(OPTIONS.map((o) => o.skuId)).toContain("plant_boxwood_green_velvet");
  });

  it("every option's assembly exists in the price book", () => {
    const assemblies = new Set(wiPriceBook.assemblies.map((a) => a.id));
    for (const option of OPTIONS) {
      expect(assemblies, `option ${option.id}`).toContain(option.assemblyId);
    }
  });

  it("every option's SKU exists as a cost item", () => {
    const costItems = new Set(wiPriceBook.costItems.map((c) => c.id));
    for (const option of OPTIONS) {
      expect(costItems, `option ${option.id}`).toContain(option.skuId);
    }
  });

  it("drops a plant whose install assembly is missing", () => {
    // The structural guarantee: remove the assembly and the offer goes
    // with it, without anyone remembering to edit a list.
    const book = {
      ...wiPriceBook,
      assemblies: wiPriceBook.assemblies.filter(
        (a) => a.id !== "install_plant_boxwood_green_velvet",
      ),
    };
    const skus = plantOptionsFor(book, plantMetaBySku).map((o) => o.skuId);
    expect(skus).not.toContain("plant_boxwood_green_velvet");
    expect(skus).toContain("plant_juniper_sea_green");
  });

  it("ignores cost items that are not plants", () => {
    const skus = new Set(OPTIONS.map((o) => o.skuId));
    expect(skus.has("mulch_hardwood")).toBe(false);
    expect(skus.has("labor_crew")).toBe(false);
  });

  it("carries no cost — this list is served to a browser", () => {
    // Section 1: internal rates never reach a customer surface.
    for (const option of OPTIONS) {
      const keys = Object.keys(option).join(" ").toLowerCase();
      expect(keys).not.toMatch(/cost|price|rate|margin|burden/);
    }
    expect(JSON.stringify(OPTIONS)).not.toMatch(/unitCost/);
  });

  it("gives every option a glyph, so the swap can be drawn from the graph", () => {
    for (const option of OPTIONS) {
      expect(["shrub", "evergreen", "grass", "perennial", "tree"]).toContain(option.glyph);
    }
  });

  it("derives the option id from the SKU, one way", () => {
    expect(plantOptionId("plant_hosta_patriot")).toBe("plantsku_plant_hosta_patriot");
    const option = OPTIONS.find((o) => o.skuId === "plant_hosta_patriot")!;
    expect(option.id).toBe(plantOptionId("plant_hosta_patriot"));
  });
});

describe("plantOptionsForRegion", () => {
  it("keeps trees out of a foundation planting", () => {
    // A 40-foot maple two feet from the siding is a callback, not a design.
    const offered = plantOptionsForRegion(OPTIONS, "foundation_planting");
    expect(offered.some((o) => o.category === "tree")).toBe(false);
    expect(offered.some((o) => o.category === "evergreen_shrub")).toBe(true);
  });

  it("offers everything in a bed", () => {
    expect(plantOptionsForRegion(OPTIONS, "bed")).toHaveLength(OPTIONS.length);
  });

  it("offers nothing on turf or hardscape", () => {
    expect(plantOptionsForRegion(OPTIONS, "turf")).toEqual([]);
    expect(plantOptionsForRegion(OPTIONS, "hardscape")).toEqual([]);
  });
});

describe("plantJobTypeForRegion", () => {
  it("prices replanting from the job type the region implies", () => {
    expect(plantJobTypeForRegion("foundation_planting")).toBe("foundation_planting_refresh");
    expect(plantJobTypeForRegion("bed")).toBe("bed_renovation");
    expect(plantJobTypeForRegion("turf")).toBeNull();
    expect(plantJobTypeForRegion("hardscape")).toBeNull();
  });
});
