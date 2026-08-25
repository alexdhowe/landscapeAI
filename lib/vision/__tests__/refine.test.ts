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
import {
  mergeRefinement,
  parseRefinement,
  refinementPrompt,
  summarizeRefinement,
} from "../refine";
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
    const [merged] = mergeRefinement([region()], { plantings: new Map(), polygons: new Map([["bed", tighter]]) });
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
      const [merged] = mergeRefinement([region()], { plantings: new Map(), polygons: new Map([["bed", polygon]]) });
      expect(merged.polygon).toEqual(SQUARE);
    }
  });

  it("cannot invent a region or drop one", () => {
    const merged = mergeRefinement([region({ id: "a" }), region({ id: "b" })], {
      plantings: new Map(),
      polygons: new Map([
        ["a", [[0.25, 0.62], [0.75, 0.62], [0.75, 0.88], [0.25, 0.88]] as NormalizedPoint[]],
        ["ghost", SQUARE],
      ]),
    });
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("leaves everything alone when nothing came back", () => {
    const regions = [region({ id: "a" }), region({ id: "b" })];
    expect(mergeRefinement(regions, { polygons: new Map(), plantings: new Map() })).toEqual(regions);
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
      plantings: new Map(),
      groundLine: [
        [0, 0.55],
        [1, 0.55],
      ],
    });
    for (const [, y] of merged.polygon) expect(y).toBeGreaterThanOrEqual(0.55);
  });
});

describe("mergeRefinement, on the plants", () => {
  // These are the shapes that most need the second look. A shrub is small,
  // so a few percent out is the difference between the plant staying put
  // when the mulch is swapped and gravel being painted across its leaves.
  const plants = () =>
    region({
      plantings: [
        { id: "bed_plant_1", cx: 0.4, cy: 0.7, rx: 0.05, ry: 0.05, label: "azalea" },
        { id: "bed_plant_2", cx: 0.6, cy: 0.72, rx: 0.04, ry: 0.04 },
      ],
    });

  it("nudges a ring onto its plant and resizes it", () => {
    const [merged] = mergeRefinement([plants()], {
      polygons: new Map(),
      plantings: new Map([["bed_plant_1", { cx: 0.44, cy: 0.73, rx: 0.075, ry: 0.07 }]]),
    });
    expect(merged.plantings![0]).toEqual({
      id: "bed_plant_1",
      cx: 0.44,
      cy: 0.73,
      rx: 0.075,
      ry: 0.07,
      // Identity and label survive: the customer's choice about this plant
      // is keyed by the id, and a correction is not a new plant.
      label: "azalea",
    });
    expect(merged.plantings![1].cx).toBe(0.6);
  });

  it("refuses a move across the bed", () => {
    // Most likely the model matching ids to the wrong plants. The pass
    // that found them is the better authority on which is which.
    const [merged] = mergeRefinement([plants()], {
      polygons: new Map(),
      plantings: new Map([["bed_plant_1", { cx: 0.85, cy: 0.75, rx: 0.05, ry: 0.05 }]]),
    });
    expect(merged.plantings![0].cx).toBe(0.4);
  });

  it("refuses a tenfold change in size", () => {
    const [merged] = mergeRefinement([plants()], {
      polygons: new Map(),
      plantings: new Map([
        ["bed_plant_1", { cx: 0.4, cy: 0.7, rx: 0.5, ry: 0.5 }],
        ["bed_plant_2", { cx: 0.6, cy: 0.72, rx: 0.002, ry: 0.002 }],
      ]),
    });
    expect(merged.plantings![0].rx).toBe(0.05);
    expect(merged.plantings![1].rx).toBe(0.04);
  });

  it("cannot invent a plant or drop one", () => {
    const [merged] = mergeRefinement([plants()], {
      polygons: new Map(),
      plantings: new Map([["bed_plant_99", { cx: 0.5, cy: 0.5, rx: 0.05, ry: 0.05 }]]),
    });
    expect(merged.plantings!.map((p) => p.id)).toEqual(["bed_plant_1", "bed_plant_2"]);
  });

  it("corrects the plants even when the region's own outline is refused", () => {
    // The two are judged separately: a bad polygon correction must not
    // cost the good plant ones.
    const huge: NormalizedPoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const [merged] = mergeRefinement([plants()], {
      polygons: new Map([["bed", huge]]),
      plantings: new Map([["bed_plant_1", { cx: 0.43, cy: 0.72, rx: 0.06, ry: 0.06 }]]),
    });
    expect(merged.polygon).toEqual(SQUARE);
    expect(merged.plantings![0].cx).toBe(0.43);
  });
});

describe("parseRefinement, on the plants", () => {
  it("reads corrected ellipses keyed by plant id", () => {
    const { plantings } = parse(
      JSON.stringify({
        regions: [
          {
            id: "bed",
            polygon: [[0.1, 0.5], [0.9, 0.5], [0.9, 0.95]],
            plantings: [{ id: "bed_plant_1", cx: 0.42, cy: 0.71, rx: 0.06, ry: 0.055 }],
          },
        ],
      }),
    );
    expect(plantings.get("bed_plant_1")).toEqual({
      cx: 0.42,
      cy: 0.71,
      rx: 0.06,
      ry: 0.055,
    });
  });

  it("skips an ellipse with no id or no numbers", () => {
    const { plantings } = parse(
      JSON.stringify({
        regions: [
          {
            id: "bed",
            polygon: [[0.1, 0.5], [0.9, 0.5], [0.9, 0.95]],
            plantings: [
              { cx: 0.4, cy: 0.7, rx: 0.05, ry: 0.05 },
              { id: "bed_plant_2", cx: "middle", cy: 0.7, rx: 0.05, ry: 0.05 },
              { id: "bed_plant_3", cx: 0.4, cy: 0.7, rx: 0, ry: 0.05 },
            ],
          },
        ],
      }),
    );
    expect(plantings.size).toBe(0);
  });
});

describe("summarizeRefinement", () => {
  // What the second call bought, counted from the same predicates the
  // merge decides with — so the log line and the merged regions cannot
  // disagree about what was kept. Elapsed time alone cannot say whether
  // this pass is worth its latency; this is the other half of that.
  const TIGHTER: NormalizedPoint[] = [
    [0.22, 0.62],
    [0.78, 0.61],
    [0.79, 0.88],
    [0.21, 0.89],
  ];
  /** Half the area of SQUARE's neighbourhood — outside the merge bounds. */
  const SHRUNK: NormalizedPoint[] = [
    [0.2, 0.6],
    [0.4, 0.6],
    [0.4, 0.7],
    [0.2, 0.7],
  ];

  it("counts an outline the merge keeps", () => {
    expect(
      summarizeRefinement([region()], {
        polygons: new Map([["bed", TIGHTER]]),
        plantings: new Map(),
      }),
    ).toEqual({
      outlinesOffered: 1,
      outlinesAccepted: 1,
      plantsOffered: 0,
      plantsAccepted: 0,
    });
  });

  it("counts an outline the merge refuses as offered but not kept", () => {
    const tally = summarizeRefinement([region()], {
      polygons: new Map([["bed", SHRUNK]]),
      plantings: new Map(),
    });
    expect(tally.outlinesOffered).toBe(1);
    expect(tally.outlinesAccepted).toBe(0);
    // And the merge agrees, which is the property that matters.
    const [merged] = mergeRefinement([region()], {
      polygons: new Map([["bed", SHRUNK]]),
      plantings: new Map(),
    });
    expect(merged.polygon).toEqual(SQUARE);
  });

  it("counts plants the same way", () => {
    const tally = summarizeRefinement([region()], {
      polygons: new Map(),
      plantings: new Map([
        // A nudge, taken.
        ["bed_plant_1", { cx: 0.52, cy: 0.76, rx: 0.06, ry: 0.06 }],
      ]),
    });
    expect(tally).toEqual({
      outlinesOffered: 0,
      outlinesAccepted: 0,
      plantsOffered: 1,
      plantsAccepted: 1,
    });
  });

  it("counts a plant flung across the bed as offered but not kept", () => {
    const tally = summarizeRefinement([region()], {
      polygons: new Map(),
      plantings: new Map([["bed_plant_1", { cx: 0.9, cy: 0.75, rx: 0.05, ry: 0.05 }]]),
    });
    expect(tally.plantsOffered).toBe(1);
    expect(tally.plantsAccepted).toBe(0);
  });

  it("does not count a correction for something the first pass never found", () => {
    // An id nobody recognises is not offered to anything, and counting it
    // would make a refinement that corrected nothing look productive.
    const tally = summarizeRefinement([region()], {
      polygons: new Map([["patio", TIGHTER]]),
      plantings: new Map([["ghost_plant", { cx: 0.5, cy: 0.75, rx: 0.05, ry: 0.05 }]]),
    });
    expect(tally).toEqual({
      outlinesOffered: 0,
      outlinesAccepted: 0,
      plantsOffered: 0,
      plantsAccepted: 0,
    });
  });

  it("adds up across regions", () => {
    const regions = [
      region({ id: "bed", plantings: [{ id: "p1", cx: 0.5, cy: 0.75, rx: 0.05, ry: 0.05 }] }),
      region({ id: "lawn", plantings: [{ id: "p2", cx: 0.3, cy: 0.8, rx: 0.04, ry: 0.04 }] }),
    ];
    const tally = summarizeRefinement(regions, {
      polygons: new Map([
        ["bed", TIGHTER],
        ["lawn", SHRUNK],
      ]),
      plantings: new Map([
        ["p1", { cx: 0.51, cy: 0.75, rx: 0.05, ry: 0.05 }],
        ["p2", { cx: 0.3, cy: 0.8, rx: 0.004, ry: 0.04 }],
      ]),
    });
    expect(tally).toEqual({
      outlinesOffered: 2,
      outlinesAccepted: 1,
      plantsOffered: 2,
      plantsAccepted: 1,
    });
  });
});
