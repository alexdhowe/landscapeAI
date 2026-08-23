/**
 * The aerial leg is licensed, not built.
 *
 * Two decisions from project-map §3 gate `/design/[projectId]/locate` and
 * everything behind it — the imagery licence (deriving and *selling*
 * measurements is what this product does with the tiles) and the
 * geocoder's commercial terms. Neither is a build session's to make, so
 * what these tests assert is that an undeclared licence keeps the surface
 * off, and that the rest of the funnel does not need it.
 *
 * That second half is the important one: §3 already specifies the customer
 * who declines to give an address, and this session assumes nothing about
 * that path — it drives it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

process.env.PROJECTS_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "landscape-locate-test-"),
);

const { locateBlockers, locateEnabled } = await import("../gate");
const store = await import("../../store/projects");
const { demoSegmentation } = await import("../../vision/demo");
const { INTERNAL_ONLY_MARKERS } = await import("../../lead/snapshot");
const { POST: geocodePOST } = await import("../../../app/api/geocode/route");
const { POST: aerialPOST, DELETE: aerialDELETE } = await import(
  "../../../app/api/projects/[projectId]/aerial/route"
);
const { POST: pricePOST } = await import("../../../app/api/price/route");
const { POST: submitPOST } = await import(
  "../../../app/api/projects/[projectId]/submit/route"
);
const { GET: snapshotGET } = await import(
  "../../../app/api/projects/[projectId]/snapshot/route"
);
const { PATCH: projectPATCH } = await import(
  "../../../app/api/projects/[projectId]/route"
);

const LICENCE_VARS = [
  "NEXT_PUBLIC_SATELLITE_LICENCE",
  "NEXT_PUBLIC_SATELLITE_TILE_URL",
  "NEXT_PUBLIC_GEOCODER_LICENCE",
  "GEOCODER",
] as const;

afterEach(() => {
  for (const name of LICENCE_VARS) delete process.env[name];
});

afterAll(() => {
  rmSync(process.env.PROJECTS_DATA_DIR!, { recursive: true, force: true });
});

/** Both terms declared — what a deployment that has signed licences looks like. */
function licensed() {
  process.env.NEXT_PUBLIC_SATELLITE_TILE_URL = "https://tiles.example.com/{z}/{y}/{x}";
  process.env.NEXT_PUBLIC_SATELLITE_LICENCE = "permitted";
  process.env.NEXT_PUBLIC_GEOCODER_LICENCE = "permitted";
}

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

const jsonRequest = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("the aerial leg gate", () => {
  it("is off out of the box, and says both licences are why", () => {
    expect(locateEnabled({})).toBe(false);
    expect(locateBlockers({})).toEqual(["imagery", "geocoder"]);
  });

  it("stays off while either licence is undeclared", () => {
    expect(
      locateBlockers({
        imagery: { tileUrl: "https://tiles.example.com/{z}/{y}/{x}", derivativeMeasurements: "permitted" },
        geocoderLicence: "",
      }),
    ).toEqual(["geocoder"]);

    expect(locateBlockers({ geocoderLicence: "permitted" })).toEqual(["imagery"]);
  });

  it("will not read a refusal, or a typo, as a yes", () => {
    for (const declared of ["prohibited", "yes", "true", "PERMITTED ", "unreviewed", undefined]) {
      expect(
        locateEnabled({
          imagery: { tileUrl: "https://t.example/{z}/{y}/{x}", derivativeMeasurements: "permitted" },
          geocoderLicence: declared,
        }),
        `geocoder licence ${String(declared)}`,
      ).toBe(false);
    }
  });

  it("opens only when both terms are declared permitted", () => {
    expect(
      locateEnabled({
        imagery: { tileUrl: "https://tiles.example.com/{z}/{y}/{x}", derivativeMeasurements: "permitted" },
        geocoderLicence: "permitted",
      }),
    ).toBe(true);
  });
});

describe("the routes behind the gate", () => {
  it("answers 404 while the licences are undeclared, so hiding the page is not the whole gate", async () => {
    const geocode = await geocodePOST(
      jsonRequest("/api/geocode", "POST", { query: "1 Main St, Madison WI" }),
    );
    expect(geocode.status).toBe(404);

    const draw = await aerialPOST(
      jsonRequest("/api/projects/some-id/aerial", "POST", {
        photoRegionId: "demo_bed",
        ring: [
          [-89.4, 43.07],
          [-89.3999, 43.07],
          [-89.3999, 43.0701],
          [-89.4, 43.0701],
        ],
      }),
      params("some-id"),
    );
    expect(draw.status).toBe(404);

    const erase = await aerialDELETE(
      new Request("http://localhost/api/projects/some-id/aerial?photoRegionId=demo_bed", {
        method: "DELETE",
      }),
      params("some-id"),
    );
    expect(erase.status).toBe(404);
  });

  it("serves the geocoder once the terms are declared", async () => {
    licensed();
    // GEOCODER=demo keeps this test off the network, which is the same
    // fallback a deployment gets when the geocoder is unreachable.
    process.env.GEOCODER = "demo";
    const res = await geocodePOST(
      jsonRequest("/api/geocode", "POST", { query: "1 Main St, Madison WI" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("demo");
    expect(body.candidates).toHaveLength(1);
  });
});

describe("the funnel without the aerial leg", () => {
  it("designs, prices and sends a lead with the leg gated off", async () => {
    // Exactly the customer §3 describes — the one who will not give an
    // address — except that here the app is not offering to take one.
    expect(locateEnabled()).toBe(false);

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

    // The band appears, at typology width, with no measurement anywhere.
    const priced = await pricePOST(
      jsonRequest("/api/price", "POST", { projectId: project.id }),
    );
    expect(priced.status).toBe(200);
    const payload = await priced.json();
    expect(payload.band.basis).toBe("typology");
    expect(payload.band.low).toBeGreaterThan(0);
    expect(payload.band.high).toBeGreaterThan(payload.band.low);

    // Declining the address is still a first-class answer.
    const declined = await projectPATCH(
      jsonRequest(`/api/projects/${project.id}`, "PATCH", { addressDeclined: true }),
      params(project.id),
    );
    expect(declined.status).toBe(200);

    // And the lead still lands, with a frozen snapshot that leaks nothing.
    const submitted = await submitPOST(
      jsonRequest(`/api/projects/${project.id}/submit`, "POST", {
        contact: { name: "Dana Homeowner", email: "dana@example.com" },
      }),
      params(project.id),
    );
    expect(submitted.status).toBe(201);
    const customerSawBytes = await submitted.text();
    for (const marker of INTERNAL_ONLY_MARKERS) {
      expect(customerSawBytes.includes(marker), `customer bytes contain "${marker}"`).toBe(false);
    }

    const reread = await snapshotGET(
      new Request(`http://localhost/api/projects/${project.id}/snapshot`),
      params(project.id),
    );
    expect(await reread.text()).toBe(customerSawBytes);

    const leads = await store.listLeads();
    expect(leads.map((l) => l.id)).toContain(project.id);
  });
});
