/**
 * The project store contract.
 *
 * These exports are what the rest of the application is allowed to know
 * about persistence (project-map section 4: the DB lives behind lib/db and
 * nothing outside the store knows how storage works). Two backends
 * implement it — Postgres via Drizzle when DATABASE_URL is set, JSON files
 * under .data/ when it is not — and every surface above behaves the same
 * either way.
 *
 * Server-only.
 */
import type { MeasurementDelta } from "../confirm/types";
import type {
  AerialRegion,
  DesignProject,
  ProjectLocation,
  RegionSelection,
  SegmentationState,
} from "../design/types";
import type { EstimateSnapshot, LeadContact } from "../lead/types";
import type { MarketContext } from "../pricing/typology";

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
  }
}

/** Thrown when a mutation targets a submitted (locked) project. */
export class ProjectLockedError extends Error {
  constructor(id: string) {
    super(`Project ${id} has been submitted and can no longer be edited`);
    this.name = "ProjectLockedError";
  }
}

/** Thrown when a rep action targets a project that isn't at that stage. */
export class ProjectStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectStageError";
  }
}

/**
 * Thrown when a write names a region this project's segmentation does not
 * have. Regions are the unit of both selection and measurement, so a write
 * against one that does not exist has nowhere to land.
 */
export class UnknownRegionError extends Error {
  constructor(regionId: string) {
    super(`Region "${regionId}" is not part of this design`);
    this.name = "UnknownRegionError";
  }
}

export type ProjectStore = {
  createProject(
    photoBytes: Buffer,
    mediaType: string,
    ext: string,
  ): Promise<DesignProject>;
  getProject(id: string): Promise<DesignProject>;
  getProjectPhoto(id: string): Promise<{ bytes: Buffer; mediaType: string }>;
  setSegmentation(id: string, segmentation: SegmentationState): Promise<DesignProject>;
  setSelection(
    id: string,
    regionId: string,
    selection: RegionSelection,
  ): Promise<DesignProject>;
  setLocation(id: string, location: ProjectLocation): Promise<DesignProject>;
  declineAddress(id: string): Promise<DesignProject>;
  upsertAerialRegion(id: string, region: AerialRegion): Promise<DesignProject>;
  removeAerialRegion(id: string, photoRegionId: string): Promise<DesignProject>;
  setMarketContext(id: string, marketContext: MarketContext): Promise<DesignProject>;
  submitProject(
    id: string,
    contact: LeadContact,
    snapshot: EstimateSnapshot,
  ): Promise<DesignProject>;
  appendDeltas(id: string, deltas: MeasurementDelta[]): Promise<DesignProject>;
  issueFinalQuote(id: string, snapshot: EstimateSnapshot): Promise<DesignProject>;
  listProjects(): Promise<DesignProject[]>;
  listLeads(): Promise<DesignProject[]>;
  listMeasurementDeltas(): Promise<MeasurementDelta[]>;
};
