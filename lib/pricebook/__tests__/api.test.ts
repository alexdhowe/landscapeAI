/**
 * The price book, end to end: edit a draft, publish it, and confirm that
 * what was already quoted did not move.
 *
 * That last part is the whole reason revisions exist. A contractor raising
 * the price of mulch must not retroactively change what a customer was
 * shown last week, and a measurement delta from last week must stay
 * interpretable against the prices that produced it.
 */
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL) process.env.PGLITE_DATA_DIR = "memory://";
delete process.env.PROJECTS_DATA_DIR;

const store = await import("../../store/projects");
const { getDb } = await import("../../db/client");
const q = await import("../../db/queries");
const { resolveOrg, resolveOrgAt, resetOrgCache } = await import("../../org/resolve");
const { contractorHeaders } = await import("../../auth/__tests__/helpers");
const { demoSegmentation } = await import("../../vision/demo");
const { submittedSnapshot } = await import("../../lead/snapshot");

const { GET: pricebookGET } = await import("../../../app/api/pricebook/route");
const { POST: draftPOST, DELETE: draftDELETE } = await import(
  "../../../app/api/pricebook/draft/route"
);
const { POST: publishPOST } = await import("../../../app/api/pricebook/publish/route");
const { GET: historyGET } = await import("../../../app/api/pricebook/history/route");
const { PUT: costItemPUT, DELETE: costItemDELETE } = await import(
  "../../../app/api/pricebook/cost-items/[sku]/route"
);
const { DELETE: assemblyDELETE, PUT: assemblyPUT } = await import(
  "../../../app/api/pricebook/assemblies/[key]/route"
);
const { PATCH: settingsPATCH } = await import("../../../app/api/pricebook/settings/route");
const { POST: submitPOST } = await import(
  "../../../app/api/projects/[projectId]/submit/route"
);

afterAll(() => {
  delete process.env.PGLITE_DATA_DIR;
  store.resetStore();
  resetOrgCache();
});

const ADMIN = { name: "Ada Owner", role: "admin" as const };
const REP = { name: "Sam Rep", role: "rep" as const };

const req = async (
  method: string,
  body?: unknown,
  who: { name: string; role: "admin" | "rep" } = ADMIN,
) =>
  new Request("http://localhost/api/pricebook", {
    method,
    headers: await contractorHeaders(who),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const anon = (method: string, body?: unknown) =>
  new Request("http://localhost/api/pricebook", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

/** A submitted lead, priced from whatever book is published right now. */
async function submitLead() {
  const project = await store.createProject(Buffer.from("x"), "image/jpeg", "jpg");
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
    areaSf: { value: 400, unit: "SF", source: "user_drawn", confidence: 0.85, capturedAt },
    perimeterLf: { value: 80, unit: "LF", source: "user_drawn", confidence: 0.85, capturedAt },
  });
  const res = await submitPOST(
    new Request(`http://localhost/api/projects/${project.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: { name: "Dana", email: "dana@example.com" } }),
    }),
    params({ projectId: project.id }),
  );
  expect(res.status).toBe(201);
  return { projectId: project.id, bytes: await res.text() };
}

describe("who may touch the price book", () => {
  it("refuses anonymous and non-admin contractors", async () => {
    expect((await pricebookGET(anon("GET"))).status).toBe(401);
    expect((await pricebookGET(await req("GET", undefined, REP))).status).toBe(403);
    expect((await draftPOST(await req("POST", undefined, REP))).status).toBe(403);
    expect((await publishPOST(await req("POST", {}, REP))).status).toBe(403);
    // An admin gets in.
    expect((await pricebookGET(await req("GET"))).status).toBe(200);
  });
});

describe("the seeded book", () => {
  it("starts as published revision 1 with no draft, and validates clean", async () => {
    const view = await (await pricebookGET(await req("GET"))).json();
    expect(view.draft).toBeNull();
    expect(view.published.revision).toBe(1);
    expect(view.published.status).toBe("published");
    expect(view.issues.filter((i: { severity: string }) => i.severity === "error")).toEqual([]);
    expect(view.config.priceBook.costItems.length).toBeGreaterThan(40);
    // Plant metadata rides with the book — the time slider needs it.
    expect(view.config.plantMeta.plant_hydrangea_annabelle.matureSpreadFt).toBe(5);
  });
});

describe("editing a draft", () => {
  it("opens a draft as a copy, and leaves the published book alone", async () => {
    const created = await draftPOST(await req("POST"));
    expect(created.status).toBe(201);
    const view = await created.json();
    expect(view.draft.revision).toBe(2);
    expect(view.draft.status).toBe("draft");
    expect(view.changes).toEqual([]); // an exact copy, so far

    // The org still prices from revision 1.
    expect((await resolveOrg()).revision).toBe(1);

    await draftDELETE(await req("DELETE"));
    expect((await (await pricebookGET(await req("GET"))).json()).draft).toBeNull();
  });

  it("records a price change as a draft, with the diff and no effect on live pricing", async () => {
    const res = await costItemPUT(
      await req("PUT", {
        name: "Shredded hardwood mulch",
        kind: "material",
        unit: "CY",
        unitCost: 46,
        wasteFactorPct: 10,
      }),
      params({ sku: "mulch_hardwood" }),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.draft).not.toBeNull();
    expect(view.changes).toHaveLength(1);
    expect(view.changes[0]).toMatchObject({
      entity: "Cost item",
      key: "mulch_hardwood",
      fields: [{ field: "unitCost", before: 38, after: 46 }],
    });
    expect(view.publishable).toBe(true);

    // Nothing customer-facing has moved: the draft is not the book.
    const org = await resolveOrg();
    expect(org.revision).toBe(1);
    expect(org.priceBook.costItems.find((c) => c.id === "mulch_hardwood")!.unitCost).toBe(38);

    await draftDELETE(await req("DELETE"));
  });

  it("refuses to delete a SKU that assemblies price with", async () => {
    const res = await costItemDELETE(await req("DELETE"), params({ sku: "mulch_hardwood" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/priced into/);
    expect(body.conflicts.length).toBeGreaterThan(0);
    await draftDELETE(await req("DELETE"));
  });

  it("refuses an assembly built from a SKU that isn't stocked", async () => {
    const res = await assemblyPUT(
      await req("PUT", {
        name: "Unobtainium bed",
        unit: "SF",
        components: [{ costItemId: "unobtainium", qtyPerUnit: 1 }],
      }),
      params({ key: "unobtainium_bed" }),
    );
    expect(res.status).toBe(409);
    await draftDELETE(await req("DELETE"));
  });

  it("rejects a malformed component rather than repairing it", async () => {
    const res = await assemblyPUT(
      await req("PUT", {
        name: "Ambiguous",
        unit: "SF",
        components: [{ costItemId: "weed_fabric", qtyPerUnit: 1, productionRate: 2 }],
      }),
      params({ key: "ambiguous" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("the publish gate", () => {
  it("refuses to publish a book that would break the configurator", async () => {
    // Remove the recipe that uses it, so only the CATALOG stands in the way.
    const { PUT: recipePUT } = await import(
      "../../../app/api/pricebook/recipes/[jobType]/route"
    );
    await recipePUT(
      await req("PUT", {
        lines: [{ assemblyId: "steel_edging_install", distributionKey: "edging_lf" }],
      }),
      params({ jobType: "mulch_to_stone" }),
    );
    const removed = await assemblyDELETE(
      await req("DELETE"),
      params({ key: "stone_bed_conversion" }),
    );
    expect(removed.status).toBe(200);

    const res = await publishPOST(await req("POST", { label: "break it" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.issues.map((i: { code: string }) => i.code)).toContain(
      "catalog_orphaned_assembly",
    );

    // Still on revision 1, still pricing.
    expect((await resolveOrg()).revision).toBe(1);
    await draftDELETE(await req("DELETE"));
  });
});

describe("publishing, and what it must not disturb", () => {
  it("does not reprice an estimate that was already frozen", async () => {
    // 1. A customer submits against revision 1.
    const before = await submitLead();
    const beforeSnapshot = submittedSnapshot(await store.getProject(before.projectId))!;
    const beforeTotal = beforeSnapshot.internalTotal;
    expect(beforeSnapshot.priceBookRevisionId).toBeTruthy();

    const publishedAtR1 = new Date();
    await new Promise((r) => setTimeout(r, 10));

    // 2. The contractor raises the price of river rock by 50% and publishes.
    await costItemPUT(
      await req("PUT", {
        name: "Washed river rock 1.5in",
        kind: "material",
        unit: "CY",
        unitCost: 142.5,
        wasteFactorPct: 10,
      }),
      params({ sku: "stone_river_rock" }),
    );
    const published = await publishPOST(
      await req("POST", { label: "Stone supplier increase", note: "Quarry raised delivered." }),
    );
    expect(published.status).toBe(201);
    const revision2 = await published.json();
    expect(revision2.revision).toBe(2);
    expect(revision2.status).toBe("published");
    expect(revision2.publishedBy).toBe("Ada Owner");

    // 3. Live pricing moved.
    const org = await resolveOrg();
    expect(org.revision).toBe(2);
    expect(org.priceBook.costItems.find((c) => c.id === "stone_river_rock")!.unitCost).toBe(142.5);

    // 4. THE POINT: the frozen estimate did not.
    const after = submittedSnapshot(await store.getProject(before.projectId))!;
    expect(after.internalTotal).toBe(beforeTotal);
    expect(after.customerFacingPayload).toBe(before.bytes);

    // 5. A new lead prices higher, from the same design and quantities.
    const now = await submitLead();
    const nowSnapshot = submittedSnapshot(await store.getProject(now.projectId))!;
    expect(nowSnapshot.internalTotal).toBeGreaterThan(beforeTotal);
    expect(nowSnapshot.priceBookRevisionId).not.toBe(after.priceBookRevisionId);

    // 6. And the old book is still answerable: "what did we charge in March".
    const asOf = await resolveOrgAt(publishedAtR1);
    expect(asOf.revision).toBe(1);
    expect(asOf.priceBook.costItems.find((c) => c.id === "stone_river_rock")!.unitCost).toBe(95);
  });

  it("freezes a published revision — it cannot be edited afterwards", async () => {
    const db = await getDb();
    const org = await resolveOrg();
    const config = await q.readRevisionConfig(db, org.revisionId);
    await expect(q.writeRevisionConfig(db, org.revisionId, config)).rejects.toThrow(
      /published and cannot be edited/,
    );
  });

  it("keeps the history, with what each revision changed", async () => {
    const history = await (await historyGET(await req("GET"))).json();
    expect(history[0].revision).toBe(2);
    expect(history[0].label).toBe("Stone supplier increase");
    expect(history[0].publishedBy).toBe("Ada Owner");
    expect(history[0].changes).toEqual([
      {
        kind: "changed",
        entity: "Cost item",
        key: "stone_river_rock",
        label: "Washed river rock 1.5in",
        fields: [{ field: "unitCost", before: 95, after: 142.5 }],
      },
    ]);
    // Revision 1 has nothing before it to differ from.
    expect(history[1].revision).toBe(1);
    expect(history[1].changes).toEqual([]);
  });
});

describe("settings", () => {
  it("changes margin through the draft, and never lets a policy show unit rates", async () => {
    const res = await settingsPATCH(
      await req("PATCH", {
        margin: { targetGmPct: 48 },
        bandPolicy: { roundTo: 250, showUnitRates: true },
      }),
    );
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.config.margin.targetGmPct).toBe(48);
    expect(view.config.margin.minGmPct).toBe(35); // untouched by a partial patch
    expect(view.config.bandPolicy.showUnitRates).toBe(false);
    await draftDELETE(await req("DELETE"));
  });

  it("refuses to publish a floor above the target", async () => {
    await settingsPATCH(await req("PATCH", { margin: { targetGmPct: 30, minGmPct: 45 } }));
    const res = await publishPOST(await req("POST", {}));
    expect(res.status).toBe(422);
    expect((await res.json()).issues.map((i: { code: string }) => i.code)).toContain(
      "margin_floor_above_target",
    );
    await draftDELETE(await req("DELETE"));
  });
});
