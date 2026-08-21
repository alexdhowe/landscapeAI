/**
 * The pricing engine is a pure function (project-map section 1).
 *
 * It takes quantities, a price book and a config, and returns line items.
 * No database calls, no HTTP, no React. Now that a database exists behind
 * lib/store, this is the invariant most easily broken by accident: a price
 * book is a natural thing to want to "just load" from inside the engine,
 * and the moment it does, the only part of the system that is genuinely
 * unit-testable in isolation stops being so.
 *
 * So this test reads the source. It is the one check that cannot be
 * satisfied by the code merely happening to work.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PRICING_DIR = path.join(process.cwd(), "lib", "pricing");

/** Anything that does I/O, or that reaches a layer that does. */
const FORBIDDEN = [
  { pattern: /from\s+["'][^"']*\/db\//, why: "lib/db" },
  { pattern: /from\s+["'][^"']*\/store\//, why: "lib/store" },
  { pattern: /from\s+["']@\/(app|lib\/db|lib\/store)/, why: "app/ or a storage layer" },
  { pattern: /from\s+["']drizzle-orm/, why: "drizzle-orm" },
  { pattern: /from\s+["']postgres["']/, why: "postgres" },
  { pattern: /from\s+["']next\//, why: "next" },
  { pattern: /from\s+["']react["']/, why: "react" },
  { pattern: /from\s+["']node:(fs|http|https|net)/, why: "node I/O" },
  { pattern: /\bfetch\s*\(/, why: "fetch" },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests may reach for fixtures and the filesystem; the engine may not.
      return entry === "__tests__" ? [] : sourceFiles(full);
    }
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("the pricing engine stays pure", () => {
  const files = sourceFiles(PRICING_DIR);

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => path.relative(process.cwd(), f)))(
    "%s imports nothing that does I/O",
    (relative) => {
      const source = readFileSync(path.join(process.cwd(), relative), "utf8");
      for (const { pattern, why } of FORBIDDEN) {
        expect(pattern.test(source), `${relative} reaches ${why}`).toBe(false);
      }
    },
  );
});
