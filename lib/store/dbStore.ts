/**
 * The Postgres-backed project store.
 *
 * Same contract as the file store (lib/store/types.ts), same gates
 * (lib/store/gates.ts) — what changes is that the corpus is a table. The
 * SQL lives in lib/db/queries.ts; this module is the lifecycle, not the
 * storage.
 *
 * Server-only.
 */
import { randomUUID } from "node:crypto";

import type { MeasurementDelta } from "../confirm/types";
import type {
  AerialRegion,
  DesignProject,
  ProjectLocation,
  RegionSelection,
  SegmentationState,
} from "../design/types";
import type { EstimateSnapshot, LeadContact } from "../lead/types";
import { resolveOrg } from "../org/resolve";
import type { MarketContext } from "../pricing/typology";

import { getDb } from "../db/client";
import * as q from "../db/queries";

import {
  UUID_RE,
  assertConfirmable,
  assertEditable,
  assertQuotable,
  assertRegion,
} from "./gates";
import {
  ProjectNotFoundError,
  type NewProjectPhoto,
  type ProjectStore,
} from "./types";

export function createDbStore(): ProjectStore {
  async function getProject(id: string): Promise<DesignProject> {
    // Ids reach a uuid column; a malformed one is a miss, not a driver error.
    if (!UUID_RE.test(id)) throw new ProjectNotFoundError(id);
    const project = await q.findProject(await getDb(), id);
    if (!project) throw new ProjectNotFoundError(id);
    return project;
  }

  /**
   * Read, gate, write, re-read. The re-read is deliberate: callers get the
   * project as the database now holds it, not a locally patched copy that
   * might differ from what the next request will see.
   */
  async function edit(
    id: string,
    write: (project: DesignProject) => Promise<void>,
  ): Promise<DesignProject> {
    const project = await getProject(id);
    assertEditable(project);
    await write(project);
    return getProject(id);
  }

  return {
    async createProject(photo: NewProjectPhoto) {
      const [db, org] = await Promise.all([getDb(), resolveOrg()]);
      const id = randomUUID();
      await q.insertProject(db, {
        id,
        orgId: org.id,
        createdAt: new Date().toISOString(),
        photo,
      });
      return getProject(id);
    },

    getProject,

    /** The row points at the bytes; lib/storage fetches them. */
    async getPhotoLocator(id: string) {
      if (!UUID_RE.test(id)) throw new ProjectNotFoundError(id);
      const photo = await q.findProjectPhoto(await getDb(), id);
      if (!photo) throw new ProjectNotFoundError(id);
      return photo;
    },

    setSegmentation(id: string, segmentation: SegmentationState) {
      // Region rows are replaced wholesale; the cascade on `selections`
      // drops choices made against regions this pass did not find.
      return edit(id, async () =>
        q.replaceSegmentation(await getDb(), id, segmentation),
      );
    },

    setSelection(id: string, regionId: string, selection: RegionSelection) {
      return edit(id, async (project) => {
        assertRegion(project, regionId);
        await q.upsertSelection(await getDb(), id, regionId, selection);
      });
    },

    /** Sharing an address supersedes any earlier decline. */
    setLocation(id: string, location: ProjectLocation) {
      return edit(id, async () => q.setProjectLocation(await getDb(), id, location));
    },

    declineAddress(id: string) {
      return edit(id, async () => q.setAddressDeclined(await getDb(), id));
    },

    /** One aerial polygon per photo region: re-drawing replaces the old one. */
    upsertAerialRegion(id: string, region: AerialRegion) {
      return edit(id, async (project) => {
        assertRegion(project, region.photoRegionId);
        await q.setRegionMeasurement(await getDb(), id, region);
      });
    },

    removeAerialRegion(id: string, photoRegionId: string) {
      return edit(id, async () =>
        q.clearRegionMeasurement(await getDb(), id, photoRegionId),
      );
    },

    setMarketContext(id: string, marketContext: MarketContext) {
      return edit(id, async () => q.setMarketContext(await getDb(), id, marketContext));
    },

    async submitProject(id: string, contact: LeadContact, snapshot: EstimateSnapshot) {
      const project = await getProject(id);
      assertEditable(project);
      await q.insertSubmission(await getDb(), id, contact, snapshot);
      return getProject(id);
    },

    async appendDeltas(id: string, deltas: MeasurementDelta[]) {
      const project = await getProject(id);
      assertConfirmable(project);
      await q.insertDeltas(await getDb(), id, deltas);
      return getProject(id);
    },

    async issueFinalQuote(id: string, snapshot: EstimateSnapshot) {
      const project = await getProject(id);
      assertQuotable(project);
      await q.insertFinalQuote(await getDb(), id, snapshot);
      return getProject(id);
    },

    async listProjects() {
      return q.listProjectRows(await getDb());
    },

    async listLeads() {
      return q.listLeadRows(await getDb());
    },

    /**
     * The training corpus, whole. One indexed scan of measurement_deltas —
     * the query the file store had to fan out across every project on disk
     * to answer.
     */
    async listMeasurementDeltas() {
      return q.listDeltas(await getDb());
    },
  };
}
