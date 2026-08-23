/**
 * The design system, tested.
 *
 * Two rules, both of which the codebase broke before app/globals.css
 * existed and both of which are cheap to break again:
 *
 *  1. **The ramps are accessible.** Every stop this app puts text on has
 *     to clear WCAG AA (4.5:1) against the grounds it is actually used
 *     on. That is a property of the numbers in globals.css, so it is
 *     checked against the numbers rather than asserted in a review.
 *
 *  2. **No component names a raw palette colour.** The point of tokens is
 *     that `neutral-600` cannot come back. This test greps for it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

const FAMILIES = ["bark", "canopy", "survey", "clay", "flag"] as const;
const WHITE = "#ffffff";

function tokens(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const m of CSS.matchAll(/--color-([a-z]+)-(\d+):\s*(#[0-9a-f]{6});/g)) {
    found[`${m[1]}-${m[2]}`] = m[3];
  }
  return found;
}

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("colour ramps", () => {
  const t = tokens();

  it("defines every stop of every family", () => {
    const stops = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    for (const family of FAMILIES) {
      for (const stop of stops) {
        expect(t[`${family}-${stop}`], `${family}-${stop}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  // The rule components follow: body text is 600 or darker.
  it.each(FAMILIES)("%s 600–950 is AA on white and on the page ground", (family) => {
    for (const stop of [600, 700, 800, 900, 950]) {
      const hex = t[`${family}-${stop}`];
      expect(contrast(hex, WHITE), `${family}-${stop} on white`).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(hex, t["bark-50"]),
        `${family}-${stop} on the page ground`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The rule Callout and Badge follow: 800 text on a 50 or 100 ground.
  it.each(FAMILIES)("%s 700–950 is AA on its own 50 and 100 tints", (family) => {
    for (const stop of [700, 800, 900, 950]) {
      const hex = t[`${family}-${stop}`];
      expect(contrast(hex, t[`${family}-50`]), `${family}-${stop} on -50`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex, t[`${family}-100`]), `${family}-${stop} on -100`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The rule Button follows: white label on a 600-or-darker fill.
  it.each(FAMILIES)("white text is AA on %s 600–950", (family) => {
    for (const stop of [600, 700, 800, 900, 950]) {
      expect(
        contrast(WHITE, t[`${family}-${stop}`]),
        `white on ${family}-${stop}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the 400 stop out of AA range, so it is never mistaken for a text colour", () => {
    // Not an accessibility failure — a documented boundary. 400 is for
    // borders, dividers and decorative fills; a component reaching for it
    // as text should feel the seam.
    for (const family of FAMILIES) {
      expect(contrast(t[`${family}-400`], WHITE)).toBeLessThan(4.5);
    }
  });
});

/** Every .ts/.tsx under app/ and components/. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("no component names a raw palette colour", () => {
  // Tailwind's built-in ramps. Any of these in a className means someone
  // picked a colour instead of a meaning.
  const RAW = String.raw`\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|divide|placeholder|accent|caret|shadow)-(?:neutral|gray|grey|slate|zinc|stone|emerald|green|sky|blue|red|rose|amber|yellow|orange|indigo|violet|purple|fuchsia|pink|teal|cyan|lime)-\d{2,3}\b`;

  it.each([["app"], ["components"]])("%s/ is clean", (dir) => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(new RegExp(RAW, "g"))) {
        offenders.push(`${path.relative(ROOT, file)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
