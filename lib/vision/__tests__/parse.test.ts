import { describe, expect, it } from "vitest";

import { extractJson, parseSegmentation } from "../parse";

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
