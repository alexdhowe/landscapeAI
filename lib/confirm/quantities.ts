/**
 * What each region measures right now, and where that number came from.
 *
 * The resolution order is the sensor hierarchy in reverse — the closest
 * observation wins:
 *
 *   rep_confirmed  (a person stood there with a tape)
 *   user_drawn     (a polygon over aerial imagery)
 *   typology       (a percentile of past jobs; nothing was measured)
 *
 * The rep UI needs the whole ladder — a rep correcting an unmeasured
 * region should see the typology number they are overruling, and its
 * provenance badge, rather than an empty box. The final quote needs only
 * the rungs that represent an actual observation, which is why
 * `quoteMeasurements` filters the typology ones back out: for those,
 * `designEngineInput` already applies typology fallbacks per assembly,
 * and doing it twice would silently upgrade a guess into a measurement.
 *
 * Pure — the project and typology config come in as arguments.
 */
import { inferJobType } from "../design/band";
import { TYPOLOGY_CONFIDENCE, type RegionMeasurement } from "../design/measured";
import type { DesignProject } from "../design/types";
import type { Quantity } from "../pricing/types";
import type { JobType, MarketContext, TypologyConfig } from "../pricing/typology";
import { confirmedQuantity } from "./deltas";
import type { MeasurementDelta } from "./types";

/** A region's current quantities, each carrying the provenance that produced it. */
export type RegionQuantities = {
  regionId: string;
  label: string;
  areaSf: Quantity;
  perimeterLf: Quantity;
};

function typologyQuantity(
  key: string,
  unit: "SF" | "LF",
  jobType: JobType,
  context: MarketContext,
  config: TypologyConfig,
  capturedAt: string,
): Quantity | null {
  const dist = config.distributions[jobType]?.[context]?.[key];
  if (!dist) return null;
  // The same fallback lib/design/measured.ts prices an unmeasured region
  // at: the job type's P50, honestly labeled and low-confidence.
  return {
    value: dist.p50,
    unit,
    source: "typology",
    confidence: TYPOLOGY_CONFIDENCE,
    capturedAt,
  };
}

/**
 * Current quantities for every region the customer designed, whether or
 * not it was ever measured. Regions with no selection are omitted: they
 * are not in the job, so there is nothing to confirm or price.
 */
export function currentRegionQuantities(
  project: DesignProject,
  config: TypologyConfig,
  now: () => string = () => new Date().toISOString(),
): RegionQuantities[] {
  const jobType = inferJobType(project.selections);
  if (!jobType) return [];

  const capturedAt = now();
  const deltas = project.deltas ?? [];
  const labels = new Map(
    project.segmentation.status === "ready"
      ? project.segmentation.regions.map((r) => [r.id, r.label])
      : [],
  );
  const aerialByRegion = new Map(
    (project.aerialRegions ?? []).map((r) => [r.photoRegionId, r]),
  );

  const out: RegionQuantities[] = [];
  for (const [regionId, selection] of Object.entries(project.selections)) {
    const chosen =
      Boolean(selection.surfaceOptionId) || selection.addonOptionIds.length > 0;
    if (!chosen) continue;

    const aerial = aerialByRegion.get(regionId);
    const areaSf =
      confirmedQuantity(deltas, regionId, "SF") ??
      aerial?.areaSf ??
      typologyQuantity("bed_area_sf", "SF", jobType, project.marketContext, config, capturedAt);
    const perimeterLf =
      confirmedQuantity(deltas, regionId, "LF") ??
      aerial?.perimeterLf ??
      typologyQuantity("edging_lf", "LF", jobType, project.marketContext, config, capturedAt);
    if (!areaSf || !perimeterLf) continue;

    out.push({ regionId, label: labels.get(regionId) ?? regionId, areaSf, perimeterLf });
  }
  return out;
}

/**
 * The subset of quantities the engine should price from directly: those
 * backed by an observation. A region whose area was rep-confirmed but
 * whose edge run never was still counts — the confirmed area is real, and
 * the perimeter rides along carrying its own honest provenance.
 */
export function quoteMeasurements(
  quantities: RegionQuantities[],
): Record<string, RegionMeasurement> {
  const measurements: Record<string, RegionMeasurement> = {};
  for (const q of quantities) {
    if (q.areaSf.source === "typology" && q.perimeterLf.source === "typology") continue;
    measurements[q.regionId] = { areaSf: q.areaSf, perimeterLf: q.perimeterLf };
  }
  return measurements;
}

/** Region labels keyed by id, for stamping deltas at correction time. */
export function regionLabels(project: DesignProject): Record<string, string> {
  if (project.segmentation.status !== "ready") return {};
  return Object.fromEntries(project.segmentation.regions.map((r) => [r.id, r.label]));
}

/** Every delta recorded against one project, oldest first. */
export function projectDeltas(project: DesignProject): MeasurementDelta[] {
  return project.deltas ?? [];
}
