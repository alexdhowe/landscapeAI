/**
 * The photo storage contract.
 *
 * project-map section 3 puts photos in S3-compatible object storage
 * (R2 / Supabase Storage) and section 5's Photo carries a `url`. These
 * exports are what the rest of the application is allowed to know about
 * where a photo's bytes live: a **locator** string it never parses, and
 * two calls to put and get bytes by one.
 *
 * Two backends implement it, chosen the same way lib/store chooses its
 * own (lib/storage/index.ts):
 *
 *   S3 configured      the object lands in the bucket, and nothing but the
 *                      locator is written to this deployment.
 *   S3 unconfigured    the bytes stay where they are today — a row in
 *                      photo_objects with a database, a file under .data/
 *                      without one — so a clean checkout still runs the
 *                      demo with nothing to provision.
 *
 * Server-only.
 */

/**
 * Where a photo's bytes live. **Opaque above lib/storage**: it is minted
 * here, stored verbatim by the project store, and handed back here to
 * read. Two schemes exist and neither is a URL a browser may fetch —
 * see lib/storage/locator.ts.
 */
export type PhotoLocator = string;

/**
 * A photo as the project store hands it back: the bytes from whichever
 * backend holds them, with the media type from the project record.
 */
export type StoredPhoto = {
  bytes: Buffer;
  mediaType: string;
};

/** Thrown when a locator points at bytes that are not there. */
export class PhotoObjectNotFoundError extends Error {
  constructor(locator: PhotoLocator) {
    super(`No photo bytes at ${locator}`);
    this.name = "PhotoObjectNotFoundError";
  }
}

/**
 * Thrown when object storage is half-configured.
 *
 * Deliberately fatal rather than a quiet fall back to the local path: a
 * deployment that set three of the four S3 variables and silently kept
 * writing customer photos into its own database would look like it was
 * working right up until the disk filled.
 */
export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

/** Thrown when the bucket itself refuses or fails a request. */
export class StorageBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageBackendError";
  }
}

/**
 * One place bytes can live. `scheme` is the locator prefix this backend
 * answers to, which is why a deployment that switches to a bucket can
 * still read every photo it took before: the locator says where the bytes
 * are, the environment only says where new ones go.
 */
export type PhotoObjectBackend = {
  /** For tests and diagnostics — never branched on above this module. */
  readonly name: "s3" | "database" | "file";
  readonly scheme: string;
  /**
   * Write bytes at `key` (the locator's path half). `mediaType` is stored
   * with the object where the backend has somewhere to put it, so a bucket
   * hands back the right Content-Type; the project record is still the
   * authority on what the photo is.
   */
  put(key: string, bytes: Buffer, mediaType: string): Promise<void>;
  /** Read them back, or null when there is nothing at `key`. */
  get(key: string): Promise<Buffer | null>;
};
