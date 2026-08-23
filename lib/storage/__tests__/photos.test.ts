/**
 * The photo acceptance path, through the real route handlers.
 *
 * project-map section 6's shape, applied to storage: upload a photo at
 * /start, confirm the bytes land in the bucket and NOT in this deployment,
 * and confirm both the customer's design page and the contractor's lead
 * view render it. Then unset the storage config and confirm the same flow
 * passes on the fallback.
 *
 * Needs no server, no bucket and no credentials: the bucket is an
 * in-process fake (fakeBucket.ts) and the store runs on a temp directory.
 */
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The store and the file backend both resolve their directories at
// construction — point them at throwaway dirs BEFORE anything imports them,
// and run this file on the no-database leg whatever the environment holds.
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "landscape-photo-store-"));
const DB_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR,
};
process.env.PROJECTS_DATA_DIR = DATA_DIR;
delete process.env.DATABASE_URL;
delete process.env.PGLITE_DATA_DIR;

const storage = await import("../index");
const store = await import("../../store/projects");
const { startFakeBucket, useBucket } = await import("./fakeBucket");
const { contractorCookie } = await import("../../auth/__tests__/helpers");
const { POST: uploadPOST } = await import("../../../app/api/projects/route");
const { GET: customerPhotoGET } = await import(
  "../../../app/api/projects/[projectId]/photo/route"
);
const { GET: leadPhotoGET } = await import(
  "../../../app/api/leads/[projectId]/photo/route"
);

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  delete process.env.PROJECTS_DATA_DIR;
  // Leave the environment as it was found: another suite in this worker
  // must not inherit this file's answers about where anything lives.
  for (const [name, value] of Object.entries(DB_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  store.resetStore();
  storage.resetPhotoStorage();
});

/**
 * A real 2x2 JPEG, encoded here rather than written out as a byte literal.
 *
 * It used to be a twelve-byte SOI-and-JFIF stub, which was enough while
 * the upload route only moved bytes around. The route now normalises what
 * it is handed — orientation baked in, metadata dropped, long edge capped
 * — so its input has to be something a decoder accepts. This one is small
 * enough and clean enough that normalisation has nothing to do, and the
 * route hands the very same buffer to storage; the byte-identity
 * assertions below still mean what they meant.
 */
const { encode: encodeJpeg } = await import("jpeg-js");
const JPEG = Buffer.from(
  encodeJpeg(
    { data: new Uint8Array(2 * 2 * 4).fill(200), width: 2, height: 2 },
    80,
  ).data,
);

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

/** POST multipart/form-data, exactly as /start does. */
async function upload(bytes = JPEG, type = "image/jpeg"): Promise<Response> {
  const form = new FormData();
  form.set("photo", new File([new Uint8Array(bytes)], "yard.jpg", { type }));
  return uploadPOST(
    new Request("http://localhost/api/projects", { method: "POST", body: form }),
  );
}

/** Where the file backend keeps objects: inside the store's data directory. */
const OBJECTS_DIR = path.join(DATA_DIR, "photos");

/** Every file under a directory, relative — "what landed on this machine". */
async function filesUnder(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
}

describe("with object storage configured", () => {
  let bucket: Awaited<ReturnType<typeof startFakeBucket>>;
  let restore: () => void;
  let projectId: string;

  beforeAll(async () => {
    bucket = await startFakeBucket();
    restore = useBucket(bucket);
    storage.resetPhotoStorage();
    expect(storage.photoStorageBackend()).toBe("s3");

    const response = await upload();
    expect(response.status).toBe(201);
    projectId = ((await response.json()) as { projectId: string }).projectId;
  });

  afterAll(async () => {
    restore();
    storage.resetPhotoStorage();
    await bucket.close();
  });

  it("puts the bytes in the bucket", async () => {
    expect([...bucket.objects.keys()]).toHaveLength(1);
    const [key] = [...bucket.objects.keys()];
    expect(key).toMatch(/^photos\/[0-9a-f-]{36}\.jpg$/);
    expect(bucket.objects.get(key)!.bytes.equals(JPEG)).toBe(true);
    expect(bucket.objects.get(key)!.contentType).toBe("image/jpeg");
    // Signed, every one of them.
    expect(bucket.requests.every((request) => request.authorized)).toBe(true);
  });

  it("puts NO bytes in this deployment — only a locator", async () => {
    expect(await filesUnder(OBJECTS_DIR)).toEqual([]);
    // The project directory holds its record and where the photo went, and
    // that is all: the JSON is what the customer's browser is served, and
    // the locator is deliberately not in it.
    expect(await filesUnder(path.join(DATA_DIR, projectId))).toEqual([
      "photo.json",
      "project.json",
    ]);
    const sidecar = JSON.parse(
      await fs.readFile(path.join(DATA_DIR, projectId, "photo.json"), "utf8"),
    ) as { locator: string };
    expect(sidecar.locator.startsWith("s3:")).toBe(true);
    // The locator names an object key and never the bucket.
    expect(sidecar.locator).not.toContain(bucket.bucket);
    const project = await store.getProject(projectId);
    expect(project.photo).toEqual({ fileName: "photo.jpg", mediaType: "image/jpeg" });
  });

  it("renders on the customer's design page", async () => {
    const response = await customerPhotoGET(
      new Request(`http://localhost/api/projects/${projectId}/photo`),
      params(projectId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(Buffer.from(await response.arrayBuffer()).equals(JPEG)).toBe(true);
  });

  it("renders in the contractor's lead view — through the auth guard", async () => {
    const unauthenticated = await leadPhotoGET(
      new Request(`http://localhost/api/leads/${projectId}/photo`),
      params(projectId),
    );
    expect(unauthenticated.status).toBe(401);

    const response = await leadPhotoGET(
      new Request(`http://localhost/api/leads/${projectId}/photo`, {
        headers: { cookie: await contractorCookie() },
      }),
      params(projectId),
    );
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(JPEG)).toBe(true);
  });

  it("404s a project that does not exist, without asking the bucket", async () => {
    const before = bucket.requests.length;
    const response = await customerPhotoGET(
      new Request("http://localhost/api/projects/x/photo"),
      params("11111111-2222-4333-8444-555555555555"),
    );
    expect(response.status).toBe(404);
    expect(bucket.requests.length).toBe(before);
  });
});

describe("with no object storage configured — the clean-checkout fallback", () => {
  let projectId: string;

  beforeAll(async () => {
    storage.resetPhotoStorage();
    expect(storage.photoStorageBackend()).toBe("file");
    const response = await upload();
    expect(response.status).toBe(201);
    projectId = ((await response.json()) as { projectId: string }).projectId;
  });

  it("keeps the bytes on this machine", async () => {
    const files = await filesUnder(OBJECTS_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect((await fs.readFile(path.join(OBJECTS_DIR, files[0]))).equals(JPEG)).toBe(true);
  });

  it("renders on both surfaces, the same as it does from a bucket", async () => {
    const customer = await customerPhotoGET(
      new Request(`http://localhost/api/projects/${projectId}/photo`),
      params(projectId),
    );
    expect(customer.status).toBe(200);
    expect(Buffer.from(await customer.arrayBuffer()).equals(JPEG)).toBe(true);

    const contractor = await leadPhotoGET(
      new Request(`http://localhost/api/leads/${projectId}/photo`, {
        headers: { cookie: await contractorCookie() },
      }),
      params(projectId),
    );
    expect(contractor.status).toBe(200);
    expect(Buffer.from(await contractor.arrayBuffer()).equals(JPEG)).toBe(true);
  });

  it("still serves a project written before the storage seam existed", async () => {
    // What the file store used to write: the bytes beside project.json,
    // with nothing recording where they were.
    const legacyId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const dir = path.join(DATA_DIR, legacyId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "photo.jpg"), JPEG);
    await fs.writeFile(
      path.join(dir, "project.json"),
      JSON.stringify({
        id: legacyId,
        createdAt: new Date().toISOString(),
        status: "playing",
        photo: { fileName: "photo.jpg", mediaType: "image/jpeg" },
        segmentation: { status: "pending" },
        selections: {},
        marketContext: "residential",
      }),
    );

    const response = await customerPhotoGET(
      new Request(`http://localhost/api/projects/${legacyId}/photo`),
      params(legacyId),
    );
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(JPEG)).toBe(true);
  });
});

describe("with object storage half configured", () => {
  it("refuses the upload rather than quietly writing the photo somewhere else", async () => {
    process.env.S3_BUCKET = "landscape-photos";
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    storage.resetPhotoStorage();
    const before = await filesUnder(OBJECTS_DIR);
    try {
      const response = await upload();
      expect(response.status).toBe(503);
      expect(await filesUnder(OBJECTS_DIR)).toEqual(before);
    } finally {
      delete process.env.S3_BUCKET;
      delete process.env.S3_ENDPOINT;
      storage.resetPhotoStorage();
    }
  });
});
