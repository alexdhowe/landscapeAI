/**
 * The route that puts a plant in where the photograph had none.
 *
 * The guardrails this exists to keep are the same three every other plant
 * decision keeps, and all three have to hold against a browser that was
 * told anything: the plant must be one this book can install, it must be
 * one that belongs in the area it landed in, and where it lands is
 * decided from the outlines on the server rather than from wherever the
 * pointer happened to be.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.PROJECTS_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "landscape-add-plant-"),
);

const { plantMetaBySku, wiPriceBook } = await import("../../../seed/pricebook.seed");
const { plantOptionsFor } = await import("../../catalog/plants");
const store = await import("../../store/projects");
const { PATCH } = await import("../../../app/api/projects/[projectId]/route");

afterAll(() => {
  rmSync(process.env.PROJECTS_DATA_DIR!, { recursive: true, force: true });
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const CATALOG = plantOptionsFor(wiPriceBook, plantMetaBySku);
const SHRUB = CATALOG.find((o) => o.category === "shrub")!;
const TREE = CATALOG.find((o) => o.category === "tree")!;

const SEGMENTATION = {
  status: "ready" as const,
  source: "demo" as const,
  regions: [
    {
      id: "bed",
      kind: "bed" as const,
      label: "Bed",
      polygon: [
        [0.1, 0.5],
        [0.9, 0.5],
        [0.9, 0.8],
        [0.1, 0.8],
      ] as [number, number][],
      confidence: 0.9,
    },
    {
      id: "house_bed",
      kind: "foundation_planting" as const,
      label: "Foundation planting",
      polygon: [
        [0.1, 0.1],
        [0.9, 0.1],
        [0.9, 0.3],
        [0.1, 0.3],
      ] as [number, number][],
      confidence: 0.9,
    },
    {
      id: "lawn",
      kind: "turf" as const,
      label: "Lawn",
      polygon: [
        [0.0, 0.85],
        [1.0, 0.85],
        [1.0, 1.0],
        [0.0, 1.0],
      ] as [number, number][],
      confidence: 0.9,
    },
  ],
  verticalElements: [],
  cannotSee: [],
};

async function project() {
  const created = await store.createProject(JPEG, "image/jpeg", "jpg");
  await store.setSegmentation(created.id, SEGMENTATION);
  return created.id;
}

function patch(id: string, body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId: id }) },
  );
}

describe("PATCH { addPlant }", () => {
  let id: string;
  beforeEach(async () => {
    id = await project();
  });

  it("puts a plant in the bed it was dropped on", async () => {
    const res = await patch(id, {
      addPlant: { optionId: SHRUB.id, at: [0.5, 0.65] },
    });
    expect(res.status).toBe(200);
    const design = await res.json();
    expect(design.addedPlants).toHaveLength(1);
    expect(design.addedPlants[0].regionId).toBe("bed");
    expect(design.addedPlants[0].optionId).toBe(SHRUB.id);
  });

  it("decides the bed from the outlines, not from what the browser said", async () => {
    // No region id is sent at all: the drop is a point, and the point is
    // resolved here.
    const res = await patch(id, {
      addPlant: { optionId: SHRUB.id, at: [0.5, 0.2] },
    });
    expect((await res.json()).addedPlants[0].regionId).toBe("house_bed");
  });

  it("refuses a plant dropped on the lawn", async () => {
    const res = await patch(id, {
      addPlant: { optionId: SHRUB.id, at: [0.5, 0.95] },
    });
    expect(res.status).toBe(400);
  });

  it("refuses a tree against the house", async () => {
    // The palette is filtered for this, and the route does not trust it.
    const res = await patch(id, {
      addPlant: { optionId: TREE.id, at: [0.5, 0.2] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not belong/i);
  });

  it("refuses a plant this price book cannot install", async () => {
    const res = await patch(id, {
      addPlant: { optionId: "plantsku_invented", at: [0.5, 0.65] },
    });
    expect(res.status).toBe(400);
  });

  it("refuses a malformed body", async () => {
    expect((await patch(id, { addPlant: {} })).status).toBe(400);
    expect(
      (await patch(id, { addPlant: { optionId: SHRUB.id, at: [2, 2] } })).status,
    ).toBe(400);
    expect(
      (await patch(id, { addPlant: { optionId: SHRUB.id } })).status,
    ).toBe(400);
  });

  it("moves one, and takes one back out", async () => {
    const added = await (
      await patch(id, { addPlant: { optionId: SHRUB.id, at: [0.5, 0.65] } })
    ).json();
    const plantId = added.addedPlants[0].id;

    const moved = await (
      await patch(id, { addedPlantId: plantId, plantAt: [0.3, 0.7] })
    ).json();
    expect(moved.addedPlants[0].at).toEqual([0.3, 0.7]);

    const removed = await (
      await patch(id, { addedPlantId: plantId, plantAt: null })
    ).json();
    expect(removed.addedPlants ?? []).toEqual([]);
  });

  it("confines a move to the bed the plant belongs to", async () => {
    const added = await (
      await patch(id, { addPlant: { optionId: SHRUB.id, at: [0.5, 0.65] } })
    ).json();
    const moved = await (
      await patch(id, { addedPlantId: added.addedPlants[0].id, plantAt: [0.5, 0.99] })
    ).json();
    expect(moved.addedPlants[0].at[1]).toBeLessThan(0.8);
  });

  it("refuses to move a plant this design does not have", async () => {
    const res = await patch(id, { addedPlantId: "added_nope", plantAt: [0.5, 0.6] });
    expect(res.status).toBe(400);
  });
});
