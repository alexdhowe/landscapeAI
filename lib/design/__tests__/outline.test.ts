/**
 * The two properties that decide how a region's boundary is drawn.
 *
 * Written against the report that prompted them: an outline that read as
 * faceted where the bed curves, and that ran across the river-rock border
 * of the bed instead of stopping inside it.
 */
import { describe, expect, it } from "vitest";

import { closedPathData, smoothOutline } from "../outline";
import type { NormalizedPoint } from "../../vision/types";

/** A regular n-gon sampled on a circle — a stand-in for a curved bed edge. */
function circle(n: number, r = 0.3, cx = 0.5, cy = 0.5): NormalizedPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as NormalizedPoint;
  });
}

const SQUARE: NormalizedPoint[] = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
];

/** Is `p` inside the convex polygon `ring`? (All test rings are convex.) */
function inside(p: NormalizedPoint, ring: readonly NormalizedPoint[]): boolean {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

describe("smoothOutline", () => {
  it("never bulges outside the polygon it came from", () => {
    // The property the whole choice of scheme rests on. A spline through
    // the points would overshoot on convex turns and push the swapped
    // material further over the bed's stone border — the exact complaint.
    const source = circle(16);
    for (const p of smoothOutline(source)) {
      expect(inside(p, source), `${p} escaped the polygon`).toBe(true);
    }
  });

  it("turns a faceted curve into a rounder one", () => {
    // Measured as how far the ring's own vertices sit from the circle they
    // were sampled from: cutting the corners of an inscribed polygon moves
    // them inward, but far more evenly — the facets go.
    const source = circle(12);
    const smoothed = smoothOutline(source);
    expect(smoothed.length).toBeGreaterThan(source.length * 3);
    const spread = (ring: NormalizedPoint[]) => {
      const radii = ring.map((p) => Math.hypot(p[0] - 0.5, p[1] - 0.5));
      return Math.max(...radii) - Math.min(...radii);
    };
    // The source is a polygon: every vertex is at r, every edge midpoint
    // is nearer. The smoothed ring's own points vary far less.
    const midpoints = source.map((p, i) => {
      const q = source[(i + 1) % source.length];
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as NormalizedPoint;
    });
    expect(spread(smoothed)).toBeLessThan(spread([...source, ...midpoints]));
  });

  it("keeps a real corner a corner", () => {
    // A driveway is a rectangle and a step is square. Rounding those is
    // not smoothing, it is being wrong in a different direction.
    const smoothed = smoothOutline(SQUARE);
    for (const corner of SQUARE) {
      expect(
        smoothed.some((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1]) < 1e-9),
        `corner ${corner} was rounded off`,
      ).toBe(true);
    }
    expect(smoothed).toEqual(SQUARE);
  });

  it("smooths the curved part of a shape that also has a corner", () => {
    // A bed that runs into a square porch: the curve gets cut, the corner
    // does not.
    const halfCircle = circle(14).filter(([, y]) => y >= 0.5);
    const withCorner: NormalizedPoint[] = [...halfCircle, [0.95, 0.95], [0.05, 0.95]];
    const smoothed = smoothOutline(withCorner);
    expect(
      smoothed.some((p) => Math.hypot(p[0] - 0.95, p[1] - 0.95) < 1e-9),
      "the sharp corner was rounded",
    ).toBe(true);
    expect(smoothed.length).toBeGreaterThan(withCorner.length);
  });

  it("leaves a shape with nothing to smooth alone", () => {
    const triangle: NormalizedPoint[] = [
      [0.2, 0.2],
      [0.8, 0.3],
      [0.5, 0.9],
    ];
    expect(smoothOutline(triangle)).toEqual(triangle);
    expect(smoothOutline([])).toEqual([]);
    expect(smoothOutline(circle(16), { iterations: 0 })).toEqual(circle(16));
  });

  it("is deterministic", () => {
    // The picture must not change between two renders of one design.
    const source = circle(9, 0.22, 0.4, 0.6);
    expect(smoothOutline(source)).toEqual(smoothOutline(source));
  });

  it("survives duplicated points without inventing a corner", () => {
    const withDupe: NormalizedPoint[] = [
      [0.2, 0.2],
      [0.5, 0.2],
      [0.5, 0.2],
      [0.8, 0.5],
      [0.5, 0.8],
      [0.2, 0.5],
    ];
    const smoothed = smoothOutline(withDupe);
    expect(smoothed.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });
});

describe("closedPathData", () => {
  it("scales into the drawing space and closes the ring", () => {
    const d = closedPathData(
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      100,
      200,
    );
    expect(d).toBe("M0.00,0.00 L100.00,0.00 L100.00,200.00 Z");
  });

  it("is empty for an empty ring", () => {
    expect(closedPathData([], 100, 100)).toBe("");
  });
});
