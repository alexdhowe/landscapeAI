/**
 * What a cleared bed gets painted in.
 *
 * The customer takes the plants out and the holes where they stood cannot
 * be filled from a photograph of the plants — so the bed is drawn in the
 * material it already has, from the model's own description of it. What is
 * asserted here is that the common descriptions land on the right surface,
 * that the specific ones beat the general ones, and that a description
 * nobody can parse still produces something plausible rather than nothing.
 */
import { describe, expect, it } from "vitest";

import { existingSurfaceSwatch } from "../existingSurface";

const bed = (existingMaterial?: string) =>
  existingSurfaceSwatch({ kind: "bed" as const, existingMaterial });

describe("existingSurfaceSwatch", () => {
  it("reads the descriptions a real segmentation has produced", () => {
    // Every one of these is a phrase the model has actually returned.
    expect(bed("dyed black hardwood mulch, freshly installed")).toBe("mulch_dark");
    expect(bed("hardwood mulch")).toBe("mulch_brown");
    expect(bed("faded shredded bark")).toBe("mulch_brown");
    expect(bed("black lava rock / crushed volcanic stone")).toBe("stone_granite");
    expect(bed("1.5in washed river rock over fabric")).toBe("stone_gray");
    expect(bed("buff limestone screenings")).toBe("stone_buff");
    expect(bed("cedar mulch")).toBe("mulch_red");
  });

  it("prefers the specific reading to the general one", () => {
    // "chips" must not make granite out of wood chips, and a black mulch
    // is dyed before it is merely mulch.
    expect(bed("wood chips")).toBe("mulch_brown");
    expect(bed("granite chips")).toBe("stone_granite");
    expect(bed("black mulch")).toBe("mulch_dark");
  });

  it("falls back on the kind of region when the description says nothing", () => {
    // A bed is mulched far more often than it is anything else, and the
    // wrong brown is a much smaller error than gravel.
    expect(bed(undefined)).toBe("mulch_brown");
    expect(bed("")).toBe("mulch_brown");
    expect(bed("overgrown, weeds coming through")).toBe("mulch_brown");
    expect(existingSurfaceSwatch({ kind: "turf" })).toBe("planting_mixed");
    expect(existingSurfaceSwatch({ kind: "hardscape" })).toBe("stone_gray");
    expect(existingSurfaceSwatch({ kind: "foundation_planting" })).toBe("mulch_brown");
  });

  it("answers for every description, so a cleared bed is never left unpainted", () => {
    for (const description of ["", "???", "unclear", "shrubs", "concrete pavers"]) {
      expect(bed(description)).toBeTruthy();
    }
  });
});
