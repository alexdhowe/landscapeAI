/**
 * Correcting an outline through the real route handler.
 *
 * This is a customer's browser writing geometry that ends up on a rep's
 * screen and inside a frozen snapshot, so what it is allowed to write
 * matters more than the usual PATCH.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

process.env.PROJECTS_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "landscape-outline-route-"),
);

const store = await import("../../store/projects");
const { demoSegmentation } = await import("../../vision/demo");
const { PATCH } = await import("../../../app/api/projects/[projectId]/route");

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

const GOOD: [number, number][] = [
  [0.05, 0.6],
  [0.45, 0.57],
  [0.47, 0.71],
  [0.04, 0.74],
];

describe("PATCH { regionId, polygon }", () => {
  it("stores the customer's correction", async () => {
    const id = await design();
    const res = await patch(id, { regionId: "demo_bed", polygon: GOOD });
    expect(res.status).toBe(200);
    expect((await res.json()).regionOutlines).toEqual({ demo_bed: GOOD });
  });

  it("puts the segmented outline back on null", async () => {
    const id = await design();
    await patch(id, { regionId: "demo_bed", polygon: GOOD });
    const res = await patch(id, { regionId: "demo_bed", polygon: null });
    expect(res.status).toBe(200);
    expect((await res.json()).regionOutlines).toBeUndefined();
  });

  it("leaves the material selection alone", async () => {
    // The two are separate choices about the same region, and the branch
    // that handles one must not fall through into the other.
    const id = await design();
    await patch(id, {
      regionId: "demo_bed",
      selection: { surfaceOptionId: "surface_stone_river_rock", addonOptionIds: [] },
    });
    await patch(id, { regionId: "demo_bed", polygon: GOOD });
    const project = await store.getProject(id);
    expect(project.selections.demo_bed?.surfaceOptionId).toBe("surface_stone_river_rock");
    expect(project.regionOutlines?.demo_bed).toEqual(GOOD);
  });

  it.each([
    ["fewer than three points", [[0.1, 0.1], [0.2, 0.2]]],
    ["a point outside the picture", [[0.1, 0.1], [1.4, 0.2], [0.2, 0.3]]],
    ["a negative coordinate", [[0.1, -0.1], [0.2, 0.2], [0.3, 0.3]]],
    ["something that is not a number", [[0.1, "top"], [0.2, 0.2], [0.3, 0.3]]],
    ["a ring that encloses nothing", [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]]],
    ["not an array at all", { x: 1 }],
  ])("refuses %s", async (_label, polygon) => {
    const id = await design();
    const res = await patch(id, { regionId: "demo_bed", polygon });
    expect(res.status).toBe(400);
  });

  it("refuses an outline with absurdly many points", async () => {
    const id = await design();
    const many = Array.from({ length: 900 }, (_, i) => [
      0.5 + Math.cos((i / 900) * Math.PI * 2) * 0.2,
      0.5 + Math.sin((i / 900) * Math.PI * 2) * 0.2,
    ]);
    expect((await patch(id, { regionId: "demo_bed", polygon: many })).status).toBe(400);
  });

  it("refuses a correction to a region that is not in the design", async () => {
    const id = await design();
    const res = await patch(id, { regionId: "no_such_region", polygon: GOOD });
    expect(res.status).toBe(400);
  });
});
