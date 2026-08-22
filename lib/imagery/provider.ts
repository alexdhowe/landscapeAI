/**
 * The imagery provider seam.
 *
 * NOT a provider decision — project-map section 3 calls that "the real
 * one", and it is a licensing question rather than a technical one: some
 * tile licences prohibit deriving and reselling measurements, which is
 * exactly what this product does with them. Mapbox, Esri, Nearmap and
 * Vexcel differ on that term and on price per property, and nobody in a
 * build session can pick for the business.
 *
 * What this is: the shape the decision will land in. The satellite raster
 * the map draws today — Esri World Imagery, keyless, demo only — sits
 * behind this type instead of behind two bare environment reads, and every
 * provider carries the one field the decision turns on:
 * `derivativeMeasurements`. When a licence is signed, the answer is a
 * constant in this file and a flag flips; nothing else moves.
 *
 * Pure and client-safe: the map is a client component, so this reads
 * NEXT_PUBLIC_ variables and touches nothing else.
 */

/**
 * Whether the licence permits deriving measurements from the imagery and
 * selling them — the term project-map section 3 flags.
 *
 *   unreviewed  nobody has checked, or it is a demo tile set. Fine for
 *               playing with; not a basis for quoting off.
 *   prohibited  the licence forbids it. The imagery may still be shown as
 *               a backdrop, but a measurement taken on it cannot be sold.
 *   permitted   reviewed and allowed, which is what a production provider
 *               has to be.
 */
export type DerivativeMeasurementLicence = "unreviewed" | "prohibited" | "permitted";

export type ImageryProvider = {
  /** Stable id — what a Property row will record as `imagerySource`. */
  id: string;
  name: string;
  /** XYZ template, `{z}/{y}/{x}` as MapLibre expects it. */
  tileUrl: string;
  attribution: string;
  tileSize: number;
  maxZoom: number;
  derivativeMeasurements: DerivativeMeasurementLicence;
};

/**
 * The demo tiles the map has drawn since Phase 3. Keyless, good enough to
 * see a roof, and explicitly `unreviewed`: Esri's terms have not been read
 * against this use, and until they are, a quantity drawn on these tiles is
 * a demo quantity.
 */
export const ESRI_WORLD_IMAGERY: ImageryProvider = {
  id: "esri_world_imagery",
  name: "Esri World Imagery",
  tileUrl:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  tileSize: 256,
  maxZoom: 19,
  derivativeMeasurements: "unreviewed",
};

export type ImageryEnv = {
  tileUrl?: string;
  attribution?: string;
  maxZoom?: string;
  derivativeMeasurements?: string;
};

const LICENCES: DerivativeMeasurementLicence[] = [
  "unreviewed",
  "prohibited",
  "permitted",
];

/**
 * The configured provider, or the demo tiles.
 *
 * An operator who has licensed imagery points the tile URL at it and
 * declares the licence term they signed. Declaring it is theirs to do —
 * this repo will not assume a licence it has not read, so anything
 * unrecognised stays `unreviewed`.
 */
export function resolveImageryProvider(
  env: ImageryEnv = {
    tileUrl: process.env.NEXT_PUBLIC_SATELLITE_TILE_URL,
    attribution: process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION,
    maxZoom: process.env.NEXT_PUBLIC_SATELLITE_MAX_ZOOM,
    derivativeMeasurements: process.env.NEXT_PUBLIC_SATELLITE_LICENCE,
  },
): ImageryProvider {
  const tileUrl = env.tileUrl?.trim();
  if (!tileUrl) return ESRI_WORLD_IMAGERY;

  const declared = env.derivativeMeasurements?.trim() as DerivativeMeasurementLicence;
  const maxZoom = Number(env.maxZoom);

  return {
    id: "configured",
    name: "Configured imagery provider",
    tileUrl,
    attribution: env.attribution?.trim() || "Imagery © the configured provider",
    tileSize: 256,
    maxZoom: Number.isFinite(maxZoom) && maxZoom > 0 ? maxZoom : 19,
    derivativeMeasurements: LICENCES.includes(declared) ? declared : "unreviewed",
  };
}

/**
 * May a quantity drawn on this imagery be sold?
 *
 * Nothing gates on this yet — the aerial leg is a demo and says so. It is
 * here because the gate belongs at the provider, not at the call site, and
 * because `/api/imagery` will need exactly this question answered before
 * it can exist.
 */
export function licensedForMeasurement(provider: ImageryProvider): boolean {
  return provider.derivativeMeasurements === "permitted";
}
