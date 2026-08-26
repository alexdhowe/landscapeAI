/**
 * Address → coordinates. Server-only.
 *
 * Provider is Nominatim (OpenStreetMap) for the MVP — no key required, but
 * check commercial terms before production traffic; the project map flags
 * the geocoder as a pre-launch decision (Mapbox/Google are the paid
 * candidates). When Nominatim is unreachable or GEOCODER=demo is set, a
 * fixed demo pin is returned and labeled source: "demo" — a demo location
 * must never pass itself off as the customer's address.
 *
 * Condo/HOA caveat from the map: complexes geocode to a centroid, not a
 * parcel. The customer confirms the pin on the aerial before drawing.
 */

export type GeocodeCandidate = {
  label: string;
  lat: number;
  lng: number;
  source: "nominatim" | "demo";
};

export type GeocodeResult = {
  candidates: GeocodeCandidate[];
  source: "nominatim" | "demo";
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 6000;

export function demoGeocode(): GeocodeResult {
  return {
    candidates: [
      {
        label: "Demo pin — Capitol Square, Madison, WI (geocoder unavailable)",
        lat: 43.0747,
        lng: -89.3844,
        source: "demo",
      },
    ],
    source: "demo",
  };
}

export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  if (process.env.GEOCODER === "demo") return demoGeocode();

  const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&addressdetails=0&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim usage policy requires an identifying User-Agent.
        "User-Agent": "MyScape-mvp/0.1 (dev)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return demoGeocode();
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return demoGeocode();

    const candidates: GeocodeCandidate[] = [];
    for (const item of raw) {
      const row = item as { display_name?: unknown; lat?: unknown; lon?: unknown };
      const lat = Number(row.lat);
      const lng = Number(row.lon);
      if (
        typeof row.display_name === "string" &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        candidates.push({ label: row.display_name, lat, lng, source: "nominatim" });
      }
    }
    if (candidates.length === 0) {
      // A reachable geocoder that found nothing is a real "no match", not
      // an outage — do not paper over it with a demo pin.
      return { candidates: [], source: "nominatim" };
    }
    return { candidates, source: "nominatim" };
  } catch {
    return demoGeocode();
  }
}
