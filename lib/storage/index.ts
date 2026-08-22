/**
 * Photo storage — the single seam between the application and a photo's
 * bytes.
 *
 * These exports are the contract (project-map section 3: "Storage —
 * S3-compatible (R2 / Supabase Storage) — Photos"). Nothing above this
 * module knows where a photo lives; it holds a locator it does not parse
 * and hands it back to read.
 *
 * Backends, chosen the same way lib/store chooses its own:
 *
 *   S3_* configured    the object goes to the bucket. Nothing but the
 *                      locator is written to this deployment.
 *   S3_* unconfigured  the bytes stay where they were before this seam:
 *                      a photo_objects row with a database, a file under
 *                      the data directory without one. A clean checkout
 *                      still runs the demo with nothing to provision.
 *
 * Reads dispatch on the locator's scheme rather than on the environment,
 * so a deployment can start writing to a bucket without stranding
 * everything it stored before.
 *
 * ---------------------------------------------------------------------
 * Who may read a photo
 * ---------------------------------------------------------------------
 *
 * A photo of somebody's house is not a price band, so this is a decision
 * and not an accident. Three options were on the table — the unguessable
 * URL that already existed, a signed URL with an expiry, and a per-project
 * read token. What is implemented:
 *
 *   1. **The bucket is private, always.** No public object URL is ever
 *      minted or handed to a browser, and no ACL is sent on upload. Every
 *      read goes through GET /api/projects/[projectId]/photo, which is the
 *      one place the rule can be changed later. This is the part that is
 *      not negotiable: an S3-backed photo that a stranger can fetch
 *      directly is strictly worse than the bytea column it replaced.
 *
 *   2. **The customer read stays an unguessable URL, deliberately.** The
 *      customer never signs in (see the auth section of the README) and
 *      their design page has to render the photo. The project UUID is
 *      already the bearer credential for everything else about that
 *      project — GET /api/projects/[id] returns the whole design, and the
 *      snapshot and quote routes are open to the same UUID. A signed URL
 *      or a token on the photo alone would not raise the bar: whoever
 *      holds the UUID can load the design page and be handed a fresh one.
 *      It would only move the credential.
 *
 *   3. **The contractor read goes through the auth guard.** The console
 *      reads photos at GET /api/leads/[projectId]/photo, which requires a
 *      session, rather than borrowing the customer's open route. That is
 *      what makes (2) revisable: the day the customer route grows a token,
 *      the contractor side does not have to be untangled from it first.
 *
 * The assumption behind (2), stated so it can be overruled: a photo is no
 * more sensitive than the design, address and contact details that hang
 * off the same UUID. If that is wrong, the fix is a per-project token
 * issued at upload and required by **every** customer-facing project
 * route, not by this one — photos alone would be security theatre over an
 * open snapshot endpoint.
 *
 * Server-only.
 */
import { isDatabaseConfigured } from "../db/client";

import { createDatabaseBackend } from "./databaseBackend";
import { createFileBackend } from "./fileBackend";
import {
  INLINE_SCHEME,
  S3_SCHEME,
  extensionFor,
  locatorFor,
  mintKey,
  parseLocator,
} from "./locator";
import { createS3Backend, readS3Config } from "./s3";
import {
  PhotoObjectNotFoundError,
  StorageConfigError,
  type PhotoLocator,
  type PhotoObjectBackend,
} from "./types";

export { legacyFileLocator, extensionFor } from "./locator";
export {
  PhotoObjectNotFoundError,
  StorageBackendError,
  StorageConfigError,
} from "./types";
export type { PhotoLocator, StoredPhoto } from "./types";

let inline: PhotoObjectBackend | null = null;
let object: PhotoObjectBackend | null | undefined;

/** The local backend: a table with a database, files without one. */
function inlineBackend(): PhotoObjectBackend {
  inline ??= isDatabaseConfigured() ? createDatabaseBackend() : createFileBackend();
  return inline;
}

/** The bucket, or null when none is configured. Throws if half-configured. */
function objectBackend(): PhotoObjectBackend | null {
  if (object === undefined) {
    const config = readS3Config();
    object = config ? createS3Backend(config) : null;
  }
  return object;
}

/**
 * Which backend new uploads land in — "s3", "database" or "file". For
 * diagnostics and for the tests that assert the bytes went where the
 * configuration said they would.
 */
export function photoStorageBackend(): "s3" | "database" | "file" {
  return (objectBackend() ?? inlineBackend()).name;
}

/** Drop the resolved backends. For tests that re-point the environment. */
export function resetPhotoStorage(): void {
  inline = null;
  object = undefined;
}

function backendFor(scheme: string): PhotoObjectBackend {
  if (scheme === S3_SCHEME) {
    const bucket = objectBackend();
    if (!bucket) {
      throw new StorageConfigError(
        "This photo is in object storage and no bucket is configured — set S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
      );
    }
    return bucket;
  }
  if (scheme === INLINE_SCHEME) return inlineBackend();
  throw new StorageConfigError(`Unknown photo storage scheme "${scheme}"`);
}

/**
 * Store an uploaded photo and return its locator.
 *
 * Called before the project row exists, so a failed project write leaves
 * an unreferenced object rather than a project whose photo 404s. That is
 * the right way round: the first is garbage, the second is a broken lead.
 */
export async function putPhoto(
  bytes: Buffer,
  mediaType: string,
): Promise<PhotoLocator> {
  const backend = objectBackend() ?? inlineBackend();
  const key = mintKey(extensionFor(mediaType));
  await backend.put(key, bytes, mediaType);
  return locatorFor(backend.scheme, key);
}

/** Read a photo's bytes back. Throws when the locator points at nothing. */
export async function readPhotoBytes(locator: PhotoLocator): Promise<Buffer> {
  const parsed = parseLocator(locator);
  if (!parsed) throw new PhotoObjectNotFoundError(locator);
  const bytes = await backendFor(parsed.scheme).get(parsed.key);
  if (!bytes) throw new PhotoObjectNotFoundError(locator);
  return bytes;
}
