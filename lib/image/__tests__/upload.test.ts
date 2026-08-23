/**
 * The HEIC acceptance path, through the real upload route into a real
 * (in-process) bucket.
 *
 * §6's shape, applied to the iPhone problem: send the photo a customer
 * standing in their yard would actually send, then look at what landed in
 * the object store. The three things that have to be true are the three
 * things that were wrong:
 *
 *   1. It is a JPEG, so it renders in Chrome and not only in Safari.
 *   2. It is the right way up, so the segmentation polygons land on the
 *      right part of a portrait photo.
 *   3. It carries no coordinates.
 *
 * Needs no bucket and no credentials — the bucket is the in-process fake
 * from lib/storage/__tests__/fakeBucket.ts and the store runs on a temp
 * directory, the same pattern the rest of the suite uses.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Point the store at a throwaway directory and force the no-database leg
// BEFORE anything imports it — both resolve at construction.
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "landscape-heic-upload-"));
const DB_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR,
};
process.env.PROJECTS_DATA_DIR = DATA_DIR;
delete process.env.DATABASE_URL;
delete process.env.PGLITE_DATA_DIR;

const storage = await import("../../storage");
const store = await import("../../store/projects");
const { startFakeBucket, useBucket } = await import(
  "../../storage/__tests__/fakeBucket"
);
const { POST: uploadPOST } = await import("../../../app/api/projects/route");
const { GET: customerPhotoGET } = await import(
  "../../../app/api/projects/[projectId]/photo/route"
);
const { jpegHasExif } = await import("../exif");

const HEIC = readFileSync(path.join(__dirname, "fixtures", "portrait-iphone.heic"));

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  delete process.env.PROJECTS_DATA_DIR;
  for (const [name, value] of Object.entries(DB_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  store.resetStore();
  storage.resetPhotoStorage();
});

/** POST multipart/form-data, exactly as /start does from a camera roll. */
async function upload(bytes: Buffer, name: string, type: string): Promise<Response> {
  const form = new FormData();
  form.set("photo", new File([new Uint8Array(bytes)], name, { type }));
  return uploadPOST(
    new Request("http://localhost/api/projects", { method: "POST", body: form }),
  );
}

describe("a photo straight off an iPhone", () => {
  let bucket: Awaited<ReturnType<typeof startFakeBucket>>;
  let restore: () => void;
  let projectId: string;

  beforeAll(async () => {
    bucket = await startFakeBucket();
    restore = useBucket(bucket);
    storage.resetPhotoStorage();

    const response = await upload(HEIC, "IMG_4021.HEIC", "image/heic");
    expect(response.status).toBe(201);
    projectId = ((await response.json()) as { projectId: string }).projectId;
  });

  afterAll(async () => {
    restore();
    storage.resetPhotoStorage();
    await bucket.close();
  });

  it("is accepted — the old list would have answered 415", async () => {
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("lands in the bucket as a JPEG, so it renders in Chrome too", () => {
    const [key] = [...bucket.objects.keys()];
    expect(key).toMatch(/^photos\/[0-9a-f-]{36}\.jpg$/);
    const object = bucket.objects.get(key)!;
    expect(object.contentType).toBe("image/jpeg");
    expect(object.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    // Nothing HEIC-shaped survived: no ISO-BMFF ftyp box in the object.
    expect(object.bytes.subarray(4, 8).toString("latin1")).not.toBe("ftyp");
  });

  it("reaches the object store with no EXIF, and so no coordinates", () => {
    const [key] = [...bucket.objects.keys()];
    expect(jpegHasExif(bucket.objects.get(key)!.bytes)).toBe(false);
  });

  it("serves to the customer's design page as image/jpeg", async () => {
    const response = await customerPhotoGET(
      new Request(`http://localhost/api/projects/${projectId}/photo`),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");

    const served = Buffer.from(await response.arrayBuffer());
    const jpeg = await import("jpeg-js");
    const raw = jpeg.decode(served, { useTArray: true, formatAsRGBA: true });
    // Portrait, the way the phone shows it — the stored HEIC is landscape.
    expect(raw.width).toBeLessThan(raw.height);
  });

  it("records a media type the vision route will accept", async () => {
    const project = await store.getProject(projectId);
    expect(project.photo).toEqual({ fileName: "photo.jpg", mediaType: "image/jpeg" });
  });
});
