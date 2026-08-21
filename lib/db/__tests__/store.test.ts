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
const { analyzeDeltas } = await import("../../confirm/analytics");
const { errorPct } = await import("../../confirm/deltas");
const { submittedSnapshot, finalQuoteSnapshot, INTERNAL_ONLY_MARKERS } = await import(
  "../../lead/snapshot"
);
const { isFinalQuotePayload } = await import("../../design/quote");
const { wiPriceBook, wiMarginConfig, wiBandPolicy, wiFinalQuotePolicy } = await import(
  "../../../seed/pricebook.seed"
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
  resetOrgCache();
});

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
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

const confirm = (projectId: string, value: number, unit: "SF" | "LF" = "SF") =>
  confirmPOST(
    jsonRequest(`/api/projects/${projectId}/confirm`, "POST", {
      correctedBy: "Sam Rep",
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
      jsonRequest(`/api/projects/${projectId}/quote`, "POST"),
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
      jsonRequest(`/api/projects/${projectId}/confirm`, "POST", {
        correctedBy: "Sam Rep",
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
      (await quotePOST(jsonRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId)))
        .status,
    ).toBe(409);
    await confirm(projectId, 470);
    expect(
      (await quotePOST(jsonRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId)))
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
