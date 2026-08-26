/**
 * One name, spelled in one place.
 *
 * The product was called LandscapeAI in three files: the wordmark on every
 * customer surface and the contractor console, the metadata that titles
 * every page, and the OG image drawn for shared links. Renaming to MyScape
 * meant finding all three, and the next rename would have to find them
 * again — a header saying one thing while the browser tab says another is
 * the sort of drift nobody notices until somebody outside the project
 * does.
 *
 * So this reads the surfaces and fails if any of them spells the name for
 * itself. It is a cheap guard against a class of bug that is invisible in
 * review, because each file looks perfectly correct on its own.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BRAND_NAME, HEADLINE, TAGLINE, TITLE_TEMPLATE } from "../brand";

const ROOT = path.join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Every file that puts the product's name in front of somebody. */
const SURFACES = [
  "components/ui/Wordmark.tsx",
  "app/layout.tsx",
  "app/opengraph-image.tsx",
];

describe("the brand name", () => {
  it("is a real name", () => {
    expect(BRAND_NAME).toBe("MyScape");
    expect(BRAND_NAME.trim()).toBe(BRAND_NAME);
  });

  it("frames every page title", () => {
    // Next.js fills %s with the route's own title.
    expect(TITLE_TEMPLATE).toContain("%s");
    expect(TITLE_TEMPLATE).toContain(BRAND_NAME);
  });

  it("names itself in the headline and stays out of the tagline", () => {
    expect(HEADLINE.startsWith(BRAND_NAME)).toBe(true);
    // The tagline says what the product does; repeating the name in it
    // reads as marketing rather than as a sentence.
    expect(TAGLINE).not.toContain(BRAND_NAME);
  });

  it.each(SURFACES)("%s takes the name from here rather than spelling it", (file) => {
    const source = read(file);
    expect(source).toContain("@/lib/site/brand");
    expect(source).not.toContain(`"${BRAND_NAME}"`);
    expect(source).not.toContain(`>${BRAND_NAME}<`);
  });

  it.each(SURFACES)("%s has no trace of the old name", (file) => {
    expect(read(file)).not.toMatch(/landscape ?ai/i);
  });
});
