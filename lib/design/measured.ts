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
import type {
  DisclosurePolicy,
  InternalEstimate,
  Quantity,
  Selection,
} from "../pricing/types";
import type { JobType, MarketContext, TypologyConfig } from "../pricing/typology";
import { inferJobType } from "./band";
import { canRemovePlants } from "../catalog/plants";
import type { ResolvedPlantChoice, ResolvedPlantRemoval } from "./plants";
import {
  plantAssemblyCounts,
  plantRemovalCount,
  plantScopeLines,
  removalScopeLines,
} from "./plants";
import type { RegionSelection } from "./types";

/** The measured quantities for one photo region, from the drawn aerial ring. */
export type RegionMeasurement = {
  areaSf: Quantity;
  perimeterLf: Quantity;
};

/** Confidence on counts scaled from a measured area by typology density. */
const SCALED_COUNT_CONFIDENCE = 0.4;
/** Confidence on straight typology-P50 fallbacks for unmeasured regions. */
export const TYPOLOGY_CONFIDENCE = 0.3;

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
  /**
   * The engine estimate behind the band. INTERNAL — the lead snapshot
   * freezes it; API routes must project it through the disclosure policy
   * and never serialize it toward a customer.
   */
  estimate: InternalEstimate;
};

/** What the pricing engine needs for one design, measured or not. */
export type DesignEngineInput = {
  engineSelections: Selection[];
  /** Labels of the chosen options, for scope lists. */
  scope: string[];
  /** Photo region ids with a choice made. */
  selectedRegionIds: string[];
  measuredRegionIds: string[];
  unmeasuredRegionIds: string[];
};

/**
 * Turn the customer's per-region selections into engine selections, using
 * measured quantities where a region has been drawn on the aerial and
 * typology fallbacks where it hasn't. Shared by the measured band and the
 * lead snapshot (which needs an internal estimate even when nothing has
 * been measured).
 */
export function designEngineInput(
  selections: Record<string, RegionSelection>,
  measurements: Record<string, RegionMeasurement>,
  context: MarketContext,
  config: TypologyConfig,
  capturedAt: string,
  plantChoices: readonly ResolvedPlantChoice[] = [],
  removals: readonly ResolvedPlantRemoval[] = [],
): DesignEngineInput {
  const selectedRegionIds = Object.keys(selections).filter((id) =>
    hasChoice(selections[id]),
  );
  const engineSelections: Selection[] = [];
  const scope = new Set<string>();

  for (const regionId of selectedRegionIds) {
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

  // One plant swapped is one plant installed: the `install_<sku>`
  // assembly at 1 EA, which is what the seed builds for every plant in
  // the book. The quantity's provenance is the photo — the plant is there
  // because the segmentation found it standing there — and it is a count,
  // not an area, so it needs no measurement and narrows nothing.
  for (const [assemblyId, count] of plantAssemblyCounts(plantChoices)) {
    engineSelections.push({
      assemblyId,
      quantity: {
        value: count,
        unit: "EA",
        source: "photo",
        confidence: 0.9,
        capturedAt,
      },
    });
  }
  // Taking a plant out is crew time and a disposal fee, per plant, and it
  // is the same count as the plants themselves — the segmentation found
  // them standing there, and the customer said which ones go. Priced only
  // where the org's book still holds the assembly; the engine throws on
  // one it cannot find, and a contractor editing their book must not be
  // able to break an estimate somebody already has.
  for (const [assemblyId, count] of plantRemovalCount(
    removals,
    canRemovePlants(config.priceBook),
  )) {
    engineSelections.push({
      assemblyId,
      quantity: { value: count, unit: "EA", source: "photo", confidence: 0.9, capturedAt },
    });
  }
  for (const line of plantScopeLines(plantChoices)) scope.add(line);
  for (const line of removalScopeLines(removals)) scope.add(line);

  return {
    engineSelections,
    scope: [...scope],
    selectedRegionIds,
    measuredRegionIds: selectedRegionIds.filter((id) => measurements[id]),
    unmeasuredRegionIds: selectedRegionIds.filter((id) => !measurements[id]),
  };
}

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
  plantChoices: readonly ResolvedPlantChoice[] = [],
  removals: readonly ResolvedPlantRemoval[] = [],
): MeasuredDesignBand | null {
  const jobType = inferJobType(selections, plantChoices, removals);
  if (!jobType) return null;

  const input = designEngineInput(
    selections,
    measurements,
    context,
    config,
    now(),
    plantChoices,
    removals,
  );
  const { engineSelections, scope, measuredRegionIds, unmeasuredRegionIds } = input;
  if (measuredRegionIds.length === 0) return null;
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
    scope,
    measuredRegionIds,
    unmeasuredRegionIds,
    totalMeasuredAreaSf: Math.round(
      measuredRegionIds.reduce((sum, id) => sum + measurements[id].areaSf.value, 0),
    ),
    estimate,
  };
}
