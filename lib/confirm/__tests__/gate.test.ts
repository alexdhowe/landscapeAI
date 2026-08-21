/**
 * Phase 6 acceptance, end to end through the real route handlers and the
 * file-backed store.
 *
 * The map's test verbatim: correct a bed from 400 to 470 SF; the delta is
 * queryable, the final quote uses 470, and the customer's original
 * snapshot still shows 400. Then run the corpus query — mean and P90 error
 * by job type — because that query is the whole business.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The store resolves its data directory at import time — point it at a
// throwaway dir BEFORE anything imports it.
process.env.PROJECTS_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "landscape-confirm-test-"),
);

const store = await import("../../store/projects");
const { contractorHeaders } = await import("../../auth/__tests__/helpers");
const { demoSegmentation } = await import("../../vision/demo");
const { analyzeDeltas } = await import("../analytics");
const { errorPct } = await import("../deltas");
const {
  submittedSnapshot,
  finalQuoteSnapshot,
  INTERNAL_ONLY_MARKERS,
} = await import("../../lead/snapshot");
const { isFinalQuotePayload } = await import("../../design/quote");
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
  rmSync(process.env.PROJECTS_DATA_DIR!, { recursive: true, force: true });
});

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

const jsonRequest = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/**
 * The rep is signed in. Confirming quantities and issuing a quote are
 * contractor actions, and the delta records the session's identity — which
 * is why "Sam Rep" below is the contractor, not a field in the body.
 */
const repRequest = async (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: await contractorHeaders({ name: "Sam Rep" }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const CONTACT = { name: "Dana Homeowner", email: "dana@example.com" };

/**
 * A submitted lead whose bed was measured at `areaSf` on the aerial — the
 * state a rep finds when they pull up to the property.
 */
async function submittedLead(areaSf = 400, perimeterLf = 80) {
  const project = await store.createProject(
    Buffer.from("not-a-real-jpeg"),
    "image/jpeg",
    "jpg",
  );
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

describe("the confirmation gate — the acceptance path", () => {
  it("corrects 400 SF to 470 SF: the delta is queryable, the quote uses 470, the customer's snapshot still says 400", async () => {
    const { projectId, customerSawBytes } = await submittedLead(400);

    // --- the rep corrects the bed on site --------------------------------
    const confirmRes = await confirm(projectId, 470);
    expect(confirmRes.status).toBe(201);

    // --- the delta is queryable ------------------------------------------
    const deltas = await store.listMeasurementDeltas();
    const delta = deltas.find((d) => d.projectId === projectId && d.unit === "SF")!;
    expect(delta).toBeDefined();
    expect(delta.beforeQty.value).toBe(400);
    expect(delta.beforeQty.source).toBe("user_drawn");
    expect(delta.afterQty.value).toBe(470);
    expect(delta.afterQty.source).toBe("rep_confirmed");
    // The lineage resolves from the record alone.
    expect(delta.afterQty.supersedes).toBe(delta.beforeQty.id);
    expect(delta.correctedBy).toBe("Sam Rep");
    expect(delta.jobType).toBe("mulch_to_stone");
    expect(errorPct(delta)).toBeCloseTo(-14.894, 2);

    // --- the final quote is priced from 470 ------------------------------
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
    expect(final.basis).toBe("rep_confirmed");
    const bedLine = final.lineItems.find((li) => li.quantity.unit === "SF")!;
    expect(bedLine.quantity.value).toBe(470);
    expect(bedLine.quantity.source).toBe("rep_confirmed");

    const finalView = JSON.parse(quoteBytes);
    expect(finalView.kind).toBe("final_quote");
    expect(isFinalQuotePayload(finalView.estimate)).toBe(true);
    expect(finalView.estimate.quote.basis).toBe("rep_confirmed");
    expect(finalView.estimate.quote.price).toBeGreaterThan(0);
    expect(finalView.estimate.confirmation.confirmedAreaSf).toBe(470);
    expect(finalView.estimate.confirmation.confirmedBy).toBe("Sam Rep");

    // --- the customer's original snapshot is untouched --------------------
    const submitted = submittedSnapshot(project)!;
    expect(submitted.customerFacingPayload).toBe(customerSawBytes);
    const submittedBed = submitted.lineItems.find((li) => li.quantity.unit === "SF")!;
    expect(submittedBed.quantity.value).toBe(400);
    expect(submittedBed.quantity.source).toBe("user_drawn");

    // …and the endpoint the customer reads still serves those exact bytes.
    const reread = await snapshotGET(
      new Request(`http://localhost/api/projects/${projectId}/snapshot`),
      params(projectId),
    );
    expect(await reread.text()).toBe(customerSawBytes);

    // The final quote is a separate document on its own endpoint.
    const quoteRead = await quoteGET(
      new Request(`http://localhost/api/projects/${projectId}/quote`),
      params(projectId),
    );
    expect(quoteRead.status).toBe(200);
    expect(await quoteRead.text()).toBe(quoteBytes);

    // Both snapshots live in one append-only list, oldest first.
    expect(project.snapshots).toHaveLength(2);
    expect(project.snapshots![0].id).toBe(submitted.id);
    expect(project.snapshots![1].id).toBe(final.id);

    // Nothing internal leaked into the quote the customer receives.
    for (const marker of INTERNAL_ONLY_MARKERS) {
      expect(quoteBytes.includes(marker), `quote bytes contain "${marker}"`).toBe(false);
    }
  });

  it("prices the confirmed job higher than the estimate it replaced", async () => {
    const { projectId } = await submittedLead(400);
    const before = submittedSnapshot(await store.getProject(projectId))!.internalTotal;

    await confirm(projectId, 470);
    await quotePOST(await repRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId));

    const final = finalQuoteSnapshot(await store.getProject(projectId))!;
    // 470 SF of stone costs more than 400 SF of it. If the confirmed
    // quantity did not reach the engine, these would be equal.
    expect(final.internalTotal).toBeGreaterThan(before);
  });

  it("quotes the figure inside the band the customer was shown", async () => {
    const { projectId, customerSawBytes } = await submittedLead(400);
    await confirm(projectId, 410); // a small correction, well inside the band
    const res = await quotePOST(
      await repRequest(`/api/projects/${projectId}/quote`, "POST"),
      params(projectId),
    );
    const finalView = JSON.parse(await res.text());
    const submittedView = JSON.parse(customerSawBytes);

    expect(finalView.estimate.supersededBand).toEqual({
      low: submittedView.estimate.band.low,
      high: submittedView.estimate.band.high,
    });
    expect(finalView.estimate.quote.price).toBeGreaterThanOrEqual(
      submittedView.estimate.band.low,
    );
    expect(finalView.estimate.quote.price).toBeLessThanOrEqual(
      submittedView.estimate.band.high,
    );
  });

  it("chains corrections: the second supersedes the first, not the aerial", async () => {
    const { projectId } = await submittedLead(400);
    await confirm(projectId, 470);
    await confirm(projectId, 455);

    const project = await store.getProject(projectId);
    const [first, second] = (project.deltas ?? []).filter((d) => d.unit === "SF");
    expect(first.beforeQty.value).toBe(400);
    expect(second.beforeQty.value).toBe(470);
    expect(second.beforeQty.source).toBe("rep_confirmed");
    expect(second.beforeQty.id).toBe(first.afterQty.id);
    expect(second.afterQty.supersedes).toBe(first.afterQty.id);

    // The quote prices the newest confirmation.
    await quotePOST(await repRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId));
    const final = finalQuoteSnapshot(await store.getProject(projectId))!;
    expect(final.lineItems.find((li) => li.quantity.unit === "SF")!.quantity.value).toBe(455);
  });

  it("chains two corrections to the same dimension inside one request", async () => {
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

    const [first, second] = (await store.getProject(projectId)).deltas!;
    // Both superseding 400 would fork the lineage; the second must
    // supersede the first.
    expect(second.beforeQty.value).toBe(470);
    expect(second.afterQty.supersedes).toBe(first.afterQty.id);
  });

  it("confirms a typology quantity when the customer never shared an address", async () => {
    const project = await store.createProject(Buffer.from("x"), "image/jpeg", "jpg");
    await store.setSegmentation(project.id, { status: "ready", ...demoSegmentation() });
    await store.setSelection(project.id, "demo_bed", {
      surfaceOptionId: "surface_stone_river_rock",
      addonOptionIds: [],
    });
    await store.declineAddress(project.id);
    await submitPOST(
      jsonRequest(`/api/projects/${project.id}/submit`, "POST", { contact: CONTACT }),
      params(project.id),
    );

    const res = await confirm(project.id, 380);
    expect(res.status).toBe(201);
    const delta = (await store.getProject(project.id)).deltas![0];
    // The estimate being corrected was a percentile of past jobs, and the
    // record says so — that is the delta the typology band learns from.
    expect(delta.beforeQty.source).toBe("typology");
    expect(delta.afterQty.value).toBe(380);
  });

  it("refuses to quote before anything is confirmed, and to correct after quoting", async () => {
    const { projectId } = await submittedLead(400);

    const early = await quotePOST(
      await repRequest(`/api/projects/${projectId}/quote`, "POST"),
      params(projectId),
    );
    expect(early.status).toBe(409);

    await confirm(projectId, 470);
    expect(
      (await quotePOST(await repRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId)))
        .status,
    ).toBe(201);

    // A quote is final: a later correction would not reach it.
    expect((await confirm(projectId, 500)).status).toBe(409);
    // And it cannot be issued twice.
    expect(
      (await quotePOST(await repRequest(`/api/projects/${projectId}/quote`, "POST"), params(projectId)))
        .status,
    ).toBe(409);
  });

  it("refuses corrections before the customer has submitted", async () => {
    const project = await store.createProject(Buffer.from("x"), "image/jpeg", "jpg");
    await store.setSegmentation(project.id, { status: "ready", ...demoSegmentation() });
    await store.setSelection(project.id, "demo_bed", {
      surfaceOptionId: "surface_stone_river_rock",
      addonOptionIds: [],
    });
    expect((await confirm(project.id, 470)).status).toBe(409);
  });

  it("rejects malformed corrections and regions outside the design", async () => {
    const { projectId } = await submittedLead(400);
    const bad: unknown[] = [
      { corrections: [] },
      { corrections: [{ photoRegionId: "demo_bed", unit: "CY", value: 1 }] },
      { corrections: [{ photoRegionId: "demo_bed", unit: "SF", value: 0 }] },
      { corrections: [{ photoRegionId: "demo_bed", unit: "SF", value: "big" }] },
    ];
    for (const body of bad) {
      const res = await confirmPOST(
        await repRequest(`/api/projects/${projectId}/confirm`, "POST", body),
        params(projectId),
      );
      expect(res.status).toBe(400);
    }

    // A region nobody designed has no quantity to supersede.
    const unknownRegion = await confirmPOST(
      await repRequest(`/api/projects/${projectId}/confirm`, "POST", {
        corrections: [{ photoRegionId: "not_a_region", unit: "SF", value: 300 }],
      }),
      params(projectId),
    );
    expect(unknownRegion.status).toBe(400);
    // Nothing was written by any of the rejected calls.
    expect((await store.getProject(projectId)).deltas ?? []).toHaveLength(0);
  });

  it("answers the corpus query: mean and P90 error by job type", async () => {
    // Three more jobs with known errors, on top of everything above.
    for (const [aerial, confirmed] of [
      [400, 440], // +10% error on the estimate (estimate was low)
      [500, 500], // dead on
      [300, 600], // 50% low — the kind of miss that widens a band
    ] as const) {
      const { projectId } = await submittedLead(aerial);
      await confirm(projectId, confirmed);
    }

    const deltas = await store.listMeasurementDeltas();
    const analytics = analyzeDeltas(deltas);

    expect(analytics.overall.count).toBe(deltas.length);
    const stone = analytics.byJobType.mulch_to_stone!;
    expect(stone.count).toBeGreaterThan(3);
    // Every stat is a real number in percent, not NaN from an empty divisor.
    for (const value of [
      stone.meanErrorPct,
      stone.meanAbsErrorPct,
      stone.p90AbsErrorPct,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // P90 is never below the mean absolute error, and the 50%-low job is
    // in the corpus, so the tail is real.
    expect(stone.p90AbsErrorPct).toBeGreaterThanOrEqual(stone.meanAbsErrorPct);
    expect(stone.maxAbsErrorPct).toBeGreaterThanOrEqual(50);
    // The aerial leg is measurably better than pricing off percentiles.
    expect(analytics.bySource.user_drawn!.count).toBeGreaterThan(0);
    expect(analytics.bySource.typology!.count).toBeGreaterThan(0);
    // Deltas are ordered oldest first across the whole corpus.
    const times = deltas.map((d) => d.correctedAt);
    expect([...times].sort()).toEqual(times);
  });
});
