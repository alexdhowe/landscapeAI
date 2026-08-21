import { describe, expect, it } from "vitest";

import {
  assertValidRing,
  measureRing,
  rectangleRing,
  ringAreaSf,
  ringPerimeterLf,
  type LngLat,
} from "../area";

// A 100ft × 50ft rectangle at Madison, WI latitude, built from the standard
// meters-per-degree series so the expected area (5,000 SF) and perimeter
// (300 LF) are known independently of Turf. Phase 3 acceptance: a drawn
// area must match a known real measurement to within a few percent.
const LAT = 43.0747;
const LNG = -89.3844;

function rectAt(widthFt: number, heightFt: number): LngLat[] {
  const phi = (LAT * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const mPerDegLng = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  const dLat = (heightFt * 0.3048) / mPerDegLat;
  const dLng = (widthFt * 0.3048) / mPerDegLng;
  return [
    [LNG, LAT],
    [LNG + dLng, LAT],
    [LNG + dLng, LAT + dLat],
    [LNG, LAT + dLat],
  ];
}

describe("ringAreaSf / ringPerimeterLf", () => {
  it("measures a known 100ft x 50ft rectangle to within 2%", () => {
    const ring = rectAt(100, 50);
    expect(ringAreaSf(ring)).toBeGreaterThan(5000 * 0.98);
    expect(ringAreaSf(ring)).toBeLessThan(5000 * 1.02);
    expect(ringPerimeterLf(ring)).toBeGreaterThan(300 * 0.98);
    expect(ringPerimeterLf(ring)).toBeLessThan(300 * 1.02);
  });

  it("accepts a ring whether or not it is explicitly closed", () => {
    const open = rectAt(60, 30);
    const closed = [...open, open[0]] as LngLat[];
    expect(ringAreaSf(closed)).toBeCloseTo(ringAreaSf(open), 6);
  });

  it("rejects degenerate and out-of-bounds rings", () => {
    expect(() => assertValidRing([[0, 0], [1, 1]])).toThrow(/at least 3/);
    expect(() => assertValidRing([[0, 0], [1, 1], [NaN, 2]])).toThrow(/finite/);
    expect(() => assertValidRing([[0, 91], [1, 1], [2, 2]])).toThrow(/bounds/);
    expect(() => assertValidRing("nope")).toThrow();
  });
});

describe("measureRing", () => {
  it("produces provenance-carrying quantities", () => {
    const m = measureRing(rectAt(100, 50), "user_drawn", 0.85, () => "2026-08-21T00:00:00Z");
    expect(m.areaSf.unit).toBe("SF");
    expect(m.areaSf.source).toBe("user_drawn");
    expect(m.areaSf.confidence).toBe(0.85);
    expect(m.areaSf.capturedAt).toBe("2026-08-21T00:00:00Z");
    expect(m.perimeterLf.unit).toBe("LF");
    expect(m.perimeterLf.source).toBe("user_drawn");
  });
});

describe("rectangleRing", () => {
  it("suggests a shape that measures back to the requested area within 1%", () => {
    const ring = rectangleRing({ lat: LAT, lng: LNG }, 300);
    const area = ringAreaSf(ring);
    expect(area).toBeGreaterThan(300 * 0.99);
    expect(area).toBeLessThan(300 * 1.01);
  });

  it("centers the suggestion on the given point", () => {
    const ring = rectangleRing({ lat: LAT, lng: LNG }, 300);
    const midLng = (ring[0][0] + ring[1][0]) / 2;
    const midLat = (ring[0][1] + ring[2][1]) / 2;
    expect(midLng).toBeCloseTo(LNG, 8);
    expect(midLat).toBeCloseTo(LAT, 8);
  });
});
