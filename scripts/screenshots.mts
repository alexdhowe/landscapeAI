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
import { chromium, type Browser, type Locator, type Page } from "playwright";

type Viewport = { name: string; width: number; height: number; mobile: boolean };

/**
 * The phone is still audited — it is where the 44px and overflow rules
 * were written for — but the desktop is the primary surface now, and one
 * desktop width does not cover it: 1440 is a laptop and 1920 is the
 * monitor most desks actually have. Separate entries rather than one,
 * because a capped measure that reads deliberate at 1440 can read as a
 * column stranded in a field of empty at 1920, and only a shot shows
 * which.
 */
const VIEWPORTS: Viewport[] = [
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
  { name: "1920x1080", width: 1920, height: 1080, mobile: false },
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

type Point = { x: number; y: number };

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

  const small = await page.evaluate((MIN: number) => {
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
    // 44 CSS px is the *fingertip* floor and only means anything where
    // there is a fingertip. Holding a desktop to it reported every 38px
    // button in the price book as a defect — noise, and noise is what
    // buried the 18px-tall links beside them that really are hard to hit
    // with a mouse. 24px is the pointer floor.
  }, viewport.mobile ? 44 : 24);
  for (const item of small) {
    findings.push({ where, what: `${viewport.mobile ? "tap" : "click"} target ${item}` });
  }
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

/**
 * The three states of the segmentation wait, driven from the wire.
 *
 * Reading, refining (with a real first-pass time and the names the first
 * pass found), and one that has run well past its estimate — the last
 * because "taking longer than usual" is the state that has to be right
 * and is the least likely to be seen before a customer sees it.
 */
async function waitStates(page: Page, viewport: Viewport, projectId: string) {
  const res = await page.request.get(`${BASE}/api/projects/${projectId}`);
  if (!res.ok()) return;
  const project = (await res.json()) as Record<string, unknown>;
  const measured = { firstPassMs: 58_000, refineMs: 98_600, totalMs: 156_600 };
  const found = ["Front lawn", "Bed along front walk", "Foundation planting"];
  const states: { name: string; agoMs: number; progress: Record<string, unknown> }[] = [
    {
      name: "reading",
      agoMs: 22_000,
      progress: { stage: "reading", estimate: measured },
    },
    {
      name: "refining",
      agoMs: 96_000,
      progress: { stage: "refining", estimate: measured, firstPassMs: 58_000, found },
    },
    {
      name: "overdue",
      agoMs: 340_000,
      progress: { stage: "refining", estimate: measured, firstPassMs: 58_000, found },
    },
  ];

  const url = `**/api/projects/${projectId}`;
  for (const state of states) {
    await page.route(url, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...project,
          segmentation: {
            status: "pending",
            progress: {
              startedAt: new Date(Date.now() - state.agoMs).toISOString(),
              ...state.progress,
            },
          },
        }),
      });
    });
    await page.reload({ waitUntil: "networkidle" });
    await shoot(page, viewport, `design-wait-${state.name}`);
    await page.unroute(url);
  }
  // Back to the real project, so everything after this is the real flow.
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator("ul[aria-describedby='region-strip-help'] button")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => console.log("  (regions did not come back after the wait shots)"));
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

  // The wait itself, which nothing else in this script can reach.
  //
  // Segmentation with no ANTHROPIC_API_KEY answers in milliseconds, and
  // with one it answers in about two minutes — so the screen a customer
  // spends most of their first visit looking at is the one surface here
  // that has never been in a screenshot. The three states are faked at
  // the wire: the design page reads the wait out of the project it polls,
  // so answering that poll with a pending project is enough to drive it.
  await waitStates(page, viewport, page.url().split("/design/")[1]);

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

  // Correcting the edge, which is the only path to an exact outline and
  // therefore the one that must not quietly break.
  const adjust = page.getByRole("button", { name: "Adjust the edge" });
  if (await adjust.count()) {
    await adjust.click();
    await page.waitForTimeout(250);
    const handles = page.locator("figure svg circle[stroke]");
    if ((await handles.count()) === 0) {
      findings.push({
        where: `design-adjust @ ${viewport.name}`,
        what: "adjusting the edge showed no handles to drag",
      });
    }
    await shoot(page, viewport, "design-adjust");
    // The keyboard path: one press moves the whole edge.
    await page.getByRole("button", { name: "Pull the edge in" }).click();
    await page.waitForTimeout(600);
    const reset = page.getByRole("button", { name: /Put back the edge/ });
    if ((await reset.count()) === 0) {
      findings.push({
        where: `design-adjust @ ${viewport.name}`,
        what: "nudging the edge did not record a correction to put back",
      });
    } else {
      await reset.click();
      await page.waitForTimeout(500);
    }
    // The toggle relabels itself when it is on, which is the point of it.
    await page.getByRole("button", { name: "Done adjusting" }).click();
    await page.waitForTimeout(200);
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

  await dragGestures(page, viewport);

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

/**
 * The three drags, on one photograph, told apart only by how far the
 * pointer travelled.
 *
 * `DRAG_THRESHOLD` in PhotoCanvas is 0.0045 of the frame — about seven
 * pixels on a 1600px photo. Under it a press is a tap and opens a picker;
 * over it the same press moves the thing. There is no mode and no toggle,
 * which means every one of these gestures is a near miss away from doing
 * the other one. A mouse has no fingertip wobble, so the risk on a desktop
 * is the phone's in reverse: a deliberate small drag read as a click.
 *
 * So this drives both sides of the threshold and asserts they did
 * *different* things, rather than screenshotting a drag and calling it
 * tested.
 *
 * Two rules, both learned the hard way on the first run of this leg:
 *
 *   - **Both ends of a drag must be inside the viewport.** `boundingBox()`
 *     is page coordinates and will happily describe an element scrolled
 *     out of the window; `page.mouse` is *viewport* coordinates and
 *     silently delivers nothing outside it. Together they produce a drag
 *     that runs its whole loop, presses nothing, and reports the feature
 *     broken. The rail on this page is taller than a 900px window, so the
 *     palette was below the fold and neither it nor the bed edge was ever
 *     actually grabbed.
 *   - **A drop has to land in the open bed.** A fraction of the frame is
 *     not a bed: dropping at 45%/72% of this photo is the lawn, and the
 *     server refuses a shrub there exactly as it is meant to. The refusal
 *     was right and the test was wrong.
 */
async function dragGestures(page: Page, viewport: Viewport) {
  if (viewport.mobile) return; // driven with a mouse, by design
  const where = `design-drags @ ${viewport.name}`;

  /** The centre of an element in viewport coordinates, or null. */
  async function centre(locator: Locator): Promise<Point | null> {
    const box = await locator.boundingBox();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  }

  const inView = (p: Point | null): p is Point =>
    p !== null && p.x >= 0 && p.y >= 0 && p.x <= viewport.width && p.y <= viewport.height;

  /** Scroll it in, re-measure, and say so loudly if it is still unreachable. */
  async function grabPoint(locator: Locator, what: string) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(150);
    const point = await centre(locator);
    if (!point) {
      findings.push({ where, what: `${what}: nothing to grab` });
      return null;
    }
    if (!inView(point)) {
      findings.push({
        where,
        what: `${what}: at ${Math.round(point.x)},${Math.round(point.y)}, outside the ${viewport.name} viewport — a drag from there presses nothing`,
      });
      return null;
    }
    return point;
  }

  /**
   * Both ends of a drag, on the screen *at the same time*.
   *
   * Scrolling one end into view moves the other, so measuring them one
   * after another gives you two readings from two different scroll
   * positions and a drag that starts from where the source used to be.
   * That is the second way this leg reported a working feature broken:
   * the palette lives at the bottom of a rail taller than the window and
   * the bed is at the top of the photo, so scrolling to the palette and
   * then to the bed left the card's coordinates a screen out of date.
   *
   * Try it from each end, and only give up when neither scroll position
   * has both.
   */
  async function bothInView(
    a: Locator,
    b: Locator,
    what: string,
  ): Promise<[Point, Point] | null> {
    for (const anchor of [a, b]) {
      await anchor.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(200);
      const [pa, pb] = [await centre(a), await centre(b)];
      if (inView(pa) && inView(pb)) return [pa, pb];
    }
    findings.push({
      where,
      what: `${what}: cannot get both ends of the drag on a ${viewport.name} screen at once`,
    });
    return null;
  }

  /** A pointer path a hand could have made, rather than one jump. */
  async function dragTo(from: Point, to: Point, steps = 14) {
    const end = {
      x: Math.max(2, Math.min(viewport.width - 2, to.x)),
      y: Math.max(2, Math.min(viewport.height - 2, to.y)),
    };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(
        from.x + ((end.x - from.x) * i) / steps,
        from.y + ((end.y - from.y) * i) / steps,
      );
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
  }

  const strip = page.locator("ul[aria-describedby='region-strip-help'] button");
  const plants = page.locator("figure button[data-plant]");
  const palette = page.locator("[data-plant-option]");

  /**
   * Open a region that has plants in it and a palette to add more, and
   * leave the *region* panel showing rather than a plant's.
   *
   * Opening a plant replaces the region panel with that plant's picker,
   * which takes the palette and the edge controls off the screen with it.
   * So this is called again between the legs below: leg 1 deliberately
   * opens a plant, and legs 3 and 4 need the panel it displaced. Without
   * that, both report the controls missing — which is true, and is not
   * what they are there to find out.
   */
  async function openARegionWithPlants(): Promise<number | null> {
    for (let i = 0, n = await strip.count(); i < n; i++) {
      await strip.nth(i).click();
      await page.waitForTimeout(400);
      if ((await plants.count()) > 0 && (await palette.count()) > 0) return i;
    }
    return null;
  }

  const openRegion = await openARegionWithPlants();
  if (openRegion === null) {
    findings.push({ where, what: "no region in this photo had both plants and a palette" });
    return;
  }

  const figure = await page.locator("figure").first().boundingBox();
  const from = await grabPoint(plants.first(), "a plant on the photo");
  if (!figure || !from) return;
  const centreOf = async () => {
    const b = await plants.first().boundingBox();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  };

  // 1. Press and lift, inside the threshold: opens the picker, moves nothing.
  const before = await centreOf();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 2, from.y + 1);
  await page.mouse.up();
  await page.waitForTimeout(500);
  if ((await page.locator('input[type="radio"][name^="plant-"]').count()) === 0) {
    findings.push({ where, what: "press-and-lift on a plant did not open the picker" });
  }
  const afterTap = await centreOf();
  if (before && afterTap && Math.hypot(afterTap.x - before.x, afterTap.y - before.y) > 2) {
    findings.push({ where, what: "press-and-lift moved the plant — a tap was read as a drag" });
  }
  await shoot(page, viewport, "design-drag-tap");

  // 2. Press and travel, well past it: moves the plant.
  await dragTo(from, { x: from.x + figure.width * 0.12, y: from.y + figure.height * 0.06 });
  await page.waitForTimeout(1500);
  const afterDrag = await centreOf();
  if (before && afterDrag && Math.hypot(afterDrag.x - before.x, afterDrag.y - before.y) < 5) {
    findings.push({ where, what: "press-and-travel did not move the plant" });
  }
  await shoot(page, viewport, "design-drag-plant");

  // 3. A plant off the palette onto the bed. Leg 1 opened a plant, which
  //    displaced the region panel the palette lives in, so put it back.
  await strip.nth(openRegion).click();
  await page.waitForTimeout(500);
  if ((await palette.count()) === 0) {
    findings.push({ where, what: "re-opening the region did not bring back the plant palette" });
  } else {
    const addedBefore = await page.locator("figure button[data-added-plant]").count();
    const ends = await bothInView(palette.first(), plants.first(), "palette card to bed");
    if (ends) {
      const [card, intoBed] = ends;
      await dragTo(card, { x: intoBed.x + 10, y: intoBed.y + 10 });
      await page.waitForTimeout(2000);
      if ((await page.locator("figure button[data-added-plant]").count()) <= addedBefore) {
        findings.push({ where, what: "dragging from the palette onto the bed added no plant" });
      }
      await shoot(page, viewport, "design-drag-added");
    }
  }

  // 4. The bed edge. What you grab is the fat transparent stroke over the
  //    outline, not the marker circles: on a phone a forty-point outline's
  //    handles are smaller and closer together than a fingertip, so the
  //    line itself is the target.
  const adjust = page.getByRole("button", { name: "Adjust the edge" });
  if ((await adjust.count()) === 0) {
    findings.push({ where, what: 'no open region offered "Adjust the edge" — the edge drag went untested' });
  } else {
    await adjust.click();
    await page.waitForTimeout(400);
    // The palette leg above scrolls the rail, which can leave the
    // photograph above the top of the window; the point computed below is
    // in client coordinates and would be negative.
    await page.locator("figure").first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(250);
    // A point ON the line, not the centre of the path's bounding box —
    // that centre is inside the bed, where the plants are, and grabbing
    // it drags a plant instead. `getScreenCTM` is what turns an SVG user
    // coordinate into a client one; the box and the viewBox between them
    // do not, once the frame is scaled.
    const grab = await page.evaluate(() => {
      const path = document.querySelector<SVGPathElement>(
        'figure svg path[stroke="transparent"]',
      );
      const length = path?.getTotalLength() ?? 0;
      const ctm = path?.getScreenCTM();
      if (!path || !ctm || length === 0) return null;
      const point = path.getPointAtLength(length * 0.25).matrixTransform(ctm);
      return { x: point.x, y: point.y };
    });
    if (!grab) {
      findings.push({ where, what: "adjusting the edge offered no line to grab" });
    } else {
      if (!inView(grab)) {
        findings.push({
          where,
          what: `the bed edge is at ${Math.round(grab.x)},${Math.round(grab.y)}, outside the ${viewport.name} viewport`,
        });
      } else {
        await dragTo(grab, {
          x: grab.x + figure.width * 0.06,
          y: grab.y + figure.height * 0.04,
        });
        await page.waitForTimeout(1800);
        if ((await page.getByRole("button", { name: /Put back the edge/ }).count()) === 0) {
          findings.push({ where, what: "dragging the bed edge recorded no correction to put back" });
        }
        await shoot(page, viewport, "design-drag-edge");
      }
    }
    await page.getByRole("button", { name: "Done adjusting" }).click().catch(() => {});
    await page.waitForTimeout(250);
  }

  // Hover: a first-class input on a desktop, not a fallback. The plant
  // whose picker is open shows no hover label on purpose — its name is
  // already in the panel — so close the picker or this measures that rule
  // instead of hover.
  await page.getByRole("button", { name: /^close/i }).first().click().catch(() => {});
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
  await plants.first().hover();
  await page.waitForTimeout(400);
  if ((await page.locator("[data-plant-label]").count()) === 0) {
    findings.push({ where, what: "hovering a plant showed no label — hover carries no weight here" });
  }

  // Keyboard: the polygons are pointer-only on purpose (see PhotoCanvas);
  // the strip beneath the photo is the real control, so it has to take
  // focus and Enter has to open a region.
  await strip.first().focus();
  const opened = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { tag: el?.tagName ?? "", pressed: el?.getAttribute("aria-pressed") };
  });
  if (opened.tag !== "BUTTON") {
    findings.push({ where, what: `the region strip did not take focus (active element is ${opened.tag || "nothing"})` });
  } else {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    if ((await page.locator("h2, h3").filter({ hasText: /./ }).count()) === 0) {
      findings.push({ where, what: "Enter on a focused region opened no panel" });
    }
  }
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
