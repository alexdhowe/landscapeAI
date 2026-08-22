/**
 * The project store — the single persistence seam.
 *
 * These exports are the contract (project-map section 4). Two backends
 * implement it and the choice is made here, once, from the environment:
 *
 *   DATABASE_URL set     Postgres via Drizzle (lib/store/dbStore.ts).
 *                        Projects, regions, snapshots and the measurement
 *                        delta corpus are rows.
 *   DATABASE_URL unset   JSON under .data/ (lib/store/fileStore.ts), so a
 *                        clean checkout runs the demo with no database.
 *
 * Nothing above this module knows which one it got, and nothing above it
 * imports lib/db.
 *
 * Photo BYTES are not part of that choice: they belong to lib/storage,
 * which makes its own two-backend decision (a bucket when one is
 * configured, this deployment when not). A project carries the locator
 * lib/storage minted and nothing else.
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

import { isDatabaseConfigured } from "../db/client";
import {
  extensionFor,
  putPhoto,
  readPhotoBytes,
  type StoredPhoto,
} from "../storage";
import type { ProjectStore } from "./types";

export {
  ProjectLockedError,
  ProjectNotFoundError,
  ProjectStageError,
  UnknownRegionError,
} from "./types";
export type { ProjectStore } from "./types";

let backend: Promise<ProjectStore> | null = null;

/**
 * The backend, chosen on first use. Resolved lazily rather than at import
 * time so a test can point the environment wherever it needs to before the
 * first call; the driver modules are dynamically imported so the unused one
 * never reaches the bundle.
 */
function store(): Promise<ProjectStore> {
  backend ??= (async () => {
    if (isDatabaseConfigured()) {
      const { createDbStore } = await import("./dbStore");
      return createDbStore();
    }
    const { createFileStore } = await import("./fileStore");
    return createFileStore();
  })();
  return backend;
}

/** Drop the resolved backend. For tests that re-point the environment. */
export function resetStore(): void {
  backend = null;
}

/**
 * A new project from an uploaded photo.
 *
 * The bytes go to lib/storage first and the project records only where
 * they went — the seam is called here, once, so neither backend below has
 * an opinion about whether photos live in a bucket. If the project write
 * then fails the object is unreferenced, which is garbage; the other order
 * would give a lead a photo that 404s.
 */
export async function createProject(
  photoBytes: Buffer,
  mediaType: string,
  ext = extensionFor(mediaType),
): Promise<DesignProject> {
  const locator = await putPhoto(photoBytes, mediaType);
  return (await store()).createProject({
    fileName: `photo.${ext}`,
    mediaType,
    locator,
  });
}

export async function getProject(id: string): Promise<DesignProject> {
  return (await store()).getProject(id);
}

/** The photo's bytes, from whichever backend holds them. */
export async function getProjectPhoto(id: string): Promise<StoredPhoto> {
  const { locator, mediaType } = await (await store()).getPhotoLocator(id);
  return { bytes: await readPhotoBytes(locator), mediaType };
}

export async function setSegmentation(
  id: string,
  segmentation: SegmentationState,
): Promise<DesignProject> {
  return (await store()).setSegmentation(id, segmentation);
}

export async function setSelection(
  id: string,
  regionId: string,
  selection: RegionSelection,
): Promise<DesignProject> {
  return (await store()).setSelection(id, regionId, selection);
}

/** Sharing an address supersedes any earlier decline. */
export async function setLocation(
  id: string,
  location: ProjectLocation,
): Promise<DesignProject> {
  return (await store()).setLocation(id, location);
}

/**
 * The customer chose not to share an address. Their design and typology
 * band survive untouched — this only records the choice so the UI stops
 * asking and the lead carries the flag.
 */
export async function declineAddress(id: string): Promise<DesignProject> {
  return (await store()).declineAddress(id);
}

/** One aerial polygon per photo region: re-drawing replaces the old one. */
export async function upsertAerialRegion(
  id: string,
  region: AerialRegion,
): Promise<DesignProject> {
  return (await store()).upsertAerialRegion(id, region);
}

export async function removeAerialRegion(
  id: string,
  photoRegionId: string,
): Promise<DesignProject> {
  return (await store()).removeAerialRegion(id, photoRegionId);
}

export async function setMarketContext(
  id: string,
  marketContext: MarketContext,
): Promise<DesignProject> {
  return (await store()).setMarketContext(id, marketContext);
}

/**
 * Submit the project as a lead: freeze the snapshot, record the contact,
 * lock the design.
 */
export async function submitProject(
  id: string,
  contact: LeadContact,
  snapshot: EstimateSnapshot,
): Promise<DesignProject> {
  return (await store()).submitProject(id, contact, snapshot);
}

/**
 * Record a rep's on-site corrections. Append-only, and the design is
 * already frozen, so this cannot disturb the customer's snapshot.
 */
export async function appendDeltas(
  id: string,
  deltas: MeasurementDelta[],
): Promise<DesignProject> {
  return (await store()).appendDeltas(id, deltas);
}

/**
 * Issue the final quote: a NEW snapshot beside the customer's original,
 * which is never read, rewritten, or reordered by this call.
 */
export async function issueFinalQuote(
  id: string,
  snapshot: EstimateSnapshot,
): Promise<DesignProject> {
  return (await store()).issueFinalQuote(id, snapshot);
}

/** Every stored project, newest first. */
export async function listProjects(): Promise<DesignProject[]> {
  return (await store()).listProjects();
}

/** Submitted leads for the contractor inbox, newest submission first. */
export async function listLeads(): Promise<DesignProject[]> {
  return (await store()).listLeads();
}

/**
 * Every measurement delta across every project, oldest first — the
 * training corpus, read whole. One indexed query on Postgres.
 */
export async function listMeasurementDeltas(): Promise<MeasurementDelta[]> {
  return (await store()).listMeasurementDeltas();
}
