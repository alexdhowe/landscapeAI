/**
 * Photo bytes as files under the data directory.
 *
 * The fallback's fallback: no database, no bucket, `npm run dev` on a
 * clean checkout and the demo works. Objects live at `<root>/<key>`, and
 * the root defaults to the project store's own data directory — which is
 * why a project the file store wrote before this seam existed still reads
 * back: its legacy locator names the photo where it already sits, next to
 * project.json (lib/storage/locator.ts, legacyFileLocator).
 *
 * Server-only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { INLINE_SCHEME, isSafeKey } from "./locator";
import { StorageBackendError, type PhotoObjectBackend } from "./types";

/**
 * Where objects live: the project store's own data directory, and
 * deliberately not a second setting. The two halves of a no-database
 * deployment stay in one place, a test that points the store at a temp dir
 * points the photos there too — and a legacy locator, which names a file
 * beside its project.json, resolves by construction rather than by
 * agreement between two variables.
 */
function root(): string {
  return process.env.PROJECTS_DATA_DIR ?? path.join(process.cwd(), ".data", "projects");
}

export function createFileBackend(): PhotoObjectBackend {
  const ROOT = root();

  function resolve(key: string): string {
    if (!isSafeKey(key)) {
      throw new StorageBackendError(`Refusing to resolve unsafe photo key "${key}"`);
    }
    const full = path.resolve(ROOT, key);
    // Belt and braces: isSafeKey already rejects traversal, and this
    // rejects anything that still escapes the root (a symlinked root, a
    // key that is absolute on some other platform).
    if (full !== path.resolve(ROOT) && !full.startsWith(path.resolve(ROOT) + path.sep)) {
      throw new StorageBackendError(`Refusing to resolve photo key outside the data directory`);
    }
    return full;
  }

  return {
    name: "file",
    scheme: INLINE_SCHEME,

    async put(key, bytes) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
    },

    async get(key) {
      try {
        return await fs.readFile(resolve(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}
