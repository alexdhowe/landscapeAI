/**
 * Phase 5 acceptance, end to end through the real route handlers and the
 * file-backed store: submit as a customer, see the lead in the contractor
 * inbox, and confirm the STORED snapshot is byte-identical to what the
 * customer saw at submit time.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The store resolves its data directory at import time — point it at a
// throwaway dir BEFORE anything imports it.
process.env.PROJECTS_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "landscape-leads-test-"),
);

const store = await import("../../store/projects");
const { demoSegmentation } = await import("../../vision/demo");
const { latestSnapshot, INTERNAL_ONLY_MARKERS } = await import("../snapshot");
const { POST: submitPOST } = await import(
  "../../../app/api/projects/[projectId]/submit/route"
);
const { GET: snapshotGET } = await import(
  "../../../app/api/projects/[projectId]/snapshot/route"
);
const { PATCH: projectPATCH } = await import(
  "../../../app/api/projects/[projectId]/route"
);

afterAll(() => {
  rmSync(process.env.PROJECTS_DATA_DIR!, { recursive: true, force: true });
});

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

const jsonRequest = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const CONTACT = {
  name: "Dana Homeowner",
  email: "dana@example.com",
  phone: "608-555-0101",
  notes: "Gate code is 4321",
};

/** A designed project ready to submit: segmented, one stone swap on the bed. */
async function designedProject() {
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
  return project.id;
}

async function measure(projectId: string, areaSf: number) {
  const capturedAt = new Date().toISOString();
  await store.upsertAerialRegion(projectId, {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    photoRegionId: "demo_bed",
    ring: [
      [-89.4, 43.07],
      [-89.3999, 43.07],
      [-89.3999, 43.0701],
      [-89.4, 43.0701],
    ],
    areaSf: { value: areaSf, unit: "SF", source: "user_drawn", confidence: 0.85, capturedAt },
    perimeterLf: { value: 80, unit: "LF", source: "user_drawn", confidence: 0.85, capturedAt },
  });
}

describe("lead submit — the acceptance path", () => {
  it("stores a snapshot byte-identical to what the customer saw, and lists the lead", async () => {
    const projectId = await designedProject();
    await measure(projectId, 300);

    const res = await submitPOST(
      jsonRequest(`/api/projects/${projectId}/submit`, "POST", { contact: CONTACT }),
      params(projectId),
    );
    expect(res.status).toBe(201);
    const customerSawBytes = await res.text();

    // Byte identity: the stored snapshot IS the response body.
    const project = await store.getProject(projectId);
    const snapshot = latestSnapshot(project);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.customerFacingPayload).toBe(customerSawBytes);

    // …and the customer re-reading their estimate later gets the same bytes.
    const reread = await snapshotGET(
      new Request(`http://localhost/api/projects/${projectId}/snapshot`),
      params(projectId),
    );
    expect(reread.status).toBe(200);
    expect(await reread.text()).toBe(customerSawBytes);

    // The frozen customer document is well-formed and measured-basis.
    const view = JSON.parse(customerSawBytes);
    expect(view.kind).toBe("estimate_snapshot");
    expect(view.projectId).toBe(projectId);
    expect(view.estimate.band.basis).toBe("measured");
    expect(view.estimate.band.low).toBeGreaterThan(0);

    // Nothing internal in the customer bytes.
    for (const marker of INTERNAL_ONLY_MARKERS) {
      expect(
        customerSawBytes.includes(marker),
        `customer bytes contain "${marker}"`,
      ).toBe(false);
    }
    // The internal side exists — on the contractor surface only.
    expect(snapshot!.lineItems.length).toBeGreaterThan(0);
    expect(snapshot!.internalTotal).toBeGreaterThan(0);

    // The lead appears in the contractor inbox.
    const leads = await store.listLeads();
    expect(leads.map((l) => l.id)).toContain(projectId);
    const lead = leads.find((l) => l.id === projectId)!;
    expect(lead.contact).toEqual(CONTACT);
    expect(lead.status).toBe("submitted");
  });

  it("locks the project after submit — edits are rejected and the snapshot stands", async () => {
    const projectId = await designedProject();
    const res = await submitPOST(
      jsonRequest(`/api/projects/${projectId}/submit`, "POST", { contact: CONTACT }),
      params(projectId),
    );
    expect(res.status).toBe(201);
    const frozen = await res.text();

    // Store-level mutators refuse.
    await expect(
      store.setSelection(projectId, "demo_bed", {
        surfaceOptionId: "surface_mulch_cedar",
        addonOptionIds: [],
      }),
    ).rejects.toBeInstanceOf(store.ProjectLockedError);

    // Route-level PATCH returns 409.
    const patchRes = await projectPATCH(
      jsonRequest(`/api/projects/${projectId}`, "PATCH", {
        marketContext: "hoa_commercial",
      }),
      params(projectId),
    );
    expect(patchRes.status).toBe(409);

    // A second submit is refused.
    const again = await submitPOST(
      jsonRequest(`/api/projects/${projectId}/submit`, "POST", { contact: CONTACT }),
      params(projectId),
    );
    expect(again.status).toBe(409);

    // The stored snapshot is unchanged by any of it.
    const project = await store.getProject(projectId);
    expect(latestSnapshot(project)!.customerFacingPayload).toBe(frozen);
    expect(project.marketContext).toBe("residential");
  });

  it("captures the lead for a customer who declined an address, keeping the typology band", async () => {
    const projectId = await designedProject();
    await store.declineAddress(projectId);

    const res = await submitPOST(
      jsonRequest(`/api/projects/${projectId}/submit`, "POST", {
        contact: { name: "No Address", email: "noaddr@example.com" },
      }),
      params(projectId),
    );
    expect(res.status).toBe(201);
    const view = JSON.parse(await res.text());
    expect(view.estimate.band.basis).toBe("typology");
    expect(view.estimate.band.typical).toBeGreaterThan(0);

    const project = await store.getProject(projectId);
    expect(project.addressDeclined).toBe(true);
    expect(latestSnapshot(project)!.basis).toBe("typology");
    expect((await store.listLeads()).map((l) => l.id)).toContain(projectId);
  });

  it("rejects a submit with nothing selected — no estimate to freeze", async () => {
    const project = await store.createProject(Buffer.from("x"), "image/jpeg", "jpg");
    await store.setSegmentation(project.id, { status: "ready", ...demoSegmentation() });
    const res = await submitPOST(
      jsonRequest(`/api/projects/${project.id}/submit`, "POST", { contact: CONTACT }),
      params(project.id),
    );
    expect(res.status).toBe(409);
  });

  it("rejects bad contacts", async () => {
    const projectId = await designedProject();
    for (const contact of [
      undefined,
      {},
      { name: "", email: "a@b.co" },
      { name: "A", email: "not-an-email" },
    ]) {
      const res = await submitPOST(
        jsonRequest(`/api/projects/${projectId}/submit`, "POST", { contact }),
        params(projectId),
      );
      expect(res.status).toBe(400);
    }
  });
});
