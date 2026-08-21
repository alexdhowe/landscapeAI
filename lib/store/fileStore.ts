/**
 * The file-backed project store: JSON + photo bytes under .data/
 * (gitignored).
 *
 * This is the fallback, not the legacy. With no DATABASE_URL set the demo
 * runs on a clean checkout with nothing to install and nothing to
 * provision — `npm run dev`, upload a photo, play. It implements exactly
 * the same contract as the Postgres backend (lib/store/types.ts), and the
 * acceptance suite runs against both.
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
  SegmentationState,
} from "../design/types";
import type { EstimateSnapshot, LeadContact } from "../lead/types";
import type { MarketContext } from "../pricing/typology";

import {
  UUID_RE,
  assertConfirmable,
  assertEditable,
  assertQuotable,
  assertRegion,
} from "./gates";
import { ProjectNotFoundError, type ProjectStore } from "./types";

/** Overridable so tests can point the store at a throwaway directory. */
function dataDir(): string {
  return process.env.PROJECTS_DATA_DIR ?? path.join(process.cwd(), ".data", "projects");
}

export function createFileStore(): ProjectStore {
  const DATA_DIR = dataDir();
  const projectDir = (id: string) => path.join(DATA_DIR, id);
  const projectFile = (id: string) => path.join(projectDir(id), "project.json");

  function assertValidId(id: string): void {
    if (!UUID_RE.test(id)) throw new ProjectNotFoundError(id);
  }

  async function getProject(id: string): Promise<DesignProject> {
    assertValidId(id);
    let raw: string;
    try {
      raw = await fs.readFile(projectFile(id), "utf8");
    } catch {
      throw new ProjectNotFoundError(id);
    }
    return JSON.parse(raw) as DesignProject;
  }

  async function writeProject(project: DesignProject): Promise<void> {
    await fs.writeFile(projectFile(project.id), JSON.stringify(project, null, 2));
  }

  /** Read, gate, mutate, write — every mutator below is this shape. */
  async function edit(
    id: string,
    mutate: (project: DesignProject) => void,
  ): Promise<DesignProject> {
    const project = await getProject(id);
    assertEditable(project);
    mutate(project);
    await writeProject(project);
    return project;
  }

  async function listProjects(): Promise<DesignProject[]> {
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

  return {
    async createProject(photoBytes: Buffer, mediaType: string, ext: string) {
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
    },

    getProject,

    async getProjectPhoto(id: string) {
      const project = await getProject(id);
      const bytes = await fs.readFile(path.join(projectDir(id), project.photo.fileName));
      return { bytes, mediaType: project.photo.mediaType };
    },

    setSegmentation(id: string, segmentation: SegmentationState) {
      return edit(id, (project) => {
        project.segmentation = segmentation;
        // A new pass is a new answer: choices made against regions it did
        // not find have nowhere to live.
        const kept =
          segmentation.status === "ready"
            ? new Set(segmentation.regions.map((r) => r.id))
            : new Set<string>();
        for (const regionId of Object.keys(project.selections)) {
          if (!kept.has(regionId)) delete project.selections[regionId];
        }
        project.aerialRegions = (project.aerialRegions ?? []).filter((r) =>
          kept.has(r.photoRegionId),
        );
        if (project.aerialRegions.length === 0) delete project.aerialRegions;
      });
    },

    setSelection(id: string, regionId: string, selection: RegionSelection) {
      return edit(id, (project) => {
        assertRegion(project, regionId);
        project.selections[regionId] = selection;
      });
    },

    /** Sharing an address supersedes any earlier decline. */
    setLocation(id: string, location: ProjectLocation) {
      return edit(id, (project) => {
        project.location = location;
        delete project.addressDeclined;
      });
    },

    /**
     * The customer chose not to share an address. Their design and typology
     * band survive untouched — this only records the choice so the UI stops
     * asking and the lead carries the flag.
     */
    declineAddress(id: string) {
      return edit(id, (project) => {
        project.addressDeclined = true;
      });
    },

    /** One aerial polygon per photo region: re-drawing replaces the old one. */
    upsertAerialRegion(id: string, region: AerialRegion) {
      return edit(id, (project) => {
        assertRegion(project, region.photoRegionId);
        const others = (project.aerialRegions ?? []).filter(
          (r) => r.photoRegionId !== region.photoRegionId,
        );
        project.aerialRegions = [...others, region];
      });
    },

    removeAerialRegion(id: string, photoRegionId: string) {
      return edit(id, (project) => {
        project.aerialRegions = (project.aerialRegions ?? []).filter(
          (r) => r.photoRegionId !== photoRegionId,
        );
      });
    },

    setMarketContext(id: string, marketContext: MarketContext) {
      return edit(id, (project) => {
        project.marketContext = marketContext;
      });
    },

    /**
     * Submit the project as a lead. Appends the frozen snapshot, records the
     * contact, and flips the status to "submitted", which locks every
     * mutator above. Snapshots are append-only: nothing here ever modifies
     * one after this write.
     */
    submitProject(id: string, contact: LeadContact, snapshot: EstimateSnapshot) {
      return edit(id, (project) => {
        project.status = "submitted";
        project.contact = contact;
        project.submittedAt = snapshot.issuedAt;
        project.snapshots = [...(project.snapshots ?? []), snapshot];
      });
    },

    /**
     * Record a rep's on-site corrections. Append-only, and the project's
     * design is already frozen, so this cannot disturb the customer's
     * snapshot: it adds deltas and nothing else.
     */
    async appendDeltas(id: string, deltas: MeasurementDelta[]) {
      const project = await getProject(id);
      assertConfirmable(project);
      project.deltas = [...(project.deltas ?? []), ...deltas];
      project.status = "confirmed";
      await writeProject(project);
      return project;
    },

    /**
     * Issue the final quote. Appends the rep-confirmed snapshot beside the
     * customer's original. The snapshots list is append-only here as
     * everywhere: the customer's frozen bytes are never read, rewritten, or
     * reordered by this call.
     */
    async issueFinalQuote(id: string, snapshot: EstimateSnapshot) {
      const project = await getProject(id);
      assertQuotable(project);
      project.status = "quoted";
      project.quotedAt = snapshot.issuedAt;
      project.snapshots = [...(project.snapshots ?? []), snapshot];
      await writeProject(project);
      return project;
    },

    listProjects,

    /**
     * Submitted leads for the contractor inbox, newest submission first —
     * including the ones a rep has since confirmed or quoted. They are the
     * same lead at a later stage, and dropping them would hide the work in
     * progress.
     */
    async listLeads() {
      const projects = await listProjects();
      return projects
        .filter((p) => p.status !== "playing")
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
    },

    /**
     * Every measurement delta across every project, oldest first.
     *
     * This is the fan-out the Postgres backend replaces with a single
     * indexed scan of measurement_deltas. On the file store there is no
     * index to have: the corpus lives inside the project documents, so
     * reading it whole means reading them all.
     */
    async listMeasurementDeltas() {
      const projects = await listProjects();
      return projects
        .flatMap((p) => p.deltas ?? [])
        .sort((a, b) => a.correctedAt.localeCompare(b.correctedAt));
    },
  };
}
