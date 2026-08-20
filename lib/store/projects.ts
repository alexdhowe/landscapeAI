/**
 * File-backed project store for the play stage. Postgres arrives with the
 * lead-capture phase; until then projects live as JSON + photo bytes under
 * .data/ (gitignored). This module is the only place that knows that, so
 * swapping in Drizzle later touches nothing else.
 *
 * Server-only.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { DesignProject, RegionSelection } from "../design/types";
import type { MarketContext } from "../pricing/typology";
import type { SegmentationState } from "../design/types";

const DATA_DIR = path.join(process.cwd(), ".data", "projects");

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
  project.selections[regionId] = selection;
  await writeProject(project);
  return project;
}

export async function setMarketContext(
  id: string,
  marketContext: MarketContext,
): Promise<DesignProject> {
  const project = await getProject(id);
  project.marketContext = marketContext;
  await writeProject(project);
  return project;
}
