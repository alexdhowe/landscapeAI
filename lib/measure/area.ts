/**
 * The measurement engine: geodesic area and perimeter from GeoJSON rings.
 *
 * Pure Turf wrappers — no I/O, importable from both server routes and
 * client components (the client uses it only for live preview; the server
 * recomputes every quantity it stores). Per the architectural invariants,
 * this is the only place pixels/coordinates become quantities, and every
 * quantity leaves here with provenance attached.
 */
import { area as turfArea } from "@turf/area";
import { length as turfLength } from "@turf/length";
import { lineString, polygon as turfPolygon } from "@turf/helpers";

import type { Quantity, QuantitySource } from "../pricing/types";

/** [lng, lat] — GeoJSON axis order. */
export type LngLat = [number, number];

export const SQM_TO_SF = 10.763910417;
export const KM_TO_LF = 3280.839895;

const MIN_RING_POINTS = 3;
export const MAX_RING_POINTS = 200;

/**
 * Validate an open ring (first point NOT repeated at the end). Throws on
 * anything a drawing tool shouldn't produce — routes rely on this before
 * quantities are computed or stored.
 */
export function assertValidRing(ring: unknown): asserts ring is LngLat[] {
  if (!Array.isArray(ring) || ring.length < MIN_RING_POINTS) {
    throw new RangeError(`A ring needs at least ${MIN_RING_POINTS} points`);
  }
  if (ring.length > MAX_RING_POINTS) {
    throw new RangeError(`A ring may have at most ${MAX_RING_POINTS} points`);
  }
  for (const point of ring) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      throw new RangeError("Ring points must be finite [lng, lat] pairs");
    }
    const [lng, lat] = point as [number, number];
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      throw new RangeError("Ring points must be within [lng, lat] bounds");
    }
  }
}

function closedRing(ring: LngLat[]): LngLat[] {
  const [x0, y0] = ring[0];
  const [xn, yn] = ring[ring.length - 1];
  return x0 === xn && y0 === yn ? ring : [...ring, [x0, y0]];
}

/** Geodesic area of an open ring, in square feet. */
export function ringAreaSf(ring: LngLat[]): number {
  assertValidRing(ring);
  return turfArea(turfPolygon([closedRing(ring)])) * SQM_TO_SF;
}

/** Geodesic perimeter of an open ring, in linear feet. */
export function ringPerimeterLf(ring: LngLat[]): number {
  assertValidRing(ring);
  return turfLength(lineString(closedRing(ring)), { units: "kilometers" }) * KM_TO_LF;
}

export type RingMeasurement = {
  areaSf: Quantity;
  perimeterLf: Quantity;
};

/**
 * Measure a drawn ring into provenance-carrying quantities. The caller
 * states the source honestly: 'user_drawn' for polygons a customer drew or
 * adjusted over aerial imagery; 'aerial' is reserved for machine-detected
 * geometry (Phase 4+).
 */
export function measureRing(
  ring: LngLat[],
  source: QuantitySource,
  confidence: number,
  now: () => string = () => new Date().toISOString(),
): RingMeasurement {
  const capturedAt = now();
  return {
    areaSf: {
      value: Math.round(ringAreaSf(ring) * 10) / 10,
      unit: "SF",
      source,
      confidence,
      capturedAt,
    },
    perimeterLf: {
      value: Math.round(ringPerimeterLf(ring) * 10) / 10,
      unit: "LF",
      source,
      confidence,
      capturedAt,
    },
  };
}

// Meters per degree of latitude/longitude at latitude φ (standard series
// expansion — good to well under 0.1% at MVP scales).
function metersPerDegLat(latDeg: number): number {
  const phi = (latDeg * Math.PI) / 180;
  return 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
}

function metersPerDegLng(latDeg: number): number {
  const phi = (latDeg * Math.PI) / 180;
  return 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
}

/**
 * A rectangle of the given area (square feet, 2:1 aspect) centered on a
 * point — the auto-suggested starter shape the customer adjusts on the
 * aerial. A drawing aid only: nothing is priced from it until the customer
 * saves it, at which point it is measured like any drawn ring.
 */
export function rectangleRing(
  center: { lat: number; lng: number },
  areaSf: number,
  aspect = 2,
): LngLat[] {
  const areaM2 = Math.max(1, areaSf) / SQM_TO_SF;
  const heightM = Math.sqrt(areaM2 / aspect);
  const widthM = heightM * aspect;
  const dLat = heightM / 2 / metersPerDegLat(center.lat);
  const dLng = widthM / 2 / metersPerDegLng(center.lat);
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
    [center.lng - dLng, center.lat + dLat],
  ];
}
