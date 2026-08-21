/**
 * The lifecycle gates, shared by both backends so they cannot drift.
 *
 *   playing    the customer is still configuring
 *   submitted  sent as a lead; the design is frozen alongside its snapshot
 *   confirmed  a rep has corrected quantities on site
 *   quoted     the final quote has been issued
 *
 * Everything past "playing" locks the customer-side mutators: the frozen
 * record must keep describing the design the dashboard shows.
 *
 * Server-only.
 */
import type { DesignProject } from "../design/types";

import { ProjectLockedError, ProjectStageError, UnknownRegionError } from "./types";

/** Reject anything that isn't a UUID we minted — ids reach the filesystem. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertEditable(project: DesignProject): void {
  if (project.status !== "playing") {
    throw new ProjectLockedError(project.id);
  }
}

/** A selection or a measurement has to land on a region that exists. */
export function assertRegion(project: DesignProject, regionId: string): void {
  if (
    project.segmentation.status !== "ready" ||
    !project.segmentation.regions.some((r) => r.id === regionId)
  ) {
    throw new UnknownRegionError(regionId);
  }
}

/**
 * The confirmation gate opens only after submit (there is no estimate to
 * correct before one exists) and closes once the final quote is issued (a
 * quote is final; revising one is a new revision, which the MVP does not
 * model).
 */
export function assertConfirmable(project: DesignProject): void {
  if (project.status === "playing") {
    throw new ProjectStageError(
      `Project ${project.id} has not been submitted — there is no estimate to confirm`,
    );
  }
  if (project.status === "quoted") {
    throw new ProjectStageError(
      `Project ${project.id} has already been quoted — corrections would not reach the quote`,
    );
  }
}

export function assertQuotable(project: DesignProject): void {
  if (project.status !== "confirmed") {
    throw new ProjectStageError(
      project.status === "quoted"
        ? `Project ${project.id} has already been quoted`
        : `Project ${project.id} has no confirmed quantities to quote from`,
    );
  }
}
