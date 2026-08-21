/**
 * File-backed project store — the single persistence seam. Projects (and,
 * since Phase 5, their lead contacts and immutable estimate snapshots) live
 * as JSON + photo bytes under .data/ (gitignored). No DATABASE_URL is
 * configured yet; when Postgres arrives, this module's exports are the
 * contract to reimplement over the Drizzle schema in lib/db — nothing else
 * in the app knows how storage works.
 *
 * Server-only.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { MeasurementDelta } from "../confirm/types";
import type {
  AerialRegion,
  DesignProject,
  ProjectLocation,
  RegionSelection,
} from "../design/types";
import type { EstimateSnapshot, LeadContact } from "../lead/types";
import type { MarketContext } from "../pricing/typology";
import type { SegmentationState } from "../design/types";

/** Overridable so tests can point the store at a throwaway directory. */
const DATA_DIR =
  process.env.PROJECTS_DATA_DIR ?? path.join(process.cwd(), ".data", "projects");

const projectDir = (id: string) => path.join(DATA_DIR, id);
const projectFile = (id: string) => path.join(projectDir(id), "project.json");

/** Reject anything that isn't a UUID we minted — ids reach the filesystem. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new ProjectNotFoundError(id);
  }
}

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
 * Once submitted, the design is frozen alongside its snapshot — every
 * mutator goes through this gate so the dashboard always describes the
 * design the customer actually submitted.
 */
function assertEditable(project: DesignProject): void {
  if (project.status !== "playing") {
    throw new ProjectLockedError(project.id);
  }
}

export async function createProject(
  photoBytes: Buffer,
  mediaType: string,
  ext: string,
): Promise<DesignProject> {
  const id = randomUUID();
  const project: DesignProject = {
    id,
    createdAt: new Date().toISOString(),
    status: "playing",
    photo: { fileName: `photo.${ext}`, mediaType },
    segmentation: { status: "pending" },
    selections: {},
    marketContext: "residential",
  };
  await fs.mkdir(projectDir(id), { recursive: true });
  await fs.writeFile(path.join(projectDir(id), project.photo.fileName), photoBytes);
  await writeProject(project);
  return project;
}

export async function getProject(id: string): Promise<DesignProject> {
  assertValidId(id);
  let raw: string;
  try {
    raw = await fs.readFile(projectFile(id), "utf8");
  } catch {
    throw new ProjectNotFoundError(id);
  }
  return JSON.parse(raw) as DesignProject;
}

export async function getProjectPhoto(
  id: string,
): Promise<{ bytes: Buffer; mediaType: string }> {
  const project = await getProject(id);
  const bytes = await fs.readFile(path.join(projectDir(id), project.photo.fileName));
  return { bytes, mediaType: project.photo.mediaType };
}

async function writeProject(project: DesignProject): Promise<void> {
  await fs.writeFile(projectFile(project.id), JSON.stringify(project, null, 2));
}

export async function setSegmentation(
  id: string,
  segmentation: SegmentationState,
): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  project.segmentation = segmentation;
  await writeProject(project);
  return project;
}

export async function setSelection(
  id: string,
  regionId: string,
  selection: RegionSelection,
): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  project.selections[regionId] = selection;
  await writeProject(project);
  return project;
}

/** Sharing an address supersedes any earlier decline. */
export async function setLocation(
  id: string,
  location: ProjectLocation,
): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  project.location = location;
  delete project.addressDeclined;
  await writeProject(project);
  return project;
}

/**
 * The customer chose not to share an address. Their design and typology
 * band survive untouched — this only records the choice so the UI stops
 * asking and the lead (Phase 5) carries the flag.
 */
export async function declineAddress(id: string): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  project.addressDeclined = true;
  await writeProject(project);
  return project;
}

/** One aerial polygon per photo region: re-drawing replaces the old one. */
export async function upsertAerialRegion(
  id: string,
  region: AerialRegion,
): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  const regions = (project.aerialRegions ?? []).filter(
    (r) => r.photoRegionId !== region.photoRegionId,
  );
  regions.push(region);
  project.aerialRegions = regions;
  await writeProject(project);
  return project;
}

export async function removeAerialRegion(
  id: string,
  photoRegionId: string,
): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  project.aerialRegions = (project.aerialRegions ?? []).filter(
    (r) => r.photoRegionId !== photoRegionId,
  );
  await writeProject(project);
  return project;
}

export async function setMarketContext(
  id: string,
  marketContext: MarketContext,
): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  project.marketContext = marketContext;
  await writeProject(project);
  return project;
}

/**
 * Phase 5 — submit the project as a lead. Appends the frozen snapshot,
 * records the contact, and flips the status to "submitted", which locks
 * every mutator above. Snapshots are append-only: no function in this
 * module ever modifies one after this write.
 */
export async function submitProject(
  id: string,
  contact: LeadContact,
  snapshot: EstimateSnapshot,
): Promise<DesignProject> {
  const project = await getProject(id);
  assertEditable(project);
  project.status = "submitted";
  project.contact = contact;
  project.submittedAt = snapshot.issuedAt;
  project.snapshots = [...(project.snapshots ?? []), snapshot];
  await writeProject(project);
  return project;
}

/**
 * Phase 6 — record a rep's on-site corrections.
 *
 * Append-only, and the project's design is already frozen, so this cannot
 * disturb the customer's snapshot: it adds deltas and nothing else. The
 * gate opens only after submit (there is no estimate to correct before
 * one exists) and closes once the final quote is issued (a quote is
 * final; revising one is a new revision, which the MVP does not model).
 */
export async function appendDeltas(
  id: string,
  deltas: MeasurementDelta[],
): Promise<DesignProject> {
  const project = await getProject(id);
  if (project.status === "playing") {
    throw new ProjectStageError(
      `Project ${id} has not been submitted — there is no estimate to confirm`,
    );
  }
  if (project.status === "quoted") {
    throw new ProjectStageError(
      `Project ${id} has already been quoted — corrections would not reach the quote`,
    );
  }
  project.deltas = [...(project.deltas ?? []), ...deltas];
  project.status = "confirmed";
  await writeProject(project);
  return project;
}

/**
 * Phase 6 — issue the final quote.
 *
 * Appends the rep-confirmed snapshot beside the customer's original. The
 * snapshots list is append-only here as everywhere: the customer's frozen
 * bytes are never read, rewritten, or reordered by this call.
 */
export async function issueFinalQuote(
  id: string,
  snapshot: EstimateSnapshot,
): Promise<DesignProject> {
  const project = await getProject(id);
  if (project.status !== "confirmed") {
    throw new ProjectStageError(
      project.status === "quoted"
        ? `Project ${id} has already been quoted`
        : `Project ${id} has no confirmed quantities to quote from`,
    );
  }
  project.status = "quoted";
  project.quotedAt = snapshot.issuedAt;
  project.snapshots = [...(project.snapshots ?? []), snapshot];
  await writeProject(project);
  return project;
}

/** Every stored project, newest first. Unreadable entries are skipped. */
export async function listProjects(): Promise<DesignProject[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const projects: DesignProject[] = [];
  for (const id of entries) {
    if (!UUID_RE.test(id)) continue;
    try {
      projects.push(await getProject(id));
    } catch {
      // A partially written or foreign directory must not take down the inbox.
    }
  }
  return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Submitted leads for the contractor inbox, newest submission first —
 * including the ones a rep has since confirmed or quoted. They are the
 * same lead at a later stage, and dropping them from the inbox would hide
 * the work in progress.
 */
export async function listLeads(): Promise<DesignProject[]> {
  const projects = await listProjects();
  return projects
    .filter((p) => p.status !== "playing")
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
}

/**
 * Every measurement delta across every project, oldest first — the
 * training corpus, read whole.
 *
 * Fanning across project files is exactly the kind of query Postgres
 * exists for; when the DB lands, this becomes one indexed SELECT on
 * measurement_deltas and nothing above it changes.
 */
export async function listMeasurementDeltas(): Promise<MeasurementDelta[]> {
  const projects = await listProjects();
  return projects
    .flatMap((p) => p.deltas ?? [])
    .sort((a, b) => a.correctedAt.localeCompare(b.correctedAt));
}
