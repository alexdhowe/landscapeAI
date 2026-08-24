/**
 * The plant swap through the real route handler.
 *
 * This is the boundary a browser talks to, so it is where "the catalog is
 * the guardrail" has to hold against something that is not the app's own
 * UI. Everything below is a PATCH the customer's browser could send.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

process.env.PROJECTS_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "landscape-plant-route-"),
);

const store = await import("../../store/projects");
const { demoSegmentation } = await import("../../vision/demo");
const { PATCH } = await import("../../../app/api/projects/[projectId]/route");
const { POST: submitPOST } = await import(
  "../../../app/api/projects/[projectId]/submit/route"
);

afterAll(() => {
  rmSync(process.env.PROJECTS_DATA_DIR!, { recursive: true, force: true });
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

async function design() {
  const project = await store.createProject(JPEG, "image/jpeg", "jpg");
  await store.setSegmentation(project.id, { status: "ready", ...demoSegmentation() });
  return project.id;
}

function patch(projectId: string, body: unknown) {
  return PATCH(
    new Request(`http://test/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId }) },
  );
}

describe("PATCH { plantingId, plantOptionId }", () => {
  it("swaps a plant and gives back the updated design", async () => {
    const id = await design();
    const res = await patch(id, {
      plantingId: "demo_foundation_plant_1",
      plantOptionId: "plantsku_plant_boxwood_green_velvet",
    });
    expect(res.status).toBe(200);
    const project = await res.json();
    expect(project.plantSelections).toEqual({
      demo_foundation_plant_1: "plantsku_plant_boxwood_green_velvet",
    });
  });

  it("puts the original plant back when the choice is cleared", async () => {
    const id = await design();
    await patch(id, {
      plantingId: "demo_bed_plant_1",
      plantOptionId: "plantsku_plant_hosta_patriot",
    });
    const res = await patch(id, { plantingId: "demo_bed_plant_1", plantOptionId: null });
    expect(res.status).toBe(200);
    expect((await res.json()).plantSelections).toBeUndefined();
  });

  it("refuses a plant the price book cannot install", async () => {
    const id = await design();
    const res = await patch(id, {
      plantingId: "demo_bed_plant_1",
      plantOptionId: "plantsku_plant_money_tree",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not offered/i);
  });

  it("refuses a tree against the house", async () => {
    // A 40-foot maple two feet from the siding is a callback, not a
    // design, and the browser is not the thing that decides that.
    const id = await design();
    const res = await patch(id, {
      plantingId: "demo_foundation_plant_1",
      plantOptionId: "plantsku_plant_maple_autumn_blaze",
    });
    expect(res.status).toBe(400);
    // The same tree is fine in a bed.
    const ok = await patch(id, {
      plantingId: "demo_bed_plant_1",
      plantOptionId: "plantsku_plant_maple_autumn_blaze",
    });
    expect(ok.status).toBe(200);
  });

  it("refuses a plant this design does not have", async () => {
    const id = await design();
    const res = await patch(id, {
      plantingId: "demo_bed_plant_99",
      plantOptionId: "plantsku_plant_hosta_patriot",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown plant/i);
  });

  it("refuses a malformed body", async () => {
    const id = await design();
    for (const body of [
      { plantingId: 42, plantOptionId: "plantsku_plant_hosta_patriot" },
      { plantingId: "demo_bed_plant_1", plantOptionId: 7 },
      { plantingId: "   ", plantOptionId: "plantsku_plant_hosta_patriot" },
    ]) {
      expect((await patch(id, body)).status).toBe(400);
    }
  });

  it("is locked once the design has been submitted", async () => {
    // Through the real submit route, so this asserts the actual lock
    // rather than a snapshot shape invented here.
    const id = await design();
    await patch(id, {
      plantingId: "demo_bed_plant_1",
      plantOptionId: "plantsku_plant_hosta_patriot",
    });
    const submitted = await submitPOST(
      new Request(`http://test/api/projects/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: { name: "Dana", email: "dana@example.com" } }),
      }),
      { params: Promise.resolve({ projectId: id }) },
    );
    expect(submitted.status).toBe(201);

    const res = await patch(id, {
      plantingId: "demo_bed_plant_2",
      plantOptionId: "plantsku_plant_hosta_patriot",
    });
    expect(res.status).toBe(409);
  });

  it("freezes the plant into the customer's snapshot", async () => {
    const id = await design();
    await patch(id, {
      plantingId: "demo_foundation_plant_1",
      plantOptionId: "plantsku_plant_boxwood_green_velvet",
    });
    const submitted = await submitPOST(
      new Request(`http://test/api/projects/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: { name: "Dana", email: "dana@example.com" } }),
      }),
      { params: Promise.resolve({ projectId: id }) },
    );
    expect(submitted.status).toBe(201);
    const payload = await submitted.json();
    // The plant reaches the customer's frozen bytes by name, and only by
    // name — the price of it is the rep's business.
    expect(payload.estimate.scope).toContain("Boxwood 'Green Velvet'");
    expect(JSON.stringify(payload)).not.toContain("unitCost");
  });
});
