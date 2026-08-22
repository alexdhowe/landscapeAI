/**
 * Photo bytes as rows, in the deployment's own Postgres.
 *
 * This is what "the bytes are in the database" means now that the seam
 * exists: not a bytea column hanging off the photo record, but a
 * key → bytes table — an object store that happens to be a database you
 * already provisioned. `photos.bytes` moved here wholesale in migration
 * 0004 and the column is gone.
 *
 * Server-only.
 */
import { getDb } from "../db/client";
import * as q from "../db/queries";

import { INLINE_SCHEME, isSafeKey } from "./locator";
import { StorageBackendError, type PhotoObjectBackend } from "./types";

export function createDatabaseBackend(): PhotoObjectBackend {
  function check(key: string): string {
    if (!isSafeKey(key)) {
      throw new StorageBackendError(`Refusing to resolve unsafe photo key "${key}"`);
    }
    return key;
  }

  return {
    name: "database",
    scheme: INLINE_SCHEME,

    async put(key, bytes, mediaType) {
      await q.putPhotoObject(await getDb(), check(key), bytes, mediaType);
    },

    async get(key) {
      return q.findPhotoObject(await getDb(), check(key));
    },
  };
}
