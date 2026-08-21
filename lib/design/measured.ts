/**
 * From measured quantities to the narrowed band.
 *
 * Once the customer has drawn their regions on the aerial, pricing stops
 * being typology percentiles and becomes the Phase 1 engine run on real
 * quantities, projected through the contractor's disclosure policy. The
 * result is a visibly narrower band than the typology P25–P75 spread.
 *
 * Pure functions — the price book, typology config, and disclosure policy
 * come in as arguments; nothing here does I/O.
 */
import { getOption } from "../catalog/options";
import { applyDisclosure } from "../pricing/disclosure";
import { buildEstimate } from "../pricing/engine";
import type { DisclosurePolicy, Quantity, Selection } from "../pricing/types";
import type { JobType, MarketContext, TypologyConfig } from "../pricing/typology";
import { inferJobType } from "./band";
import type { RegionSelection } from "./types";

/** The measured quantities for one photo region, from the drawn aerial ring. */
export type RegionMeasurement = {
  areaSf: Quantity;
  perimeterLf: Quantity;
};

/** Confidence on counts scaled from a measured area by typology density. */
const SCALED_COUNT_CONFIDENCE = 0.4;
/** Confidence on straight typology-P50 fallbacks for unmeasured regions. */
const TYPOLOGY_CONFIDENCE = 0.3;

function hasChoice(selection: RegionSelection): boolean {
  return Boolean(selection.surfaceOptionId) || selection.addonOptionIds.length > 0;
}

/**
 * The quantity to price one assembly at, for a region that may or may not
 * be measured:
 *
 * - SF assemblies take the measured area; LF assemblies (edging) take the
 *   measured perimeter. Both keep their drawn provenance untouched.
 * - EA assemblies (plants, removals) cannot be counted from an aerial, so
 *   the count is the job type's typology density (P50 count per P50 bed
 *   area) applied to the measured area — honestly labeled 'typology' with
 *   reduced confidence, because the count itself was never measured.
 * - Unmeasured regions fall back to straight typology P50s so a partly
 *   measured design still prices as one coherent whole.
 *
 * Returns null when the assembly is unknown to the price book.
 */
export function assemblyQuantityForRegion(
  assemblyId: string,
  jobType: JobType,
  measurement: RegionMeasurement | undefined,
  context: MarketContext,
  config: TypologyConfig,
  capturedAt: string,
): Quantity | null {
  const assembly = config.priceBook.assemblies.find((a) => a.id === assemblyId);
  if (!assembly) return null;
  const dists = config.distributions[jobType]?.[context];

  const typologyP50 = (key: string, unit: Quantity["unit"]): Quantity | null => {
    const dist = dists?.[key];
    if (!dist) return null;
    return {
      value: dist.p50,
      unit,
      source: "typology",
      confidence: TYPOLOGY_CONFIDENCE,
      capturedAt,
    };
  };

  switch (assembly.unit) {
    case "SF":
      return measurement ? { ...measurement.areaSf } : typologyP50("bed_area_sf", "SF");
    case "LF":
      return measurement ? { ...measurement.perimeterLf } : typologyP50("edging_lf", "LF");
    case "EA": {
      const key = config.recipes[jobType]?.find(
        (line) => line.assemblyId === assemblyId,
      )?.distributionKey;
      const dist = key ? dists?.[key] : undefined;
      if (!dist) {
        // Not part of any recipe (e.g. accent boulders): a fixed unit each.
        return {
          value: 1,
          unit: "EA",
          source: "typology",
          confidence: SCALED_COUNT_CONFIDENCE,
          capturedAt,
        };
      }
      const areaDist = dists?.bed_area_sf;
      if (measurement && areaDist && areaDist.p50 > 0) {
        const count = Math.max(
          1,
          Math.round((dist.p50 / areaDist.p50) * measurement.areaSf.value),
        );
        return {
          value: count,
          unit: "EA",
          source: "typology",
          confidence: SCALED_COUNT_CONFIDENCE,
          capturedAt,
        };
      }
      return typologyP50(key!, "EA");
    }
    case "CY":
      // No CY-driven assemblies exist in the seed book; nothing to price.
      return null;
  }
}

export type MeasuredDesignBand = {
  basis: "measured";
  currency: "USD";
  low: number;
  high: number;
  jobType: JobType;
  scope: string[];
  /** Photo region ids that are selected AND measured. */
  measuredRegionIds: string[];
  /** Photo region ids that are selected but not yet drawn on the aerial. */
  unmeasuredRegionIds: string[];
  /** Sum of measured areas across selected regions, whole SF. */
  totalMeasuredAreaSf: number;
};

/**
 * The measured band for the current design, or null when it does not apply
 * yet — nothing selected, or no selected region has been measured (the
 * caller shows the typology band instead).
 */
export function measuredBandForSelections(
  selections: Record<string, RegionSelection>,
  measurements: Record<string, RegionMeasurement>,
  context: MarketContext,
  config: TypologyConfig,
  policy: DisclosurePolicy,
  now: () => string = () => new Date().toISOString(),
): MeasuredDesignBand | null {
  const jobType = inferJobType(selections);
  if (!jobType) return null;

  const selectedIds = Object.keys(selections).filter((id) => hasChoice(selections[id]));
  const measuredRegionIds = selectedIds.filter((id) => measurements[id]);
  if (measuredRegionIds.length === 0) return null;
  const unmeasuredRegionIds = selectedIds.filter((id) => !measurements[id]);

  const capturedAt = now();
  const engineSelections: Selection[] = [];
  const scope = new Set<string>();

  for (const regionId of selectedIds) {
    const selection = selections[regionId];
    const optionIds = [
      ...(selection.surfaceOptionId ? [selection.surfaceOptionId] : []),
      ...selection.addonOptionIds,
    ];
    // Options on one region can share assemblies (e.g. a mulch surface and
    // a renovation preset both mulch the bed) — price each assembly once.
    const seenAssemblies = new Set<string>();
    for (const optionId of optionIds) {
      const option = getOption(optionId);
      if (!option) continue;
      scope.add(option.label);
      for (const assemblyId of option.assemblyIds) {
        if (seenAssemblies.has(assemblyId)) continue;
        seenAssemblies.add(assemblyId);
        const quantity = assemblyQuantityForRegion(
          assemblyId,
          option.jobType,
          measurements[regionId],
          context,
          config,
          capturedAt,
        );
        if (quantity) engineSelections.push({ assemblyId, quantity });
      }
    }
  }
  if (engineSelections.length === 0) return null;

  const estimate = buildEstimate(engineSelections, config.priceBook, config.margin);
  const payload = applyDisclosure(estimate, policy);
  if (payload.mode !== "band") {
    throw new Error("The measured band requires a band-mode disclosure policy");
  }

  return {
    basis: "measured",
    currency: "USD",
    low: payload.low,
    high: payload.high,
    jobType,
    scope: [...scope],
    measuredRegionIds,
    unmeasuredRegionIds,
    totalMeasuredAreaSf: Math.round(
      measuredRegionIds.reduce((sum, id) => sum + measurements[id].areaSf.value, 0),
    ),
  };
}
