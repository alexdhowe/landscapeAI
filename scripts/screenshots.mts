/**
 * Look at the thing. Dev-only.
 *
 * You cannot design what you cannot look at, and eight sessions of this
 * build went by without anyone opening it on a phone. This drives the
 * customer flow end to end in a real browser at both viewports, captures
 * every surface, and audits the two rules that are easy to state and easy
 * to break:
 *
 *   - no horizontal scroll at 390px
 *   - no interactive element under 44 CSS px in either dimension
 *   - nothing visible that the markup says is hidden
 *
 * That third one is not a style rule, it is the bug it was written for:
 * Tailwind emits its display utilities in a fixed order, so a `hidden` on
 * an element whose class list also resolves to `inline-flex` (which every
 * `buttonClass` does) loses, silently, and the element ships visible. Only
 * a browser can tell you that, because only a browser knows which media
 * queries are matching.
 *
 * It is NOT part of `npm test`, which must stay browser-free. Run it
 * against a server you have already started:
 *
 *   npm run build && npm start &
 *   npm run shots
 *   npm run shots -- --base http://localhost:3000 --photo ./some.heic
 *
 * Chromium is expected to be the one Playwright already resolves; in the
 * Claude Code web environment that is PLAYWRIGHT_BROWSERS_PATH.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

type Viewport = { name: string; width: number; height: number; mobile: boolean };

const VIEWPORTS: Viewport[] = [
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
];

/**
 * Tailwind variants that gate `display`, and the query each one means.
 * Used by the hidden-element audit to work out whether an element that
 * says `hidden` has a variant currently re-showing it.
 */
const DISPLAY_VARIANTS: Record<string, string> = {
  coarse: "(pointer: coarse)",
  fine: "(pointer: fine)",
  sm: "(min-width: 40rem)",
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
  xl: "(min-width: 80rem)",
  "2xl": "(min-width: 96rem)",
};

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
}
const BASE = args.get("base") ?? process.env.SHOTS_BASE_URL ?? "http://localhost:3000";
const PHOTO = args.get("photo") ?? process.env.SHOTS_PHOTO ?? "";
const OUT = args.get("out") ?? ".shots";
const EMAIL = process.env.CONTRACTOR_EMAIL ?? "";
const PASSWORD = process.env.CONTRACTOR_PASSWORD ?? "";

type Finding = { where: string; what: string };
const findings: Finding[] = [];

/** The audit. Runs on whatever page is currently open. */
async function audit(page: Page, where: string, viewport: Viewport) {
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  if (coarse !== viewport.mobile) {
    findings.push({
      where,
      what: `pointer emulation lost: (pointer: coarse) is ${coarse}, expected ${viewport.mobile} — this shot is of the wrong branch`,
    });
  }

  if (viewport.mobile) {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const offenders: string[] = [];
      if (doc.scrollWidth > doc.clientWidth + 1) {
        for (const el of document.querySelectorAll<HTMLElement>("body *")) {
          const box = el.getBoundingClientRect();
          if (box.right > doc.clientWidth + 1 || box.left < -1) {
            offenders.push(
              `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 60)}`,
            );
            if (offenders.length >= 5) break;
          }
        }
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
      }
      return null;
    });
    if (overflow) {
      findings.push({
        where,
        what: `horizontal scroll: ${overflow.scrollWidth}px in ${overflow.clientWidth}px — ${overflow.offenders.join(", ")}`,
      });
    }
  }

  // Anything the markup says is hidden had better be hidden. This is the
  // `hidden`-loses-to-`inline-flex` class of bug, and it is invisible to a
  // reviewer because the class attribute reads correctly.
  const shown = await page.evaluate((variants: Record<string, string>) => {
    const results: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[class*='hidden']")) {
      const classes = el.className?.toString().split(/\s+/) ?? [];
      // `hidden` with no variant prefix: the base state is "not displayed".
      if (!classes.includes("hidden")) continue;
      // …unless a variant that is matching right now sets a display.
      const reshown = classes.some((c) => {
        const [variant, utility] = c.split(":");
        if (!utility || !(variant in variants)) return false;
        if (!/^(block|flex|inline-flex|inline|inline-block|grid|contents|table)$/.test(utility)) {
          return false;
        }
        return matchMedia(variants[variant]).matches;
      });
      const display = getComputedStyle(el).display;
      if (!reshown && display !== "none") {
        results.push(
          `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 32)}" ` +
            `says hidden but computes ${display}`,
        );
      }
    }
    return [...new Set(results)];
  }, DISPLAY_VARIANTS);
  for (const item of shown) findings.push({ where, what: item });

  // Anything positioned over the photo has to land where its coordinates
  // say. This is measured, not eyeballed: a label naming a plant that sits
  // half its own width to the left points at a different plant, and on a
  // photograph nobody can tell that from the model having placed the plant
  // badly — which is exactly how it survived a review.
  //
  // The cause was a composition rule, not a typo: Tailwind's translate
  // utilities set the standalone CSS `translate` property, so a
  // `-translate-x-1/2` class and an inline `transform: translate(-50%, …)`
  // do not override each other, they add up.
  // NOTE: no named inner functions in here. tsx compiles this file with
  // esbuild, which annotates named function expressions with a `__name`
  // helper; the helper does not exist in the page, so a serialized
  // evaluate that declares one dies with "__name is not defined".
  const misplaced = await page.evaluate(() => {
    const results: string[] = [];
    const figure = document.querySelector("figure");
    const img = figure?.querySelector("img");
    if (!figure || !img) return results;
    const frame = img.getBoundingClientRect();
    if (frame.width === 0) return results;

    for (const el of figure.querySelectorAll<HTMLElement>("[data-plant]")) {
      const expected = el.dataset.cx === undefined ? NaN : Number(el.dataset.cx);
      if (Number.isNaN(expected)) continue;
      const r = el.getBoundingClientRect();
      const x = (r.left + r.width / 2 - frame.left) / frame.width;
      if (Math.abs(x - expected) > 0.005) {
        results.push(
          `plant ${el.dataset.plant} renders at x=${x.toFixed(3)}, data says ${expected}`,
        );
      }
    }

    // The hover label, when one is showing, has to share its plant's x.
    const label = figure.querySelector<HTMLElement>("[data-plant-label]");
    const owner = label
      ? figure.querySelector<HTMLElement>(`[data-plant="${label.dataset.plantLabel}"]`)
      : null;
    if (label && owner) {
      const a = label.getBoundingClientRect();
      const b = owner.getBoundingClientRect();
      const ax = (a.left + a.width / 2 - frame.left) / frame.width;
      const bx = (b.left + b.width / 2 - frame.left) / frame.width;
      if (Math.abs(ax - bx) > 0.01) {
        results.push(
          `the label for ${label.dataset.plantLabel} is at x=${ax.toFixed(3)} but its plant is at x=${bx.toFixed(3)}`,
        );
      }
    }
    return results;
  });
  for (const item of misplaced) findings.push({ where, what: item });

  const small = await page.evaluate(() => {
    const MIN = 44;
    const results: string[] = [];
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      // Hidden from assistive technology means it is a redundant pointer
      // affordance over a control that IS in the list — the markers on the
      // photo canvas, which duplicate the region strip beneath it. Holding
      // those to 44px is what made them overlap and steal each other's
      // taps in the first place.
      if (el.closest('[aria-hidden="true"]')) continue;
      // For a visually-hidden input inside a styled <label> — the
      // canonical accessible file control — the label is the tap target.
      const label = el.closest("label");
      const box = label && label.contains(el) ? label.getBoundingClientRect() : el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      // A ::after hit-area extender (the `tap-target` utility) counts.
      const after = getComputedStyle(el, "::after");
      const extra = after.content !== "none";
      const w = Math.max(box.width, extra ? parseFloat(after.minWidth) || 0 : 0);
      const h = Math.max(box.height, extra ? parseFloat(after.minHeight) || 0 : 0);
      if (w < MIN - 0.5 || h < MIN - 0.5) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.tagName)
          .trim()
          .slice(0, 40);
        results.push(`${Math.round(w)}x${Math.round(h)} "${label}"`);
      }
    }
    return [...new Set(results)];
  });
  for (const item of small) findings.push({ where, what: `tap target ${item}` });
}

async function shoot(page: Page, viewport: Viewport, name: string) {
  await page.waitForTimeout(350);
  // Audit first: a full-page screenshot resizes the viewport to capture,
  // and measuring immediately after it can catch the layout mid-restore.
  await audit(page, `${name} @ ${viewport.name}`, viewport);
  const file = path.join(OUT, `${viewport.name}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  · ${file}`);
}

/** Upload a photo through /start and land on the design page. */
async function uploadAndDesign(page: Page, viewport: Viewport): Promise<string | null> {
  // The clock §2 cares about starts when the customer lands on /start, so
  // that is where it starts here. Everything it measures after that is
  // machine time: the automation picks its photo instantly, and how long a
  // person takes to point their camera is theirs, not ours.
  const started = Date.now();
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  console.log(`  landing → /start interactive: ${Date.now() - started} ms`);
  await page.waitForLoadState("networkidle");
  await shoot(page, viewport, "start");
  if (!PHOTO) {
    console.log("  (no --photo given; skipping the upload leg)");
    return null;
  }
  const picked = Date.now();
  // Through the real affordance, not by reaching into the DOM: the file
  // inputs are display:none precisely so they are not a second tab stop,
  // and the buttons are what a customer touches.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(PHOTO, { timeout: 30_000 });
  await page.waitForURL(/\/design\//, { timeout: 120_000 });
  console.log(`  upload → design page: ${Date.now() - picked} ms`);

  // The wait, choreographed over the photo.
  await page.waitForTimeout(400);
  await shoot(page, viewport, "design-analysing");

  const regionButtons = page.locator("ul[aria-describedby='region-strip-help'] button");
  await regionButtons
    .first()
    .waitFor({ timeout: 180_000 })
    .catch(() => console.log("  (no regions appeared)"));
  console.log(`  landing → labelled regions: ${Date.now() - started} ms`);
  await shoot(page, viewport, "design-regions");

  // Swap a surface and wait for the band. Not every region has options —
  // turf has nothing in the catalog yet — so walk them until one does.
  const count = await regionButtons.count();
  for (let i = 0; i < count; i++) {
    await regionButtons.nth(i).click();
    await page.waitForTimeout(250);
    if (i === 0) await shoot(page, viewport, "design-picker");
    const options = page.getByRole("radio");
    if ((await options.count()) === 0) continue;
    // Prefer the acceptance path's own swap: mulch → stone.
    const stone = options.filter({ hasText: /stone/i });
    await ((await stone.count()) ? stone.first() : options.first()).click();
    await page
      .getByText(/\$[\d,]+ – \$[\d,]+/)
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => console.log("  (no band appeared)"));
    console.log(`  landing → first band: ${Date.now() - started} ms`);
    await shoot(page, viewport, "design-band");
    break;
  }

  // Swap a plant too — the per-plant path has its own picker, its own
  // persistence and its own line items, and none of that is exercised by
  // a surface swap. The ellipses on the photo are pointer affordances
  // hidden from assistive technology, so they carry a data attribute
  // rather than a name to find them by.
  const plants = page.locator("figure button[data-plant]");
  if ((await plants.count()) > 0) {
    // Hover first, so the label is on screen when the alignment rule runs.
    await plants.first().hover();
    await page.waitForTimeout(250);
    await shoot(page, viewport, "design-plant-hover");
    await plants.first().click();
    await page.waitForTimeout(300);
    const plantOptions = page.locator('input[type="radio"][name^="plant-"]');
    if ((await plantOptions.count()) > 0) {
      await shoot(page, viewport, "design-plant-picker");
      await plantOptions.first().click({ force: true });
      await page.waitForTimeout(800);
      await shoot(page, viewport, "design-plant-swapped");
    } else {
      findings.push({
        where: `design-plant-picker @ ${viewport.name}`,
        what: "tapping a plant opened no picker — the plant catalog did not load",
      });
    }
  }

  // Send it, so the console downstream has a lead to render.
  const nameField = page.getByLabel("Your name");
  if (await nameField.count()) {
    await nameField.fill("Dana Whitfield");
    await page.getByLabel("Email").fill("dana@example.com");
    await page.getByLabel("Phone").fill("608-555-0142");
    await page.getByRole("button", { name: /send my design/i }).click();
    await page
      .getByText(/design sent to the contractor/i)
      .waitFor({ timeout: 60_000 })
      .catch(() => console.log("  (submit did not confirm)"));
    await shoot(page, viewport, "design-submitted");
  }

  return new URL(page.url()).pathname;
}

async function run(browser: Browser, viewport: Viewport) {
  console.log(`\n${viewport.name}`);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    userAgent: viewport.mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    findings.push({ where: `${viewport.name}`, what: `page error: ${error.message}` }),
  );

  await page.goto(BASE, { waitUntil: "networkidle" });
  await shoot(page, viewport, "home");

  await uploadAndDesign(page, viewport);

  await page.goto(`${BASE}/design/demo`, { waitUntil: "networkidle" });
  await shoot(page, viewport, "demo");

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await shoot(page, viewport, "login");

  if (EMAIL && PASSWORD) {
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 30_000 }).catch(() => {});
    // Signing in has to actually work, and this swallowed the failure: it
    // caught the timeout and carried on, so the next three screenshots
    // were of the login page under the names "dashboard", "deltas" and
    // "pricebook". A console nobody could sign in to shipped for eleven
    // sessions behind that catch. Run this WITHOUT AUTH_TRUST_HOST set —
    // that variable was the thing hiding it.
    if (!/\/dashboard/.test(page.url())) {
      findings.push({
        where: `login @ ${viewport.name}`,
        what: `sign-in did not reach the dashboard — landed on ${new URL(page.url()).pathname}`,
      });
    }
    for (const route of ["dashboard", "deltas", "pricebook"]) {
      await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
      await shoot(page, viewport, route);
    }
    // The first lead, if there is one.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const lead = page.locator('a[href^="/leads/"]').first();
    if (await lead.count()) {
      await lead.click();
      await page.waitForLoadState("networkidle");
      await shoot(page, viewport, "lead");
    }
  } else {
    console.log("  (CONTRACTOR_EMAIL / CONTRACTOR_PASSWORD unset; console not shot)");
  }

  await page.goto(`${BASE}/no-such-page`, { waitUntil: "networkidle" });
  await shoot(page, viewport, "not-found");

  await context.close();
}

/**
 * A browser per viewport, with the pointer type forced at the engine.
 *
 * Getting a phone viewport to actually *be* a phone turned out to be the
 * hard part. Playwright's `isMobile` + `hasTouch` report `pointer: coarse`
 * for the first page load and lose it on the next navigation; emulating
 * the media feature over CDP survives navigation but is killed for good by
 * the first full-page screenshot, which overrides the device metrics to
 * capture and cannot be re-established afterwards on any session. Between
 * the two, every "390x844" shot this script has ever taken was of the
 * fine-pointer branch at phone width — the `/start` shots meant to show
 * the camera button were showing the desktop layout instead, which is how
 * three upload buttons shipped on desktop without anyone seeing them.
 *
 * A blink setting is decided at browser start and nothing later resets it,
 * so it is the one place to put this. `audit` re-checks it on every
 * surface anyway: this is a browser flag, and browser flags get renamed.
 */
function launchArgs(viewport: Viewport): string[] {
  // Blink's pointer/hover enums: 2 = coarse / no hover, 4 = fine,
  // 2 (hover) = hover available.
  return viewport.mobile
    ? ["--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"]
    : ["--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"];
}

await mkdir(OUT, { recursive: true });
for (const viewport of VIEWPORTS) {
  const browser = await chromium.launch({ args: launchArgs(viewport) });
  try {
    await run(browser, viewport);
  } finally {
    await browser.close();
  }
}

console.log("\n--- audit ---");
if (findings.length === 0) {
  console.log("clean: no horizontal scroll, no tap target under 44px, no page errors");
} else {
  for (const finding of findings) console.log(`  ${finding.where}: ${finding.what}`);
}
await writeFile(
  path.join(OUT, "audit.json"),
  JSON.stringify({ base: BASE, findings }, null, 2),
);
process.exitCode = findings.length === 0 ? 0 : 1;
