/**
 * The database leg of the acceptance paths.
 *
 * Everything phases 5 and 6 proved against the file store, proved again
 * with Postgres underneath — through the same route handlers, against the
 * same store contract:
 *
 *   - submit a lead and read the customer's frozen bytes back out of the
 *     database BYTE-IDENTICAL. This is the invariant the schema's TEXT
 *     column exists for: a JSONB round trip would re-serialize the payload
 *     and "estimates are immutable snapshots" would be dead.
 *   - correct a bed 400 → 470 SF, issue the final quote, and confirm the
 *     customer's original still says 400.
 *   - run section 6's corpus query as ONE SQL statement and get the same
 *     mean and P90 by job type that /deltas renders from the in-memory
 *     analytics.
 *
 * With DATABASE_URL set this runs against that server (in the disposable
 * schema vitest.globalSetup.ts creates). Without one it runs against
 * PGlite in-process, so `npm test` needs no server.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL) process.env.PGLITE_DATA_DIR = "memory://";
// The store picks its backend from the environment on first use — make
// sure a stray temp dir from another suite cannot claim this one.
delete process.env.PROJECTS_DATA_DIR;

const store = await import("../../store/projects");
const { getDb, isDatabaseConfigured } = await import("../client");
const { deltaErrorStatsByJobType, loadOrganization } = await import("../queries");
const { SEED_ORG_SLUG } = await import("../seed");
const { resolveOrg, resetOrgCache } = await import("../../org/resolve");
const { demoSegmentation } = await import("../../vision/demo");
const { contractorHeaders } = await import("../../auth/__tests__/helpers");
const { analyzeDeltas } = await import("../../confirm/analytics");
const { errorPct } = await import("../../confirm/deltas");
const { submittedSnapshot, finalQuoteSnapshot, INTERNAL_ONLY_MARKERS } = await import(
  "../../lead/snapshot"
);
const { isFinalQuotePayload } = await import("../../design/quote");
const { wiPriceBook, wiMarginConfig, wiBandPolicy, wiFinalQuotePolicy } = await import(
  "../../../seed/pricebook.seed"
);
const { startFakeBucket, useBucket } = await import(
  "../../storage/__tests__/fakeBucket"
);
const storage = await import("../../storage");
const { photoObjects, photos } = await import("../schema");
const { GET: photoGET } = await import(
  "../../../app/api/projects/[projectId]/photo/route"
);
const { POST: submitPOST } = await import(
  "../../../app/api/projects/[projectId]/submit/route"
);
const { GET: snapshotGET } = await import(
  "../../../app/api/projects/[projectId]/snapshot/route"
);
const { POST: confirmPOST } = await import(
  "../../../app/api/projects/[projectId]/confirm/route"
);
const { POST: quotePOST, GET: quoteGET } = await import(
  "../../../app/api/projects/[projectId]/quote/route"
);

afterAll(() => {
  // Leave the environment as it was found: another suite in this worker
  // must not inherit this file's database.
  delete process.env.PGLITE_DATA_DIR;
  store.resetStore();
  storage.resetPhotoStorage();
  resetOrgCache();
});

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** Confirming and quoting are contractor actions — the rep is signed in. */
const repRequest = async (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: await contractorHeaders({ name: "Sam Rep" }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const CONTACT = { name: "Dana Homeowner", email: "dana@example.com" };

const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** A submitted lead whose bed was measured at `areaSf` on the aerial. */
async function submittedLead(areaSf = 400, perimeterLf = 80) {
  const project = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
  await store.setSegmentation(project.id, { status: "ready", ...demoSegmentation() });
  await store.setSelection(project.id, "demo_bed", {
    surfaceOptionId: "surface_stone_river_rock",
    addonOptionIds: [],
  });
  const capturedAt = new Date().toISOString();
  await store.upsertAerialRegion(project.id, {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    photoRegionId: "demo_bed",
    ring: [
      [-89.4, 43.07],
      [-89.3999, 43.07],
      [-89.3999, 43.0701],
      [-89.4, 43.0701],
    ],
    areaSf: { value: areaSf, unit: "SF", source: "user_drawn", confidence: 0.85, capturedAt },
    perimeterLf: {
      value: perimeterLf,
      unit: "LF",
      source: "user_drawn",
      confidence: 0.85,
      capturedAt,
    },
  });
  const res = await submitPOST(
    jsonRequest(`/api/projects/${project.id}/submit`, "POST", { contact: CONTACT }),
    params(project.id),
  );
  expect(res.status).toBe(201);
  return { projectId: project.id, customerSawBytes: await res.text() };
}

const confirm = async (projectId: string, value: number, unit: "SF" | "LF" = "SF") =>
  confirmPOST(
    await repRequest(`/api/projects/${projectId}/confirm`, "POST", {
      corrections: [{ photoRegionId: "demo_bed", unit, value }],
    }),
    params(projectId),
  );

describe("the store, over Drizzle", () => {
  it("is actually using the database backend", () => {
    expect(isDatabaseConfigured()).toBe(true);
  });

  it("resolves the org from its own rows, not from the seed import", async () => {
    const org = await resolveOrg();
    expect(org.slug).toBe(SEED_ORG_SLUG);
    // The rows ARE the seed file's contents — that is what seeding means.
    // If these drift, a route is pricing off something the contractor
    // never entered. Compared by id: rows come back in key order, and the
    // engine resolves components by id, never by position.
    const byId = <T extends { id: string }>(items: T[]) =>
      [...items].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(org.priceBook.costItems)).toEqual(byId(wiPriceBook.costItems));
    expect(byId(org.priceBook.assemblies)).toEqual(byId(wiPriceBook.assemblies));
    expect(org.margin).toEqual(wiMarginConfig);
    expect(org.bandPolicy).toEqual(wiBandPolicy);
    expect(org.finalQuotePolicy).toEqual(wiFinalQuotePolicy);
    // Plant metadata survives the round trip; the time slider needs it.
    const hydrangea = await loadOrganization(await getDb(), SEED_ORG_SLUG);
    expect(hydrangea.typology.recipes.mulch_to_stone.length).toBeGreaterThan(0);
    expect(
      hydrangea.typology.distributions.mulch_to_stone.residential.bed_area_sf,
    ).toEqual({ unit: "SF", p25: 150, p50: 300, p75: 550 });
  });

  it("round-trips a per-plant choice, and clears it back to nothing", async () => {
    // Plant choices live beside the segmentation rather than inside it: on
    // Postgres they are their own table, on the file store a map on the
    // project. Both backends have to agree, including about what "no
    // choice" looks like — a project nobody has replanted must come back
    // identical to one from before plants were swappable.
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });
    expect((await store.getProject(created.id)).plantSelections).toBeUndefined();

    await store.setPlantSelection(
      created.id,
      "demo_foundation_plant_2",
      "plantsku_plant_boxwood_green_velvet",
    );
    await store.setPlantSelection(
      created.id,
      "demo_bed_plant_1",
      "plantsku_plant_hosta_patriot",
    );
    expect((await store.getProject(created.id)).plantSelections).toEqual({
      demo_bed_plant_1: "plantsku_plant_hosta_patriot",
      demo_foundation_plant_2: "plantsku_plant_boxwood_green_velvet",
    });

    // Changing one leaves the other alone — that is the whole point of
    // keying by plant rather than by region.
    await store.setPlantSelection(
      created.id,
      "demo_foundation_plant_2",
      "plantsku_plant_mugo_pine",
    );
    expect((await store.getProject(created.id)).plantSelections).toEqual({
      demo_bed_plant_1: "plantsku_plant_hosta_patriot",
      demo_foundation_plant_2: "plantsku_plant_mugo_pine",
    });

    await store.setPlantSelection(created.id, "demo_bed_plant_1", null);
    await store.setPlantSelection(created.id, "demo_foundation_plant_2", null);
    expect((await store.getProject(created.id)).plantSelections).toBeUndefined();
  });

  it("round-trips plants taken out, and puts them back", async () => {
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });
    expect((await store.getProject(created.id)).clearedPlantings).toBeUndefined();

    await store.setPlantingsCleared(
      created.id,
      ["demo_foundation_plant_1", "demo_foundation_plant_2"],
      true,
    );
    const cleared = await store.getProject(created.id);
    expect(cleared.clearedPlantings?.sort()).toEqual([
      "demo_foundation_plant_1",
      "demo_foundation_plant_2",
    ]);

    await store.setPlantingsCleared(created.id, ["demo_foundation_plant_1"], false);
    expect((await store.getProject(created.id)).clearedPlantings).toEqual([
      "demo_foundation_plant_2",
    ]);
    await store.setPlantingsCleared(created.id, ["demo_foundation_plant_2"], false);
    expect((await store.getProject(created.id)).clearedPlantings).toBeUndefined();
  });

  it("keeps replacing a plant and removing it to one decision", async () => {
    // They are the same slot — the check constraint on plant_selections
    // says so — because a design that held both would bill the crew twice
    // for taking the same shrub out.
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });

    await store.setPlantSelection(
      created.id,
      "demo_bed_plant_1",
      "plantsku_plant_hosta_patriot",
    );
    await store.setPlantingsCleared(created.id, ["demo_bed_plant_1"], true);
    const takenOut = await store.getProject(created.id);
    expect(takenOut.clearedPlantings).toEqual(["demo_bed_plant_1"]);
    expect(takenOut.plantSelections).toBeUndefined();

    await store.setPlantSelection(
      created.id,
      "demo_bed_plant_1",
      "plantsku_plant_hosta_patriot",
    );
    const replaced = await store.getProject(created.id);
    expect(replaced.plantSelections).toEqual({
      demo_bed_plant_1: "plantsku_plant_hosta_patriot",
    });
    expect(replaced.clearedPlantings).toBeUndefined();
  });

  it("refuses to take out a plant the design does not have", async () => {
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });
    await expect(
      store.setPlantingsCleared(created.id, ["no_such_plant"], true),
    ).rejects.toThrow();
  });

  it("round-trips a corrected outline, and puts the original back", async () => {
    // The model's polygon and the customer's correction are different
    // facts. Both are kept: only one of them can be improved by a better
    // prompt, and keeping both is what makes "put it back" possible.
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });
    expect((await store.getProject(created.id)).regionOutlines).toBeUndefined();

    const corrected: [number, number][] = [
      [0.06, 0.6],
      [0.44, 0.57],
      [0.46, 0.71],
      [0.05, 0.74],
    ];
    await store.setRegionOutline(created.id, "demo_bed", corrected);
    const after = await store.getProject(created.id);
    expect(after.regionOutlines).toEqual({ demo_bed: corrected });
    // The segmentation's own polygon is untouched.
    const bed = after.segmentation.status === "ready"
      ? after.segmentation.regions.find((r) => r.id === "demo_bed")!
      : null;
    expect(bed!.polygon).toEqual(
      demoSegmentation().regions.find((r) => r.id === "demo_bed")!.polygon,
    );

    await store.setRegionOutline(created.id, "demo_bed", null);
    expect((await store.getProject(created.id)).regionOutlines).toBeUndefined();
  });

  it("round-trips the wait's own progress, and clears it once there is an answer", async () => {
    // The customer's progress bar is a report of what the server did, so
    // what the server wrote has to survive the trip through Postgres —
    // and has to disappear the moment the segmentation answers, because
    // there is no wait to describe once there is a result.
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    const progress = {
      startedAt: "2026-08-26T14:00:00.000Z",
      stage: "refining" as const,
      estimate: { firstPassMs: 56_200, refineMs: 95_500, totalMs: 151_700 },
      firstPassMs: 56_200,
      found: ["Front lawn", "Bed along front walk"],
    };
    await store.setSegmentation(created.id, { status: "pending", progress });

    const waiting = (await store.getProject(created.id)).segmentation;
    expect(waiting.status).toBe("pending");
    expect(waiting.status === "pending" ? waiting.progress : null).toEqual(progress);

    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });
    const answered = await store.getProject(created.id);
    expect(answered.segmentation.status).toBe("ready");
    expect(JSON.stringify(answered)).not.toContain("firstPassMs");
  });

  it("refuses a correction to a region the design does not have", async () => {
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });
    await expect(
      store.setRegionOutline(created.id, "no_such_region", [
        [0.1, 0.1],
        [0.2, 0.1],
        [0.2, 0.2],
      ]),
    ).rejects.toThrow(/not part of this design/i);
  });

  it("refuses a choice about a plant the design does not have", async () => {
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, { status: "ready", ...demoSegmentation() });
    await expect(
      store.setPlantSelection(created.id, "no_such_plant_1", "plantsku_plant_hosta_patriot"),
    ).rejects.toThrow(/not part of this design/i);
  });

  it("round-trips a design with full provenance on every quantity", async () => {
    const created = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    await store.setSegmentation(created.id, {
      status: "ready",
      ...demoSegmentation(),
    });
    await store.setLocation(created.id, {
      address: "123 Test St, Madison, WI",
      lat: 43.07,
      lng: -89.4,
      source: "demo",
      capturedAt: new Date().toISOString(),
    });
    const capturedAt = new Date().toISOString();
    const areaSf = {
      value: 412.5,
      unit: "SF" as const,
      source: "user_drawn" as const,
      confidence: 0.85,
      capturedAt,
    };
    await store.upsertAerialRegion(created.id, {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      photoRegionId: "demo_bed",
      ring: [
        [-89.4, 43.07],
        [-89.3999, 43.07],
        [-89.3999, 43.0701],
      ],
      areaSf,
      perimeterLf: { ...areaSf, value: 82, unit: "LF" },
    });

    const project = await store.getProject(created.id);
    // The whole Quantity, not a number that used to be one.
    expect(project.aerialRegions![0].areaSf).toEqual(areaSf);
    expect(project.segmentation).toEqual({ status: "ready", ...demoSegmentation() });
    expect(project.location!.address).toBe("123 Test St, Madison, WI");
    expect(project.photo).toEqual({ fileName: "photo.jpg", mediaType: "image/jpeg" });

    // Photo bytes survive too.
    const photo = await store.getProjectPhoto(created.id);
    expect(photo.bytes.equals(PHOTO_BYTES)).toBe(true);
    expect(photo.mediaType).toBe("image/jpeg");

    // Sharing an address supersedes a decline, and the reverse is refused
    // by nothing — both are ordinary edits while playing.
    await store.declineAddress(created.id);
    expect((await store.getProject(created.id)).addressDeclined).toBe(true);
  });

  it("reports a missing project rather than a driver error", async () => {
    await expect(store.getProject("not-a-uuid")).rejects.toBeInstanceOf(
      store.ProjectNotFoundError,
    );
    await expect(
      store.getProject("aaaaaaaa-bbbb-4ccc-8ddd-000000000000"),
    ).rejects.toBeInstanceOf(store.ProjectNotFoundError);
  });
});

/**
 * Photo storage, on the database leg (project-map section 3).
 *
 * The acceptance beat: with a bucket configured the bytes are in the
 * bucket and NOT in the database; with none configured they are a row in
 * this deployment's own object table. Either way the route serves them and
 * nothing above lib/storage can tell the difference.
 */
describe("photo storage, against the database", () => {
  it("keeps the bytes in photo_objects when no bucket is configured", async () => {
    const project = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");
    const db = await getDb();

    const row = await db.query.photos.findFirst({
      where: eq(photos.projectId, project.id),
    });
    // Section 5's `url`, no longer null on every row: it is the locator.
    expect(row!.url).toMatch(/^inline:photos\/[0-9a-f-]{36}\.jpg$/);

    const object = await db.query.photoObjects.findFirst({
      where: eq(photoObjects.key, row!.url.slice("inline:".length)),
    });
    expect(Buffer.from(object!.bytes).equals(PHOTO_BYTES)).toBe(true);
    expect(object!.mediaType).toBe("image/jpeg");

    const response = await photoGET(
      new Request(`http://localhost/api/projects/${project.id}/photo`),
      params(project.id),
    );
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(PHOTO_BYTES)).toBe(true);
  });

  it("puts the bytes in the bucket and NOT in the database when one is", async () => {
    const bucket = await startFakeBucket();
    const restore = useBucket(bucket);
    storage.resetPhotoStorage();
    const db = await getDb();

    try {
      const project = await store.createProject(PHOTO_BYTES, "image/jpeg", "jpg");

      expect([...bucket.objects.values()][0].bytes.equals(PHOTO_BYTES)).toBe(true);
      const row = await db.query.photos.findFirst({
        where: eq(photos.projectId, project.id),
      });
      expect(row!.url).toMatch(/^s3:photos\/[0-9a-f-]{36}\.jpg$/);
      // The database gained a pointer and no bytes. Checked by key rather
      // than by counting rows: with DATABASE_URL set the whole suite shares
      // one disposable schema, and another file's upload is not this test's
      // business.
      const key = row!.url.slice("s3:".length);
      expect([...bucket.objects.keys()]).toContain(key);
      expect(
        await db.query.photoObjects.findFirst({ where: eq(photoObjects.key, key) }),
      ).toBeUndefined();

      const response = await photoGET(
        new Request(`http://localhost/api/projects/${project.id}/photo`),
        params(project.id),
      );
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(PHOTO_BYTES)).toBe(true);
    } finally {
      restore();
      storage.resetPhotoStorage();
      await bucket.close();
    }
  });
});

describe("phase 5 acceptance, against the database", () => {
  it("returns the customer's frozen bytes byte-identical after a database round trip", async () => {
    const { projectId, customerSawBytes } = await submittedLead(300);

    // Read back through a fresh query — the bytes came out of a TEXT
    // column, not out of a re-serialized JSONB document.
    const project = await store.getProject(projectId);
    const snapshot = submittedSnapshot(project)!;
    expect(snapshot.customerFacingPayload).toBe(customerSawBytes);

    const reread = await snapshotGET(
      new Request(`http://localhost/api/projects/${projectId}/snapshot`),
      params(projectId),
    );
    expect(reread.status).toBe(200);
    expect(await reread.text()).toBe(customerSawBytes);

    const view = JSON.parse(customerSawBytes);
    expect(view.kind).toBe("estimate_snapshot");
    expect(view.estimate.band.basis).toBe("measured");

    for (const marker of INTERNAL_ONLY_MARKERS) {
      expect(
        customerSawBytes.includes(marker),
        `customer bytes contain "${marker}"`,
      ).toBe(false);
    }
    // The internal side survived the trip too, on the contractor surface.
    expect(snapshot.lineItems.length).toBeGreaterThan(0);
    expect(snapshot.internalTotal).toBeGreaterThan(0);
    expect(snapshot.lineItems[0].quantity.source).toBe("user_drawn");

    const leads = await store.listLeads();
    expect(leads.map((l) => l.id)).toContain(projectId);
    expect(leads.find((l) => l.id === projectId)!.contact).toEqual(CONTACT);
  });

  it("locks the project after submit", async () => {
    const { projectId, customerSawBytes } = await submittedLead(300);
    await expect(
      store.setSelection(projectId, "demo_bed", {
        surfaceOptionId: "surface_mulch_cedar",
        addonOptionIds: [],
      }),
    ).rejects.toBeInstanceOf(store.ProjectLockedError);
    const again = await submitPOST(
      jsonRequest(`/api/projects/${projectId}/submit`, "POST", { contact: CONTACT }),
      params(projectId),
    );
    expect(again.status).toBe(409);
    expect(submittedSnapshot(await store.getProject(projectId))!.customerFacingPayload).toBe(
      customerSawBytes,
    );
  });
});

describe("phase 6 acceptance, against the database", () => {
  it("corrects 400 → 470: the delta is a row, the quote uses 470, the original still says 400", async () => {
    const { projectId, customerSawBytes } = await submittedLead(400);

    expect((await confirm(projectId, 470)).status).toBe(201);

    // The delta is queryable — from the table, not from a project file.
    const deltas = await store.listMeasurementDeltas();
    const delta = deltas.find((d) => d.projectId === projectId && d.unit === "SF")!;
    expect(delta).toBeDefined();
    expect(delta.beforeQty.value).toBe(400);
    expect(delta.beforeQty.source).toBe("user_drawn");
    expect(delta.afterQty.value).toBe(470);
    expect(delta.afterQty.source).toBe("rep_confirmed");
    expect(delta.afterQty.supersedes).toBe(delta.beforeQty.id);
    expect(delta.jobType).toBe("mulch_to_stone");
    expect(errorPct(delta)).toBeCloseTo(-14.894, 2);

    const quoteRes = await quotePOST(
      await repRequest(`/api/projects/${projectId}/quote`, "POST"),
      params(projectId),
    );
    expect(quoteRes.status).toBe(201);
    const quoteBytes = await quoteRes.text();

    const project = await store.getProject(projectId);
    expect(project.status).toBe("quoted");
    const final = finalQuoteSnapshot(project)!;
    expect(final.kind).toBe("rep_confirmed");
    const bedLine = final.lineItems.find((li) => li.quantity.unit === "SF")!;
    expect(bedLine.quantity.value).toBe(470);
    expect(bedLine.quantity.source).toBe("rep_confirmed");

    const finalView = JSON.parse(quoteBytes);
    expect(isFinalQuotePayload(finalView.estimate)).toBe(true);
    expect(finalView.estimate.confirmation.confirmedAreaSf).toBe(470);

    // The customer's original snapshot is untouched by all of it.
    const submitted = submittedSnapshot(project)!;
    expect(submitted.customerFacingPayload).toBe(customerSawBytes);
    expect(
      submitted.lineItems.find((li) => li.quantity.unit === "SF")!.quantity.value,
    ).toBe(400);
    expect(
      await (
        await snapshotGET(
          new Request(`http://localhost/api/projects/${projectId}/snapshot`),
          params(projectId),
        )
      ).text(),
    ).toBe(customerSawBytes);

    // Both snapshots in one append-only list, oldest first.
    expect(project.snapshots).toHaveLength(2);
    expect(project.snapshots![0].id).toBe(submitted.id);
    expect(project.snapshots![1].id).toBe(final.id);

    const quoteRead = await quoteGET(
      new Request(`http://localhost/api/projects/${projectId}/quote`),
      params(projectId),
    );
    expect(await quoteRead.text()).toBe(quoteBytes);
  });

  it("keeps a chained correction's lineage a line, not a fork", async () => {
    const { projectId } = await submittedLead(400);
    const res = await confirmPOST(
      await repRequest(`/api/projects/${projectId}/confirm`, "POST", {
        corrections: [
          { photoRegionId: "demo_bed", unit: "SF", value: 470 },
          { photoRegionId: "demo_bed", unit: "SF", value: 455 },
        ],
      }),
      params(projectId),
    );
    expect(res.status).toBe(201);
    // Two rows written in the same millisecond still read back in order.
    const [first, second] = (await store.getProject(projectId)).deltas!;
    expect(first.afterQty.value).toBe(470);
    expect(second.beforeQty.value).toBe(470);
    expect(second.afterQty.supersedes).toBe(first.afterQty.id);
  });

  it("refuses to quote before anything is confirmed, and to correct after quoting", async () => {
    const { projectId } = await submittedLead(400);
    expect(
      (await quotePOST(await repRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId)))
        .status,
    ).toBe(409);
    await confirm(projectId, 470);
    expect(
      (await quotePOST(await repRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId)))
        .status,
    ).toBe(201);
    expect((await confirm(projectId, 500)).status).toBe(409);
  });

  it("answers the corpus query as one SQL statement, matching /deltas", async () => {
    // A spread of known errors on top of everything above.
    for (const [aerial, confirmed] of [
      [400, 440],
      [500, 500],
      [300, 600],
    ] as const) {
      const { projectId } = await submittedLead(aerial);
      await confirm(projectId, confirmed);
    }

    const deltas = await store.listMeasurementDeltas();
    expect(deltas.length).toBeGreaterThan(3);
    // Oldest first across the whole corpus, straight off the index.
    const times = deltas.map((d) => d.correctedAt);
    expect([...times].sort()).toEqual(times);

    const inMemory = analyzeDeltas(deltas).byJobType;
    const inSql = await deltaErrorStatsByJobType(await getDb());

    // The whole business, computed both ways, agreeing to the digit.
    expect(Object.keys(inSql).sort()).toEqual(Object.keys(inMemory).sort());
    expect(inSql).toEqual(inMemory);

    const stone = inSql.mulch_to_stone!;
    expect(stone.count).toBe(deltas.filter((d) => d.jobType === "mulch_to_stone").length);
    expect(stone.p90AbsErrorPct).toBeGreaterThanOrEqual(stone.meanAbsErrorPct);
    expect(stone.maxAbsErrorPct).toBeGreaterThanOrEqual(50);
  });
});
