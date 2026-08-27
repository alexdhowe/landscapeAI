/**
 * From catalog selections to the opening budget band.
 *
 * Nothing is measured at the play stage, so the band is the Phase 1.5
 * typology band for the job type the selections imply — "projects like
 * this typically run $X–$Y". Pure functions; the typology config comes in
 * as an argument.
 */
import type {
  JobType,
  MarketContext,
  TypologyBand,
  TypologyConfig,
} from "../pricing/typology";
import { getTypologyBand } from "../pricing/typology";
import { getOption } from "../catalog/options";
import type { ResolvedAddedPlant } from "./addedPlants";
import { addedScopeLines } from "./addedPlants";
import type {
  ResolvedPlantChoice,
  ResolvedPlantMove,
  ResolvedPlantRemoval,
} from "./plants";
import { moveScopeLines, plantScopeLines, removalScopeLines } from "./plants";
import type { RegionSelection } from "./types";

/**
 * When selections imply several job types, the most specific wins: a
 * stone conversion is a distinct job even if the customer also replants;
 * a foundation refresh outranks generic bed work.
 */
const JOB_TYPE_PRIORITY: JobType[] = [
  "mulch_to_stone",
  "foundation_planting_refresh",
  "bed_renovation",
];

/** Collect the chosen option ids across all regions. */
export function chosenOptionIds(
  selections: Record<string, RegionSelection>,
): string[] {
  const ids: string[] = [];
  for (const sel of Object.values(selections)) {
    if (sel.surfaceOptionId) ids.push(sel.surfaceOptionId);
    ids.push(...sel.addonOptionIds);
  }
  return ids;
}

/**
 * The job type the current design implies, or null when nothing has been
 * selected yet (no selection → no band; the UI prompts instead).
 */
export function inferJobType(
  selections: Record<string, RegionSelection>,
  plantChoices: readonly ResolvedPlantChoice[] = [],
  removals: readonly ResolvedPlantRemoval[] = [],
  moves: readonly ResolvedPlantMove[] = [],
  added: readonly ResolvedAddedPlant[] = [],
): JobType | null {
  const jobTypes = new Set<JobType>();
  for (const id of chosenOptionIds(selections)) {
    const option = getOption(id);
    if (option) jobTypes.add(option.jobType);
  }
  // Replanting is a job type too: against the house it is a foundation
  // refresh, in a bed it is bed renovation. So a customer who swaps only
  // plants still gets a band, from the same distributions.
  for (const choice of plantChoices) jobTypes.add(choice.jobType);
  // And taking plants out is a job in its own right: a customer who only
  // clears an overgrown foundation bed has asked for a refresh and gets a
  // band for one, from the same distributions.
  for (const removal of removals) jobTypes.add(removal.jobType);
  // And rearranging what is already there is a job too: a customer who
  // only moves three shrubs has asked for real crew time.
  for (const move of moves) jobTypes.add(move.jobType);
  // And putting a plant where there was none is a job too: a customer who
  // only adds three shrubs to an empty bed has asked for real work.
  for (const plant of added) jobTypes.add(plant.jobType);
  for (const jobType of JOB_TYPE_PRIORITY) {
    if (jobTypes.has(jobType)) return jobType;
  }
  return null;
}

export type DesignBand = {
  band: TypologyBand;
  jobType: JobType;
  /** Labels of the chosen options, for the scope list under the band. */
  scope: string[];
};

/** The band for the current design, or null when nothing is selected. */
export function bandForSelections(
  selections: Record<string, RegionSelection>,
  context: MarketContext,
  config: TypologyConfig,
  plantChoices: readonly ResolvedPlantChoice[] = [],
  removals: readonly ResolvedPlantRemoval[] = [],
  moves: readonly ResolvedPlantMove[] = [],
  added: readonly ResolvedAddedPlant[] = [],
): DesignBand | null {
  const jobType = inferJobType(selections, plantChoices, removals, moves, added);
  if (!jobType) return null;
  const scope = [
    ...new Set([
      ...chosenOptionIds(selections)
        .map((id) => getOption(id)?.label)
        .filter((label): label is string => Boolean(label)),
      ...plantScopeLines(plantChoices),
      ...removalScopeLines(removals),
      ...moveScopeLines(moves),
      ...addedScopeLines(added),
    ]),
  ];
  return { band: getTypologyBand(jobType, context, config), jobType, scope };
}
