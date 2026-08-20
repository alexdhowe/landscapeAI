import { describe, expect, it } from "vitest";

import { wiTypologyConfig } from "../../../seed/pricebook.seed";
import { getTypologyBand } from "../../pricing/typology";
import { bandForSelections, chosenOptionIds, inferJobType } from "../band";
import type { RegionSelection } from "../types";

const sel = (
  surfaceOptionId?: string,
  addonOptionIds: string[] = [],
): RegionSelection => ({ surfaceOptionId, addonOptionIds });

describe("inferJobType", () => {
  it("returns null with no selections — no band before the first swap", () => {
    expect(inferJobType({})).toBeNull();
    expect(inferJobType({ r1: sel() })).toBeNull();
  });

  it("a stone swap implies mulch_to_stone", () => {
    expect(inferJobType({ r1: sel("surface_stone_river_rock") })).toBe("mulch_to_stone");
  });

  it("a mulch swap implies bed_renovation", () => {
    expect(inferJobType({ r1: sel("surface_mulch_hardwood") })).toBe("bed_renovation");
  });

  it("stone conversion outranks generic bed work when both are present", () => {
    expect(
      inferJobType({
        r1: sel("surface_stone_granite_chips", ["addon_steel_edging"]),
        r2: sel("surface_mulch_cedar"),
      }),
    ).toBe("mulch_to_stone");
  });

  it("foundation refresh outranks bed renovation", () => {
    expect(
      inferJobType({
        r1: sel("surface_mulch_hardwood", ["addon_foundation_refresh"]),
      }),
    ).toBe("foundation_planting_refresh");
  });

  it("ignores unknown option ids", () => {
    expect(inferJobType({ r1: sel("bogus_option") })).toBeNull();
  });
});

describe("chosenOptionIds", () => {
  it("collects surface and addon ids across regions", () => {
    expect(
      chosenOptionIds({
        r1: sel("surface_mulch_hardwood", ["addon_steel_edging"]),
        r2: sel(undefined, ["addon_boulder_accent"]),
      }),
    ).toEqual(["surface_mulch_hardwood", "addon_steel_edging", "addon_boulder_accent"]);
  });
});

describe("bandForSelections", () => {
  it("returns null when nothing is selected", () => {
    expect(bandForSelections({}, "residential", wiTypologyConfig)).toBeNull();
  });

  it("the mulch-to-stone band matches the Phase 1.5 typology band exactly", () => {
    const result = bandForSelections(
      { r1: sel("surface_stone_river_rock") },
      "residential",
      wiTypologyConfig,
    );
    const expected = getTypologyBand("mulch_to_stone", "residential", wiTypologyConfig);
    expect(result).not.toBeNull();
    expect(result!.band.low).toBe(expected.low);
    expect(result!.band.high).toBe(expected.high);
    expect(result!.band.typical).toBe(expected.typical);
    expect(result!.jobType).toBe("mulch_to_stone");
    expect(result!.band.basis).toBe("typology");
  });

  it("respects the market context", () => {
    const residential = bandForSelections(
      { r1: sel("surface_stone_river_rock") },
      "residential",
      wiTypologyConfig,
    )!;
    const hoa = bandForSelections(
      { r1: sel("surface_stone_river_rock") },
      "hoa_commercial",
      wiTypologyConfig,
    )!;
    expect(hoa.band.low).toBeGreaterThan(residential.band.low);
    expect(hoa.band.high).toBeGreaterThan(residential.band.high);
  });

  it("scope lists the chosen options, deduplicated", () => {
    const result = bandForSelections(
      {
        r1: sel("surface_stone_river_rock", ["addon_steel_edging"]),
        r2: sel("surface_stone_river_rock"),
      },
      "residential",
      wiTypologyConfig,
    )!;
    expect(result.scope).toEqual(["Washed river rock", "Steel edging"]);
  });

  it("exposes only display prices — no costs, rates, or margin in the result", () => {
    const result = bandForSelections(
      { r1: sel("surface_stone_river_rock") },
      "residential",
      wiTypologyConfig,
    )!;
    const flat = JSON.stringify(result).toLowerCase();
    for (const leak of ["unitcost", "margin", "burden", "directcost", "lineitems"]) {
      expect(flat).not.toContain(leak);
    }
  });
});
