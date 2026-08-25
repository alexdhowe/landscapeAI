import { describe, expect, it } from "vitest";

import { extractJson, parseSegmentation, parseSegmentationRaw } from "../parse";

const validResponse = JSON.stringify({
  regions: [
    {
      id: "front_lawn",
      kind: "turf",
      label: "Front lawn",
      polygon: [
        [0.1, 0.6],
        [0.9, 0.6],
        [0.9, 0.95],
        [0.1, 0.95],
      ],
      existing_material: "turf grass",
      confidence: 0.9,
    },
    {
      id: "walk_bed",
      kind: "bed",
      label: "Bed along walk",
      polygon: [
        [0.1, 0.4],
        [0.4, 0.4],
        [0.4, 0.55],
        [0.1, 0.55],
      ],
      existing_material: "hardwood mulch",
      condition: "faded, weeds coming through",
      estimated_area_sf: 280.6,
      confidence: 0.8,
    },
  ],
  vertical_elements: [
    { kind: "retaining_wall", description: "timber wall along driveway", confidence: 0.7 },
  ],
  cannot_see: ["back yard"],
});

describe("extractJson", () => {
  it("passes bare JSON through", () => {
    expect(extractJson('{"a": 1}')).toBe('{"a": 1}');
  });

  it("strips a ```json fence", () => {
    expect(extractJson('Here you go:\n```json\n{"a": 1}\n```\nDone.')).toBe('{"a": 1}');
  });

  it("recovers an object embedded in prose", () => {
    expect(extractJson('Sure! {"a": {"b": 2}} hope that helps')).toBe('{"a": {"b": 2}}');
  });
});

describe("parseSegmentation", () => {
  it("parses a valid response", () => {
    const result = parseSegmentation(validResponse);
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0]).toMatchObject({
      id: "front_lawn",
      kind: "turf",
      label: "Front lawn",
      existingMaterial: "turf grass",
      confidence: 0.9,
    });
    expect(result.regions[1]).toMatchObject({
      condition: "faded, weeds coming through",
      estimatedAreaSf: 281, // rounded to whole SF
    });
    expect(result.verticalElements).toEqual([
      { kind: "retaining_wall", description: "timber wall along driveway", confidence: 0.7 },
    ]);
    expect(result.cannotSee).toEqual(["back yard"]);
    expect(result.source).toBe("claude");
  });

  it("drops invalid area estimates and defaults vertical elements to empty", () => {
    const result = parseSegmentation(
      JSON.stringify({
        regions: [
          { kind: "bed", polygon: [[0, 0], [1, 0], [1, 1]], estimated_area_sf: -50 },
          { kind: "turf", polygon: [[0, 0], [1, 0], [1, 1]], estimated_area_sf: "big" },
        ],
      }),
    );
    expect(result.regions.map((r) => r.estimatedAreaSf)).toEqual([undefined, undefined]);
    expect(result.verticalElements).toEqual([]);
  });

  it("normalizes vertical element kinds and drops malformed entries", () => {
    const result = parseSegmentation(
      JSON.stringify({
        regions: [],
        vertical_elements: [
          { kind: "Stairs", description: "front stoop steps", confidence: 0.9 },
          { kind: "slope", description: "yard falls toward street" },
          { kind: "retaining_wall" }, // no description → dropped
          { kind: "chimney", description: "brick chimney" }, // unknown kind → dropped
        ],
      }),
    );
    expect(result.verticalElements).toEqual([
      { kind: "steps", description: "front stoop steps", confidence: 0.9 },
      { kind: "grade_change", description: "yard falls toward street", confidence: 0.5 },
    ]);
  });

  it("clamps out-of-range coordinates and confidence into [0, 1]", () => {
    const result = parseSegmentation(
      JSON.stringify({
        regions: [
          {
            kind: "bed",
            polygon: [
              [-0.2, 0.5],
              [1.4, 0.5],
              [0.5, 1.9],
            ],
            confidence: 3,
          },
        ],
      }),
    );
    expect(result.regions[0].polygon).toEqual([
      [0, 0.5],
      [1, 0.5],
      [0.5, 1],
    ]);
    expect(result.regions[0].confidence).toBe(1);
  });

  it("drops regions with unknown kinds or degenerate polygons", () => {
    const result = parseSegmentation(
      JSON.stringify({
        regions: [
          { kind: "swimming_pool", polygon: [[0, 0], [1, 0], [1, 1]] },
          { kind: "bed", polygon: [[0, 0], [1, 1]] }, // only 2 vertices
          { kind: "bed", polygon: [[0, 0], [1, 0], [1, 1]] },
        ],
      }),
    );
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].kind).toBe("bed");
  });

  it("maps common kind synonyms", () => {
    const result = parseSegmentation(
      JSON.stringify({
        regions: [
          { kind: "lawn", polygon: [[0, 0], [1, 0], [1, 1]] },
          { kind: "walkway", polygon: [[0, 0], [1, 0], [1, 1]] },
          { kind: "Foundation Planting", polygon: [[0, 0], [1, 0], [1, 1]] },
        ],
      }),
    );
    expect(result.regions.map((r) => r.kind)).toEqual([
      "turf",
      "hardscape",
      "foundation_planting",
    ]);
  });

  it("accepts {x, y} vertex objects", () => {
    const result = parseSegmentation(
      JSON.stringify({
        regions: [
          {
            kind: "bed",
            polygon: [
              { x: 0.1, y: 0.2 },
              { x: 0.5, y: 0.2 },
              { x: 0.3, y: 0.6 },
            ],
          },
        ],
      }),
    );
    expect(result.regions[0].polygon).toEqual([
      [0.1, 0.2],
      [0.5, 0.2],
      [0.3, 0.6],
    ]);
  });

  it("fills default ids and labels", () => {
    const result = parseSegmentation(
      JSON.stringify({ regions: [{ kind: "bed", polygon: [[0, 0], [1, 0], [1, 1]] }] }),
    );
    expect(result.regions[0].id).toBe("region_1");
    expect(result.regions[0].label).toBe("Region 1");
  });

  it("parses a fenced response with surrounding prose", () => {
    const result = parseSegmentation("Here is the analysis:\n```json\n" + validResponse + "\n```");
    expect(result.regions).toHaveLength(2);
  });

  it("throws when no JSON can be recovered", () => {
    expect(() => parseSegmentation("I cannot analyze this image.")).toThrow(/JSON/);
  });

  it("returns empty regions for a photo with no landscape", () => {
    const result = parseSegmentation(
      JSON.stringify({ regions: [], cannot_see: ["no landscape visible in photo"] }),
    );
    expect(result.regions).toEqual([]);
    expect(result.cannotSee).toEqual(["no landscape visible in photo"]);
  });
});

describe("plantings", () => {
  // The list exists for one reason: swapping a bed's surface used to paint
  // the new material over every shrub standing in it.
  const withPlantings = (plantings: unknown) =>
    JSON.stringify({
      regions: [
        {
          kind: "bed",
          label: "Bed",
          polygon: [
            [0.1, 0.6],
            [0.9, 0.6],
            [0.9, 0.9],
            [0.1, 0.9],
          ],
          plantings,
          confidence: 0.8,
        },
      ],
    });

  it("reads ellipses off a region", () => {
    const { regions } = parseSegmentation(
      withPlantings([{ cx: 0.3, cy: 0.7, rx: 0.04, ry: 0.05, label: "boxwood" }]),
    );
    expect(regions[0].plantings).toEqual([
      { id: "region_1_plant_1", cx: 0.3, cy: 0.7, rx: 0.04, ry: 0.05, label: "boxwood" },
    ]);
  });

  it("leaves the field off entirely when there are none", () => {
    // Which is what every region stored before this existed looks like,
    // and every consumer has to render that correctly.
    expect(parseSegmentation(withPlantings([])).regions[0].plantings).toBeUndefined();
    expect(parseSegmentation(withPlantings(undefined)).regions[0].plantings).toBeUndefined();
    expect(parseSegmentation(withPlantings("shrubs")).regions[0].plantings).toBeUndefined();
  });

  it("drops specks and clamps an over-generous radius", () => {
    const { regions } = parseSegmentation(
      withPlantings([
        { cx: 0.3, cy: 0.7, rx: 0.0001, ry: 0.05 },
        { cx: 0.5, cy: 0.7, rx: 9, ry: 0.05 },
        { cx: 0.7, cy: 0.7, rx: 0.04, ry: "big" },
      ]),
    );
    // The speck and the unparseable one go; the giant is clamped, not lost.
    expect(regions[0].plantings).toEqual([
      { id: "region_1_plant_1", cx: 0.5, cy: 0.7, rx: 0.5, ry: 0.05, label: undefined },
    ]);
  });

  it("gives each plant an id that survives the store, so a choice can name it", () => {
    // The id is the parser's, not the model's: a customer's choice of what
    // to put here is keyed by it and has to mean the same thing after a
    // reload.
    const { regions } = parseSegmentation(
      withPlantings([
        { cx: 0.3, cy: 0.7, rx: 0.04, ry: 0.05 },
        { cx: 0.6, cy: 0.7, rx: 0.04, ry: 0.05 },
      ]),
    );
    expect(regions[0].plantings!.map((p) => p.id)).toEqual([
      "region_1_plant_1",
      "region_1_plant_2",
    ]);
  });

  it("stops counting well before a model enumerates ground cover", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      cx: 0.2 + i * 0.005,
      cy: 0.7,
      rx: 0.01,
      ry: 0.01,
    }));
    expect(parseSegmentation(withPlantings(many)).regions[0].plantings).toHaveLength(24);
  });
});

describe("the ground line", () => {
  const response = (groundLine: unknown, top: number) =>
    JSON.stringify({
      ground_line: groundLine,
      regions: [
        {
          kind: "foundation_planting",
          label: "Bed along the house",
          polygon: [
            [0.1, top],
            [0.9, top],
            [0.9, 0.8],
            [0.1, 0.8],
          ],
          confidence: 0.8,
        },
      ],
    });

  it("pulls a region that climbed the wall back down to the ground", () => {
    // The failure a real photograph produced: a foundation bed whose
    // polygon reached a third of the way up the brick.
    const { regions } = parseSegmentation(response([[0, 0.6], [1, 0.6]], 0.25));
    for (const [, y] of regions[0].polygon) expect(y).toBeGreaterThanOrEqual(0.6);
  });

  it("does not carry the ground line out of the parse", () => {
    // It is an input, consumed here. Carrying it would mean either a
    // column nobody queries or a result that does not survive the store.
    expect(parseSegmentation(response([[0, 0.6], [1, 0.6]], 0.25))).not.toHaveProperty(
      "groundLine",
    );
  });

  it("leaves the model's own polygon alone in the raw parse", () => {
    // The clamp is a policy of ours, and for as long as it lived inside
    // the parser there was no way to tell an outline the model placed
    // badly from one we moved. Three rounds of prompt work were spent on
    // the assumption it was the former. `npm run segment` compares the
    // two, and this is the property that makes that comparison mean
    // anything: raw is what was said, before we touch it.
    const body = response([[0, 0.6], [1, 0.6]], 0.25);
    expect(parseSegmentationRaw(body).regions[0].polygon[0]).toEqual([0.1, 0.25]);
    expect(parseSegmentation(body).regions[0].polygon[0]).toEqual([0.1, 0.6]);
  });

  it("carries the reported ground line on the raw parse, so it can be drawn", () => {
    expect(parseSegmentationRaw(response([[0, 0.6], [1, 0.6]], 0.25)).groundLine).toEqual([
      [0, 0.6],
      [1, 0.6],
    ]);
  });

  it("shows a ground line the quorum threw away, which the clamped parse cannot", () => {
    // A line at 0.9 would flatten this region to nothing, so the quorum
    // discards the line whole and the region comes through untouched.
    // That is the right call — but from the clamped result alone it is
    // indistinguishable from the model never having reported a line, and
    // those two want completely different fixes.
    const body = response([[0, 0.9], [1, 0.9]], 0.2);
    expect(parseSegmentation(body).regions[0].polygon[0]).toEqual([0.1, 0.2]);
    expect(parseSegmentationRaw(body).groundLine).toEqual([
      [0, 0.9],
      [1, 0.9],
    ]);
  });

  it("leaves a region that already sits on the ground alone", () => {
    const { regions } = parseSegmentation(response([[0, 0.6], [1, 0.6]], 0.7));
    expect(regions[0].polygon[0]).toEqual([0.1, 0.7]);
  });

  it("changes nothing when the model reports no ground line", () => {
    const { regions } = parseSegmentation(response(undefined, 0.25));
    expect(regions[0].polygon[0]).toEqual([0.1, 0.25]);
  });

  it("accepts a two-point line, which is what a flat photo gets", () => {
    // parsePolygon needs three vertices to enclose something; a polyline
    // across a photo is very often exactly two.
    const { regions } = parseSegmentation(response([[0.05, 0.55], [0.95, 0.6]], 0.3));
    expect(regions[0].polygon[0][1]).toBeGreaterThan(0.3);
  });
});
