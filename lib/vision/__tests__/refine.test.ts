/**
 * The rules the second look plays by.
 *
 * A refinement may tighten an outline. It may not invent a region, drop
 * one, rename it, or disagree about what it is — the pass that saw the
 * unannotated photograph is the better judge of all of that, and a pass
 * looking at a picture with coloured lines drawn on it is not. When in
 * doubt the first answer stands, which is what makes a second call safe to
 * add to a path that already worked.
 */
import { describe, expect, it } from "vitest";

import { extractJson } from "../parse";
import { mergeRefinement, parseRefinement, refinementPrompt } from "../refine";
import type { NormalizedPoint, SegmentedRegion } from "../types";

const SQUARE: NormalizedPoint[] = [
  [0.2, 0.6],
  [0.8, 0.6],
  [0.8, 0.9],
  [0.2, 0.9],
];

function region(over: Partial<SegmentedRegion> = {}): SegmentedRegion {
  return {
    id: "bed",
    kind: "bed",
    label: "Bed along front walk",
    polygon: SQUARE,
    existingMaterial: "hardwood mulch",
    condition: "faded",
    estimatedAreaSf: 300,
    confidence: 0.85,
    plantings: [{ id: "bed_plant_1", cx: 0.5, cy: 0.75, rx: 0.05, ry: 0.05 }],
    ...over,
  };
}

const parse = (text: string) => parseRefinement(text, extractJson);

describe("refinementPrompt", () => {
  it("names every region by the colour it was drawn in", () => {
    const prompt = refinementPrompt([
      { id: "bed", color: "red" },
      { id: "lawn", color: "blue" },
    ]);
    expect(prompt).toContain('"bed" is outlined in red');
    expect(prompt).toContain('"lawn" is outlined in blue');
  });
});

describe("parseRefinement", () => {
  it("reads corrected polygons keyed by id", () => {
    const { polygons } = parse(
      JSON.stringify({
        regions: [{ id: "bed", polygon: [[0.1, 0.5], [0.9, 0.5], [0.9, 0.95], [0.1, 0.95]] }],
      }),
    );
    expect(polygons.get("bed")).toHaveLength(4);
  });

  it.each([
    ["prose instead of JSON", "I had a look and they seem fine."],
    ["an empty body", ""],
    ["a JSON array", "[1, 2, 3]"],
    ["regions with no usable polygon", JSON.stringify({ regions: [{ id: "bed", polygon: [[0.1, 0.5]] }] })],
  ])("returns nothing for %s rather than throwing", (_label, text) => {
    expect(parse(text).polygons.size).toBe(0);
  });
});

describe("mergeRefinement", () => {
  it("replaces the shape and nothing else", () => {
    const tighter: NormalizedPoint[] = [
      [0.22, 0.62],
      [0.78, 0.61],
      [0.79, 0.88],
      [0.21, 0.89],
    ];
    const [merged] = mergeRefinement([region()], { polygons: new Map([["bed", tighter]]) });
    expect(merged.polygon).toEqual(tighter);
    expect(merged.kind).toBe("bed");
    expect(merged.label).toBe("Bed along front walk");
    expect(merged.existingMaterial).toBe("hardwood mulch");
    expect(merged.estimatedAreaSf).toBe(300);
    expect(merged.confidence).toBe(0.85);
    expect(merged.plantings).toEqual([
      { id: "bed_plant_1", cx: 0.5, cy: 0.75, rx: 0.05, ry: 0.05 },
    ]);
  });

  it("keeps the first pass's shape when the correction changes the area wildly", () => {
    // Not a tightened edge — a disagreement about what the region is, and
    // the pass that saw the clean photo is better placed to judge that.
    const tiny: NormalizedPoint[] = [
      [0.4, 0.7],
      [0.45, 0.7],
      [0.45, 0.75],
      [0.4, 0.75],
    ];
    const huge: NormalizedPoint[] = [
      [0.0, 0.1],
      [1.0, 0.1],
      [1.0, 1.0],
      [0.0, 1.0],
    ];
    for (const polygon of [tiny, huge]) {
      const [merged] = mergeRefinement([region()], { polygons: new Map([["bed", polygon]]) });
      expect(merged.polygon).toEqual(SQUARE);
    }
  });

  it("cannot invent a region or drop one", () => {
    const merged = mergeRefinement([region({ id: "a" }), region({ id: "b" })], {
      polygons: new Map([
        ["a", [[0.25, 0.62], [0.75, 0.62], [0.75, 0.88], [0.25, 0.88]] as NormalizedPoint[]],
        ["ghost", SQUARE],
      ]),
    });
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("leaves everything alone when nothing came back", () => {
    const regions = [region({ id: "a" }), region({ id: "b" })];
    expect(mergeRefinement(regions, { polygons: new Map() })).toEqual(regions);
  });

  it("holds the corrected outlines to the ground line it reports", () => {
    const climbing: NormalizedPoint[] = [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.8, 0.9],
      [0.2, 0.9],
    ];
    const [merged] = mergeRefinement([region()], {
      polygons: new Map([["bed", climbing]]),
      groundLine: [
        [0, 0.55],
        [1, 0.55],
      ],
    });
    for (const [, y] of merged.polygon) expect(y).toBeGreaterThanOrEqual(0.55);
  });
});
