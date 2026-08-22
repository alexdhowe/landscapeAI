/**
 * The storage seam, backend by backend.
 *
 * Needs no bucket and no credentials: the S3 leg runs against an
 * in-process fake (fakeBucket.ts) that checks the signature is there and
 * the payload hash matches, and the local leg runs in a temp directory.
 */
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  extensionFor,
  isSafeKey,
  legacyFileLocator,
  mintKey,
  parseLocator,
} from "../locator";
import { createS3Backend, readS3Config, signRequest, type S3Config } from "../s3";
import {
  PhotoObjectNotFoundError,
  StorageBackendError,
  StorageConfigError,
} from "../types";

import { startFakeBucket, useBucket, type FakeBucket } from "./fakeBucket";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe("locators", () => {
  it("mints a key with the extension the media type implies", () => {
    expect(mintKey(extensionFor("image/jpeg"))).toMatch(/^photos\/[0-9a-f-]{36}\.jpg$/);
    expect(extensionFor("image/webp")).toBe("webp");
    // An unknown type still gets a key: the media type on the record is
    // what the browser is told, so the extension is only a filename.
    expect(extensionFor("image/heic")).toBe("bin");
  });

  it("splits into a scheme and a key, and rejects what is not a locator", () => {
    expect(parseLocator("s3:photos/a.jpg")).toEqual({
      scheme: "s3",
      key: "photos/a.jpg",
    });
    expect(parseLocator("inline:photos/a.jpg")?.scheme).toBe("inline");
    expect(parseLocator("photos/a.jpg")).toBeNull();
    expect(parseLocator("inline:")).toBeNull();
    expect(parseLocator("")).toBeNull();
  });

  it("addresses a pre-seam file-store photo where it already sits", () => {
    expect(legacyFileLocator("abc", "photo.png")).toBe("inline:abc/photo.png");
  });

  it("refuses keys that could climb out of a directory or a bucket", () => {
    expect(isSafeKey("photos/a.jpg")).toBe(true);
    expect(isSafeKey("../../etc/passwd")).toBe(false);
    expect(isSafeKey("photos/../../secret")).toBe(false);
    expect(isSafeKey("/etc/passwd")).toBe(false);
    expect(isSafeKey("photos//a.jpg")).toBe(false);
    expect(isSafeKey("photos\\a.jpg")).toBe(false);
    expect(isSafeKey("")).toBe(false);
  });
});

describe("the S3 configuration", () => {
  it("is absent when nothing is set — photos stay in this deployment", () => {
    expect(readS3Config({})).toBeNull();
  });

  it("is an ERROR when half of it is set, never a quiet fall back", () => {
    expect(() =>
      readS3Config({
        S3_BUCKET: "photos",
        S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
      }),
    ).toThrow(StorageConfigError);
  });

  it("rejects an endpoint that is not a URL", () => {
    expect(() =>
      readS3Config({
        S3_BUCKET: "photos",
        S3_ENDPOINT: "example.r2.cloudflarestorage.com",
        S3_ACCESS_KEY_ID: "a",
        S3_SECRET_ACCESS_KEY: "b",
      }),
    ).toThrow(StorageConfigError);
  });

  it("defaults the region and path style, and trims the endpoint", () => {
    const config = readS3Config({
      S3_BUCKET: "photos",
      S3_ENDPOINT: "https://example.r2.cloudflarestorage.com/",
      S3_ACCESS_KEY_ID: "a",
      S3_SECRET_ACCESS_KEY: "b",
    })!;
    expect(config).toMatchObject({
      region: "auto",
      pathStyle: true,
      prefix: "",
      endpoint: "https://example.r2.cloudflarestorage.com",
    });
  });
});

describe("SigV4", () => {
  const config: S3Config = {
    bucket: "photos",
    endpoint: "https://example.r2.cloudflarestorage.com",
    region: "auto",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    prefix: "",
    pathStyle: true,
  };
  const at = new Date("2026-03-01T12:00:00.000Z");

  it("signs a request the way S3 expects to read it", () => {
    const signed = signRequest(config, "PUT", "photos/a.jpg", JPEG, {}, at);
    expect(signed.url).toBe(
      "https://example.r2.cloudflarestorage.com/photos/photos/a.jpg",
    );
    expect(signed.headers["x-amz-date"]).toBe("20260301T120000Z");
    expect(signed.headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260301\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it("is a signature over the payload, not a decoration on it", () => {
    const one = signRequest(config, "PUT", "photos/a.jpg", JPEG, {}, at);
    const other = signRequest(
      config,
      "PUT",
      "photos/a.jpg",
      Buffer.from("different"),
      {},
      at,
    );
    expect(one.headers.Authorization).not.toBe(other.headers.Authorization);
    expect(one.headers["x-amz-content-sha256"]).not.toBe(
      other.headers["x-amz-content-sha256"],
    );
  });

  it("puts the bucket in the host when path style is off", () => {
    const signed = signRequest(
      { ...config, pathStyle: false },
      "GET",
      "photos/a.jpg",
      Buffer.alloc(0),
      {},
      at,
    );
    expect(signed.url).toBe(
      "https://photos.example.r2.cloudflarestorage.com/photos/a.jpg",
    );
  });
});

describe("the S3 backend, against a bucket that is really listening", () => {
  let bucket: FakeBucket;
  let restore: () => void;

  beforeEach(async () => {
    bucket = await startFakeBucket();
    restore = useBucket(bucket);
  });

  afterEach(async () => {
    restore();
    await bucket.close();
  });

  it("round-trips an object, signed, with its content type", async () => {
    const backend = createS3Backend(readS3Config()!);
    await backend.put("photos/one.jpg", JPEG, "image/jpeg");

    expect(bucket.objects.get("photos/one.jpg")?.bytes.equals(JPEG)).toBe(true);
    expect(bucket.objects.get("photos/one.jpg")?.contentType).toBe("image/jpeg");
    expect(bucket.requests.every((r) => r.authorized)).toBe(true);

    const read = await backend.get("photos/one.jpg");
    expect(read?.equals(JPEG)).toBe(true);
  });

  it("reports a missing object as absent, not as an error", async () => {
    const backend = createS3Backend(readS3Config()!);
    expect(await backend.get("photos/missing.jpg")).toBeNull();
  });

  it("surfaces a bucket that refuses, rather than pretending it was empty", async () => {
    const backend = createS3Backend({ ...readS3Config()!, bucket: "not-this-bucket" });
    await expect(backend.put("photos/x.jpg", JPEG, "image/jpeg")).rejects.toThrow(
      StorageBackendError,
    );
  });

  it("applies a prefix to every key", async () => {
    const backend = createS3Backend({ ...readS3Config()!, prefix: "tenant-a" });
    await backend.put("photos/two.jpg", JPEG, "image/jpeg");
    expect([...bucket.objects.keys()]).toEqual(["tenant-a/photos/two.jpg"]);
    expect((await backend.get("photos/two.jpg"))?.equals(JPEG)).toBe(true);
  });

  it("never sends an ACL — the bucket stays private", async () => {
    const signed = signRequest(readS3Config()!, "PUT", "photos/x.jpg", JPEG, {
      "content-type": "image/jpeg",
    });
    expect(Object.keys(signed.headers).map((h) => h.toLowerCase())).not.toContain(
      "x-amz-acl",
    );
  });
});

describe("the local backend", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "landscape-photos-"));
    process.env.PROJECTS_DATA_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.PROJECTS_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it("writes bytes under the data directory and reads them back", async () => {
    const { createFileBackend } = await import("../fileBackend");
    const backend = createFileBackend();
    await backend.put("photos/one.jpg", JPEG, "image/jpeg");
    expect(
      (await fs.readFile(path.join(dir, "photos", "one.jpg"))).equals(JPEG),
    ).toBe(true);
    expect((await backend.get("photos/one.jpg"))?.equals(JPEG)).toBe(true);
    expect(await backend.get("photos/absent.jpg")).toBeNull();
  });

  it("refuses to resolve a key that climbs out of the directory", async () => {
    const { createFileBackend } = await import("../fileBackend");
    const backend = createFileBackend();
    await expect(backend.get("../../etc/passwd")).rejects.toThrow(StorageBackendError);
  });
});

describe("the seam", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "landscape-seam-"));
    process.env.PROJECTS_DATA_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.PROJECTS_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
    const { resetPhotoStorage } = await import("../index");
    resetPhotoStorage();
  });

  it("keeps reading inline photos after a deployment moves to a bucket", async () => {
    const storage = await import("../index");

    // Taken before the bucket existed.
    storage.resetPhotoStorage();
    const before = await storage.putPhoto(JPEG, "image/jpeg");
    expect(before.startsWith("inline:")).toBe(true);

    const bucket = await startFakeBucket();
    const restore = useBucket(bucket);
    storage.resetPhotoStorage();
    try {
      // New photos go to the bucket...
      const after = await storage.putPhoto(JPEG, "image/jpeg");
      expect(after.startsWith("s3:")).toBe(true);
      expect(bucket.objects.size).toBe(1);

      // ...and yesterday's are still readable, because the locator says
      // where the bytes are and the environment only says where new ones go.
      expect((await storage.readPhotoBytes(before)).equals(JPEG)).toBe(true);
      expect((await storage.readPhotoBytes(after)).equals(JPEG)).toBe(true);
    } finally {
      restore();
      await bucket.close();
      storage.resetPhotoStorage();
    }
  });

  it("says so plainly when a photo is in a bucket nobody configured", async () => {
    const storage = await import("../index");
    await expect(storage.readPhotoBytes("s3:photos/gone.jpg")).rejects.toThrow(
      StorageConfigError,
    );
  });

  it("reports missing bytes as missing", async () => {
    const storage = await import("../index");
    await expect(storage.readPhotoBytes("inline:photos/nope.jpg")).rejects.toThrow(
      PhotoObjectNotFoundError,
    );
    await expect(storage.readPhotoBytes("not-a-locator")).rejects.toThrow(
      PhotoObjectNotFoundError,
    );
  });
});
