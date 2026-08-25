/**
 * Reading `.env.local` from a plain Node script.
 *
 * Next.js loads this file itself, so the app and `npm run shots` (which
 * drives a running server) never had to think about it. A `tsx` script
 * does not get that for free: `npm run segment` read `process.env`, found
 * no `ANTHROPIC_API_KEY`, and cheerfully reported that there was no key on
 * a machine where the app three terminals over was using one. A diagnostic
 * that lies about its own inputs is worse than no diagnostic.
 *
 * Deliberately not a dotenv dependency, for the reason `doctor` had first:
 * this has to work on a checkout where `npm ci` is the step that failed.
 * The parse is the same one doctor has always used, moved here so the two
 * cannot come to disagree about what the file says.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanKey } from "../vision/credentials";

/** Parse KEY=VALUE lines. Blank lines and `#` comments are skipped. */
export function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = cleanKey(trimmed.slice(eq + 1));
  }
  return values;
}

export const envFilePath = (root = process.cwd()) => path.join(root, ".env.local");

/**
 * Merge `.env.local` into `process.env` for a script run.
 *
 * A value already in the real environment wins, so
 * `ANTHROPIC_API_KEY=… npm run segment` overrides the file the same way it
 * overrides it for the server. Returns the path read and what it set, so a
 * script can say where its inputs came from rather than leaving someone to
 * guess which of two keys is in play.
 */
export function loadEnvLocal(root = process.cwd()): {
  path: string;
  found: boolean;
  applied: string[];
} {
  const file = envFilePath(root);
  if (!existsSync(file)) return { path: file, found: false, applied: [] };
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(file, "utf8")))) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
      applied.push(key);
    }
  }
  return { path: file, found: true, applied };
}
