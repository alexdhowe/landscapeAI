/**
 * Photo locators — minting and parsing. Pure; no I/O, no environment.
 *
 * A locator is `<scheme>:<key>`, and the scheme is the answer to "which
 * backend holds these bytes", recorded at upload time:
 *
 *   inline:photos/<uuid>.jpg   this deployment holds them — a photo_objects
 *                              row with a database, a file under the data
 *                              directory without one.
 *   s3:photos/<uuid>.jpg       the configured bucket holds them.
 *
 * It is not a URL and no browser ever fetches one: reads go through
 * GET /api/projects/[projectId]/photo, and the bucket stays private (see
 * the access note in lib/storage/index.ts).
 *
 * Recording the scheme per photo rather than reading it from the
 * environment is what makes the migration to a bucket survivable: point a
 * running deployment at R2 and photos taken yesterday still resolve,
 * because their locator still says `inline:`.
 *
 * The s3 locator carries the object key and **not** the bucket. The bucket
 * comes from configuration at read time, so a locator that reaches a
 * browser inside a project's JSON names nothing a stranger could act on —
 * and the bucket is private regardless.
 */
import { randomUUID } from "node:crypto";

import type { PhotoLocator } from "./types";

export const INLINE_SCHEME = "inline";
export const S3_SCHEME = "s3";

/** File extension per media type — the upload route's map, mirrored. */
const EXT_BY_MEDIA_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function extensionFor(mediaType: string): string {
  return EXT_BY_MEDIA_TYPE[mediaType] ?? "bin";
}

/**
 * A fresh key for an uploaded photo.
 *
 * Random rather than derived from the project id: an object key is not a
 * capability here (nothing serves the bucket directly), but a key that
 * cannot be computed from a project id keeps it from becoming one if a
 * bucket is ever fronted by a CDN.
 */
export function mintKey(ext: string): string {
  return `photos/${randomUUID()}.${ext}`;
}

export function locatorFor(scheme: string, key: string): PhotoLocator {
  return `${scheme}:${key}`;
}

/**
 * The locator for a photo the file store wrote before this seam existed:
 * `.data/projects/<projectId>/photo.jpg`, which is exactly where the file
 * backend resolves an inline key. Database rows were moved by migration
 * 0004; the file store has no migration runner, so its old projects are
 * addressed where they already sit.
 */
export function legacyFileLocator(projectId: string, fileName: string): PhotoLocator {
  return locatorFor(INLINE_SCHEME, `${projectId}/${fileName}`);
}

export type ParsedLocator = { scheme: string; key: string };

/** Split a locator. Returns null when it is not one. */
export function parseLocator(locator: PhotoLocator): ParsedLocator | null {
  const colon = locator.indexOf(":");
  if (colon <= 0) return null;
  const scheme = locator.slice(0, colon);
  const key = locator.slice(colon + 1);
  if (key.length === 0) return null;
  return { scheme, key };
}

/**
 * Keys reach a filesystem path and a bucket URL. Anything that could climb
 * out of either is not a key we minted, so it is not a key at all.
 */
export function isSafeKey(key: string): boolean {
  if (key.length === 0 || key.length > 512) return false;
  if (key.startsWith("/") || key.includes("//")) return false;
  if (key.includes("\\") || key.includes("\0")) return false;
  return key.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
