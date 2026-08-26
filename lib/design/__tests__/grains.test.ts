/**
 * The pieces a material is made of.
 *
 * Everything asserted here is something that was wrong at some point on a
 * contact sheet, and the sheet is still the judge of whether a material
 * looks like itself. What tests can hold is the structure underneath it:
 * that the same seed draws the same bed twice, that a tile is several
 * pieces across rather than one or two, that a piece crossing an edge is
 * emitted on the far side so the repeat has no seam, and that the gauge
 * a photograph asks for is the gauge the pieces come out at.
 */
import { describe, expect, it } from "vitest";

import { facetPath, grainTile, type GrainShape } from "../grains";

const PEBBLE: GrainShape = {
  kind: "pebble",
  aspect: 1.25,
  packing: 0.7,
  toneSpread: 0.5,
  seed: 3,
};
const STRAND: GrainShape = {
  kind: "strand",
  aspect: 4.5,
  packing: 0.3,
  toneSpread: 0.42,
  seed: 7,
};
const CHIP: GrainShape = {
  kind: "chip",
  aspect: 1.2,
  packing: 0.68,
  toneSpread: 0.34,
  seed: 5,
};

describe("grainTile", () => {
  it("draws the same bed from the same seed", () => {
    // The swap is a projection of the object graph: two renders of one
    // design must not disagree about where the stones are.
    expect(grainTile(PEBBLE, 12)).toEqual(grainTile(PEBBLE, 12));
  });

  it("draws a different bed from a different seed", () => {
    const other = grainTile({ ...PEBBLE, seed: 4 }, 12);
    expect(other.grains[0]).not.toEqual(grainTile(PEBBLE, 12).grains[0]);
  });

  it("sizes the pieces to the gauge it was given", () => {
    // A "1.5in river rock" is drawn at 1.5 inches or the whole exercise
    // is pointless — this is the check that the gauge actually arrives.
    const small = grainTile(PEBBLE, 6);
    const large = grainTile(PEBBLE, 24);
    const median = (tile: ReturnType<typeof grainTile>) =>
      [...tile.grains.map((g) => g.ry)].sort((a, b) => a - b)[
        Math.floor(tile.grains.length / 2)
      ];
    expect(median(large) / median(small)).toBeCloseTo(4, 1);
  });

  it("makes a tile several pieces across, not one or two", () => {
    // A tile barely longer than the piece in it *is* the pattern: a bed
    // of mulch came out as visible houndstooth that way.
    for (const shape of [PEBBLE, STRAND, CHIP]) {
      const tile = grainTile(shape, 10);
      const longest = Math.max(...tile.grains.map((g) => g.rx * 2));
      expect(tile.size / longest).toBeGreaterThan(4);
    }
  });

  it("wraps every piece that crosses an edge", () => {
    // The pattern clips content to the tile, so the far half has to be
    // drawn at the far side or the repeat has a seam down it.
    const tile = grainTile(PEBBLE, 12);
    const crossing = tile.grains.filter((g) => {
      const reach = Math.max(g.rx, g.ry);
      return g.x - reach < 0 && g.x >= 0 && g.x <= tile.size;
    });
    expect(crossing.length).toBeGreaterThan(0);
    for (const grain of crossing) {
      const twin = tile.grains.find(
        (g) =>
          Math.abs(g.x - (grain.x + tile.size)) < 1e-6 &&
          Math.abs(g.y - grain.y) < 1e-6,
      );
      expect(twin).toBeDefined();
    }
  });

  it("covers the ground rather than dotting it", () => {
    // Enough pieces that the dark bed shows only in the gaps. Below
    // about one coverage the "material" is a scatter on a dark square.
    const tile = grainTile(PEBBLE, 12);
    const area = tile.grains.reduce((sum, g) => sum + Math.PI * g.rx * g.ry, 0);
    expect(area / (tile.size * tile.size)).toBeGreaterThan(1);
  });

  it("gives a chip corners and a pebble none", () => {
    expect(grainTile(CHIP, 12).grains.every((g) => g.points)).toBe(true);
    expect(grainTile(PEBBLE, 12).grains.every((g) => !g.points)).toBe(true);
  });

  it("lays a strand longer than it is wide", () => {
    for (const grain of grainTile(STRAND, 10).grains) {
      expect(grain.rx / grain.ry).toBeCloseTo(4.5, 5);
    }
  });

  it("keeps every tone on the ramp", () => {
    for (const shape of [PEBBLE, STRAND, CHIP]) {
      for (const grain of grainTile(shape, 10).grains) {
        expect(grain.tone).toBeGreaterThanOrEqual(0);
        expect(grain.tone).toBeLessThanOrEqual(1);
      }
    }
  });

  it("holds a sub-pixel gauge to something drawable", () => {
    // A photograph of a whole street will ask for a 3/8in chip at a
    // fraction of a pixel. That is aliasing, not texture.
    const tile = grainTile(CHIP, 0.01);
    expect(tile.size).toBeGreaterThan(0);
    expect(tile.grains.length).toBeGreaterThan(0);
    expect(Number.isFinite(tile.grains[0].rx)).toBe(true);
  });

  it("makes a second layer that shares no period with the first", () => {
    // What stops a bed twenty tiles wide reading as wallpaper.
    const base = grainTile(PEBBLE, 12);
    const overlay = grainTile(PEBBLE, 12, {
      tileScale: 0.71,
      density: 0.55,
      seedOffset: 977,
    });
    expect(overlay.size).toBeLessThan(base.size);
    const ratio = base.size / overlay.size;
    expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.1);
    expect(overlay.grains.length).toBeLessThan(base.grains.length);
  });
});

describe("facetPath", () => {
  it("closes the outline", () => {
    const path = facetPath([
      [0, 0],
      [3, 1],
      [1, 4],
    ]);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});
