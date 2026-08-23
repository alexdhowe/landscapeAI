/**
 * Whether the aerial leg — `/design/[projectId]/locate`, the geocoder and
 * the drawing routes behind it — may be served at all.
 *
 * This is not a feature flag. It is the two licensing decisions from
 * project-map §3 expressed as code, because both of them gate exactly this
 * surface and neither is a build session's to make:
 *
 *   **Imagery.** Some tile licences prohibit deriving and reselling
 *   measurements, which is precisely what this leg does with them. The
 *   Esri tiles the map draws today are `unreviewed` — nobody has read the
 *   terms against this use. `lib/imagery/provider.ts` carries the field.
 *
 *   **Geocoding.** Nominatim needs no key, and its usage policy does not
 *   cover production commercial traffic. Mapbox and Google are the paid
 *   candidates §3 names. Nothing in this repo picks one.
 *
 * Until BOTH are declared `permitted` by the operator, this leg is off and
 * the rest of the funnel ships without it: the customer keeps their photo,
 * their design and a typology band, which is the same path §3 already
 * specifies for the customer who declines to give an address. The band
 * simply stays at typology width rather than narrowing.
 *
 * Declaring a licence is the operator's act, not this repo's. Anything
 * unrecognised — including unset — is `unreviewed`, which is off. There is
 * deliberately no way to force this leg on without naming the term you
 * signed.
 *
 * Pure and client-safe: it reads only NEXT_PUBLIC_ variables (the price
 * rail is a client component and has to know whether to offer the button),
 * and `NEXT_PUBLIC_` here means *inlined at build*, not *secret* — a
 * licence term is a fact about the deployment, never a credential.
 */
import {
  licensedForMeasurement,
  resolveImageryProvider,
  type DerivativeMeasurementLicence,
} from "../imagery/provider";

export type LocateBlocker = "imagery" | "geocoder";

export type LocateEnv = {
  imagery?: Parameters<typeof resolveImageryProvider>[0];
  /** unreviewed | prohibited | permitted — the commercial terms of the geocoder in use. */
  geocoderLicence?: string;
};

function readEnv(): Required<LocateEnv> {
  return {
    imagery: {
      tileUrl: process.env.NEXT_PUBLIC_SATELLITE_TILE_URL,
      attribution: process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION,
      maxZoom: process.env.NEXT_PUBLIC_SATELLITE_MAX_ZOOM,
      derivativeMeasurements: process.env.NEXT_PUBLIC_SATELLITE_LICENCE,
    },
    geocoderLicence: process.env.NEXT_PUBLIC_GEOCODER_LICENCE ?? "",
  };
}

function geocoderLicence(declared: string | undefined): DerivativeMeasurementLicence {
  const value = declared?.trim();
  return value === "permitted" || value === "prohibited" ? value : "unreviewed";
}

/**
 * What is holding the aerial leg back, most likely to be the blocker
 * first. Empty means it may be served.
 */
export function locateBlockers(env: LocateEnv = readEnv()): LocateBlocker[] {
  const resolved = { ...readEnv(), ...env };
  const blockers: LocateBlocker[] = [];
  if (!licensedForMeasurement(resolveImageryProvider(resolved.imagery))) {
    blockers.push("imagery");
  }
  if (geocoderLicence(resolved.geocoderLicence) !== "permitted") {
    blockers.push("geocoder");
  }
  return blockers;
}

/** May the aerial leg be served? */
export function locateEnabled(env: LocateEnv = readEnv()): boolean {
  return locateBlockers(env).length === 0;
}
