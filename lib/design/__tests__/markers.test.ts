/**
 * The rule the overlay's name markers follow.
 *
 * Two regions whose centroids land in the same part of the picture used to
 * put one pill exactly on top of another — one region left unnamed, and a
 * stack that reads as a bug. That is a property of the geometry, so it is
 * asserted against geometry here rather than looked for in a screenshot.
 */
import { describe, expect, it } from "vitest";

import { layoutRegionMarkers } from "../markers";

/** An axis-aligned rectangle in normalised photo coordinates. */
function rect(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { id: string; polygon: [number, number][] } {
  return {
    id,
    polygon: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  };
}

const INSET = 0.18;
const MIN_GAP_Y = 0.085;
const OVERLAP_X = 0.42;

// Placements are sums of gaps, so an exactly-one-gap separation lands a
// float's width either side of the number. Same tolerance the module uses.
const EPSILON = 1e-9;

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (
    Math.abs(a.x - b.x) < OVERLAP_X - EPSILON &&
    Math.abs(a.y - b.y) < MIN_GAP_Y - EPSILON
  );
}

describe("layoutRegionMarkers", () => {
  it("keeps a marker's centre inside the frame", () => {
    // Regions hugging every edge: a marker centred on one of these
    // centroids would hang half of itself outside the picture.
    const placements = layoutRegionMarkers([
      rect("top", 0.4, 0, 0.6, 0.04),
      rect("bottom", 0.4, 0.97, 0.6, 1),
      rect("left", 0, 0.4, 0.03, 0.6),
      rect("right", 0.98, 0.4, 1, 0.6),
    ]);
    for (const p of placements) {
      expect(p.x, `${p.id} x`).toBeGreaterThanOrEqual(INSET);
      expect(p.x, `${p.id} x`).toBeLessThanOrEqual(1 - INSET);
      expect(p.y, `${p.id} y`).toBeGreaterThanOrEqual(INSET);
      expect(p.y, `${p.id} y`).toBeLessThanOrEqual(1 - INSET);
    }
  });

  it("leaves a marker on its own centroid when nothing is near it", () => {
    const [left, right] = layoutRegionMarkers([
      rect("left", 0.1, 0.3, 0.3, 0.5),
      rect("right", 0.7, 0.6, 0.9, 0.8),
    ]);
    expect(left.x).toBeCloseTo(0.2, 6);
    expect(left.y).toBeCloseTo(0.4, 6);
    expect(right.x).toBeCloseTo(0.8, 6);
    expect(right.y).toBeCloseTo(0.7, 6);
  });

  it("pushes two markers apart when their centroids coincide", () => {
    // The real case: a lawn that wraps the walk, and the walk. Both
    // centroids land within a couple of percent of the same point.
    const placements = layoutRegionMarkers([
      rect("lawn", 0.05, 0.55, 0.95, 0.98),
      rect("walk", 0.44, 0.56, 0.56, 0.99),
    ]);
    expect(overlaps(placements[0], placements[1])).toBe(false);
  });

  it("keeps a nudged marker inside the region it names", () => {
    // The real case, again: a lawn that occupies the bottom half of the
    // picture and a walk running up through it. Pushing the lawn's name
    // clear of the walk's must not land it on the house.
    const lawn = rect("lawn", 0.02, 0.5, 0.98, 1);
    const walk = rect("walk", 0.42, 0.48, 0.58, 1);
    for (const placement of layoutRegionMarkers([lawn, walk])) {
      expect(placement.y, `${placement.id} stays in the lower half`)
        .toBeGreaterThanOrEqual(0.48);
    }
  });

  it("leaves a region rather than stack two names in it", () => {
    // When the shape is too small to hold two markers apart, legibility
    // wins: better a name a little off its region than two on top of
    // each other, which costs the customer a whole region.
    const placements = layoutRegionMarkers([
      rect("a", 0.45, 0.48, 0.55, 0.52),
      rect("b", 0.44, 0.49, 0.56, 0.51),
    ]);
    expect(overlaps(placements[0], placements[1])).toBe(false);
  });

  it("separates a whole stack of regions sharing one spot", () => {
    const placements = layoutRegionMarkers([
      rect("a", 0.45, 0.45, 0.55, 0.55),
      rect("b", 0.44, 0.44, 0.56, 0.56),
      rect("c", 0.46, 0.46, 0.54, 0.54),
      rect("d", 0.43, 0.43, 0.57, 0.57),
    ]);
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        expect(
          overlaps(placements[i], placements[j]),
          `${placements[i].id} overlaps ${placements[j].id}`,
        ).toBe(false);
      }
    }
  });

  it("does not move markers that share a row but not a column", () => {
    // Far enough apart horizontally that they cannot cover each other, so
    // nudging them would only move a name away from its region.
    const placements = layoutRegionMarkers([
      rect("far-left", 0.16, 0.4, 0.24, 0.6),
      rect("far-right", 0.76, 0.4, 0.84, 0.6),
    ]);
    expect(placements[0].y).toBeCloseTo(0.5, 6);
    expect(placements[1].y).toBeCloseTo(0.5, 6);
  });

  it("returns one placement per region, in the order given", () => {
    const regions = [
      rect("one", 0.1, 0.1, 0.3, 0.3),
      rect("two", 0.4, 0.4, 0.6, 0.6),
      rect("three", 0.7, 0.7, 0.9, 0.9),
    ];
    expect(layoutRegionMarkers(regions).map((p) => p.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(layoutRegionMarkers([])).toEqual([]);
  });

  it("places the same regions the same way whatever order they arrive in", () => {
    // The model does not promise an order, and the picture must not
    // depend on one.
    const regions = [
      rect("a", 0.4, 0.42, 0.6, 0.58),
      rect("b", 0.42, 0.44, 0.58, 0.56),
      rect("c", 0.1, 0.2, 0.3, 0.4),
    ];
    const forward = layoutRegionMarkers(regions);
    const backward = layoutRegionMarkers([...regions].reverse());
    for (const placement of forward) {
      const other = backward.find((p) => p.id === placement.id)!;
      expect(other.x, `${placement.id} x`).toBeCloseTo(placement.x, 12);
      expect(other.y, `${placement.id} y`).toBeCloseTo(placement.y, 12);
    }
  });
});
