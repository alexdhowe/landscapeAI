/**
 * The file-backed project store: JSON under .data/ (gitignored).
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
  AddedPlant,
  AerialRegion,
  DesignProject,
  ProjectLocation,
  RegionSelection,
  SegmentationState,
} from "../design/types";
import type { EstimateSnapshot, LeadContact } from "../lead/types";
import type { MarketContext } from "../pricing/typology";
import { legacyFileLocator } from "../storage";

import {
  UUID_RE,
  assertConfirmable,
  assertEditable,
  assertQuotable,
  assertPlanting,
  assertRegion,
} from "./gates";
import type { NormalizedPoint } from "../vision/types";
import {
  ProjectNotFoundError,
  type NewProjectPhoto,
  type ProjectStore,
} from "./types";

/** Overridable so tests can point the store at a throwaway directory. */
function dataDir(): string {
  return process.env.PROJECTS_DATA_DIR ?? path.join(process.cwd(), ".data", "projects");
}

export function createFileStore(): ProjectStore {
  const DATA_DIR = dataDir();
  const projectDir = (id: string) => path.join(DATA_DIR, id);
  const projectFile = (id: string) => path.join(projectDir(id), "project.json");
  /**
   * The photo's storage locator, beside the project rather than inside it.
   * project.json IS the DesignProject the customer's browser is served, and
   * where a photo's bytes live is not the browser's business — the database
   * backend keeps the same value in a column nobody renders.
   */
  const photoFile = (id: string) => path.join(projectDir(id), "photo.json");

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
    async createProject(photo: NewProjectPhoto) {
      const id = randomUUID();
      const project: DesignProject = {
        id,
        createdAt: new Date().toISOString(),
        status: "playing",
        photo: { fileName: photo.fileName, mediaType: photo.mediaType },
        segmentation: { status: "pending" },
        selections: {},
        marketContext: "residential",
      };
      await fs.mkdir(projectDir(id), { recursive: true });
      await fs.writeFile(photoFile(id), JSON.stringify({ locator: photo.locator }));
      await writeProject(project);
      return project;
    },

    getProject,

    /**
     * A project written before the storage seam existed has no photo.json:
     * its bytes are the file sitting next to project.json, which is exactly
     * what a legacy inline locator addresses. The database got a migration
     * for the same problem (0004); .data/ has no migration runner, so its
     * old projects are addressed where they already are.
     */
    async getPhotoLocator(id: string) {
      const project = await getProject(id);
      let locator: string;
      try {
        locator = (JSON.parse(await fs.readFile(photoFile(id), "utf8")) as {
          locator: string;
        }).locator;
      } catch {
        locator = legacyFileLocator(id, project.photo.fileName);
      }
      return { locator, mediaType: project.photo.mediaType };
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

    setRegionOutline(id: string, regionId: string, polygon: NormalizedPoint[] | null) {
      return edit(id, (project) => {
        assertRegion(project, regionId);
        const outlines = { ...(project.regionOutlines ?? {}) };
        if (polygon === null) delete outlines[regionId];
        else outlines[regionId] = polygon;
        // Absent rather than empty, so an untouched design round-trips
        // identically to one from before outlines were adjustable.
        if (Object.keys(outlines).length === 0) delete project.regionOutlines;
        else project.regionOutlines = outlines;
      });
    },

    setPlantSelection(id: string, plantingId: string, optionId: string | null) {
      return edit(id, (project) => {
        assertPlanting(project, plantingId);
        const chosen = { ...(project.plantSelections ?? {}) };
        if (optionId === null) delete chosen[plantingId];
        else chosen[plantingId] = optionId;
        // Absent rather than empty, so a project nobody has replanted
        // round-trips identically to one created before plants were
        // swappable — the store test compares the whole object.
        if (Object.keys(chosen).length === 0) delete project.plantSelections;
        else project.plantSelections = chosen;
        // Either way this un-clears the plant. Choosing a replacement and
        // taking it out are one slot — a plant cannot be both — and
        // passing null means "leave what is growing there", which is the
        // opposite of taking it out.
        if (project.clearedPlantings?.includes(plantingId)) {
          const kept = project.clearedPlantings.filter((id) => id !== plantingId);
          if (kept.length === 0) delete project.clearedPlantings;
          else project.clearedPlantings = kept;
        }
      });
    },

    setPlantPosition(id: string, plantingId: string, point: NormalizedPoint | null) {
      return edit(id, (project) => {
        assertPlanting(project, plantingId);
        const moved = { ...(project.plantPositions ?? {}) };
        if (point === null) delete moved[plantingId];
        else moved[plantingId] = point;
        // Absent rather than empty, so a design nobody has rearranged
        // round-trips identically to one from before plants could move.
        if (Object.keys(moved).length === 0) delete project.plantPositions;
        else project.plantPositions = moved;
      });
    },

    addPlant(id: string, plant: AddedPlant) {
      return edit(id, (project) => {
        project.addedPlants = [...(project.addedPlants ?? []), plant];
      });
    },

    setAddedPlant(id: string, addedPlantId: string, point: NormalizedPoint | null) {
      return edit(id, (project) => {
        const kept = (project.addedPlants ?? []).flatMap((plant) =>
          plant.id !== addedPlantId
            ? [plant]
            : point === null
              ? []
              : [{ ...plant, at: point }],
        );
        // Absent rather than empty, so a design nobody has planted into
        // round-trips identically to one from before plants could be added.
        if (kept.length === 0) delete project.addedPlants;
        else project.addedPlants = kept;
      });
    },

    setPlantingsCleared(id: string, plantingIds: readonly string[], cleared: boolean) {
      return edit(id, (project) => {
        for (const plantingId of plantingIds) assertPlanting(project, plantingId);
        const next = new Set(project.clearedPlantings ?? []);
        for (const plantingId of plantingIds) {
          if (cleared) next.add(plantingId);
          else next.delete(plantingId);
        }
        // Taking a plant out drops whatever was going to replace it.
        if (cleared && project.plantSelections) {
          const chosen = { ...project.plantSelections };
          for (const plantingId of plantingIds) delete chosen[plantingId];
          if (Object.keys(chosen).length === 0) delete project.plantSelections;
          else project.plantSelections = chosen;
        }
        // A plant that is gone has nowhere to be.
        if (cleared && project.plantPositions) {
          const moved = { ...project.plantPositions };
          for (const plantingId of plantingIds) delete moved[plantingId];
          if (Object.keys(moved).length === 0) delete project.plantPositions;
          else project.plantPositions = moved;
        }
        // Absent rather than empty, so a project nobody has cleared
        // round-trips identically to one from before this existed.
        if (next.size === 0) delete project.clearedPlantings;
        else project.clearedPlantings = [...next];
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
