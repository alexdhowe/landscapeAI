/**
 * Reading `.env.local` from a script.
 *
 * Written against the way `npm run segment` shipped broken for one commit:
 * Next.js loads this file, `tsx` does not, so the diagnostic announced
 * "NO ANTHROPIC_API_KEY" on a machine whose server three terminals over
 * was happily using one. A tool that lies about its own inputs sends
 * someone to debug the wrong thing.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEnvLocal, parseEnvFile } from "../localFile";

describe("parseEnvFile", () => {
  it("reads KEY=VALUE lines", () => {
    expect(parseEnvFile("ANTHROPIC_API_KEY=sk-ant-abc\nAUTH_SECRET=shhh")).toEqual({
      ANTHROPIC_API_KEY: "sk-ant-abc",
      AUTH_SECRET: "shhh",
    });
  });

  it("skips blanks and comments", () => {
    expect(parseEnvFile("\n# a comment\n\nA=1\n")).toEqual({ A: "1" });
  });

  it("keeps '=' inside a value", () => {
    // AUTH_SECRET is base64 and routinely ends in one.
    expect(parseEnvFile("AUTH_SECRET=abc123==").AUTH_SECRET).toBe("abc123==");
  });

  it("strips the quotes and whitespace a paste brings with it", () => {
    expect(parseEnvFile('ANTHROPIC_API_KEY="sk-ant-abc"  ').ANTHROPIC_API_KEY).toBe("sk-ant-abc");
  });
});

describe("loadEnvLocal", () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "landscape-env-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of ["ANTHROPIC_API_KEY", "VISION_REFINE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("puts the file's values into the environment", () => {
    delete process.env.ANTHROPIC_API_KEY;
    writeFileSync(path.join(dir, ".env.local"), "ANTHROPIC_API_KEY=sk-ant-from-file\n");
    const result = loadEnvLocal(dir);
    expect(result.found).toBe(true);
    expect(result.applied).toContain("ANTHROPIC_API_KEY");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-from-file");
  });

  it("lets the real environment win, the same way it does for the server", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-from-shell";
    writeFileSync(path.join(dir, ".env.local"), "ANTHROPIC_API_KEY=sk-ant-from-file\n");
    const result = loadEnvLocal(dir);
    expect(result.applied).not.toContain("ANTHROPIC_API_KEY");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-from-shell");
  });

  it("says it found nothing rather than throwing when there is no file", () => {
    expect(loadEnvLocal(dir)).toMatchObject({ found: false, applied: [] });
  });

  it("reports the path it read, so a script can say where its key came from", () => {
    expect(loadEnvLocal(dir).path).toBe(path.join(dir, ".env.local"));
  });
});
