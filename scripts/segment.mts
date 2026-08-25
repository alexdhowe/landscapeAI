/**
 * Segment one photo and show what every stage did to the outlines.
 *
 *   npm run segment -- --photo ./yard.jpg
 *
 * The outlines a customer sees are not the model's output. They are the
 * model's output after four transformations of ours, and until this script
 * existed only the last of them was ever visible:
 *
 *   1. the model's polygons, as returned
 *   2. after the ground-line clamp pulls ground regions off the wall
 *   3. after the second vision pass corrects them and the merge bounds
 *      decide how much of that correction to keep
 *   4. after smoothing and the material inset, which is what gets drawn
 *
 * When an outline is wrong, "the recognition is bad" is a conclusion about
 * stage 1 drawn from looking at stage 4. It might be right. Three rounds of
 * prompt work have been spent on the assumption that it is, and nobody has
 * ever compared the two — the clamp used to run inside the parser, so the
 * model's own answer was discarded before any caller could see it.
 *
 * This writes one image per stage, from the same bytes and the same prompt
 * production uses, so the question becomes which picture stops looking like
 * the yard. That is a different and much cheaper question than "why is the
 * model bad at this".
 *
 * Needs an ANTHROPIC_API_KEY. Without one it runs the demo overlay through
 * the same stages, which exercises the plumbing and tells you nothing about
 * a photograph — it says so rather than letting you read the pictures as if
 * it had.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { loadEnvLocal } from "../lib/env/localFile";
import { annotateOutlines } from "../lib/image/annotate";
import { normalizePhoto } from "../lib/image/normalize";
import { insetForRegion, insetOutline, smoothOutline } from "../lib/design/outline";
import { readCredential } from "../lib/vision/credentials";
import { MODEL, SEGMENTATION_PROMPT } from "../lib/vision/classify";
import { demoSegmentation } from "../lib/vision/demo";
import { holdRegionsToGround, usableGroundLine } from "../lib/vision/groundLine";
import { extractJson, parseSegmentationRaw } from "../lib/vision/parse";
import {
  mergeRefinement,
  parseRefinement,
  refinementPrompt,
  summarizeRefinement,
} from "../lib/vision/refine";
import type { NormalizedPoint, SegmentedRegion } from "../lib/vision/types";

// Imports hoist, so this is the first thing that actually runs — which is
// all that is required, since credentials are read at call time inside
// main(). Next.js loads .env.local itself; a tsx script does not, and a
// diagnostic that reports "no API key" on a machine that has one is worse
// than no diagnostic at all.
const env = loadEnvLocal();

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
}
const PHOTO = args.get("photo") ?? "";
const OUT = args.get("out") ?? ".segment";
const REFINE = (process.env.VISION_REFINE ?? "").trim().toLowerCase() !== "off";

if (!PHOTO) {
  console.error("usage: npm run segment -- --photo ./yard.jpg [--out .segment]");
  process.exit(2);
}

/** Twice the area of a ring; sign discarded. Areas here are for comparing. */
function doubleArea(ring: readonly NormalizedPoint[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum);
}

/** The share of the frame a region covers, as a percentage. */
const coverage = (ring: readonly NormalizedPoint[]) => (doubleArea(ring) / 2) * 100;

const topEdge = (ring: readonly NormalizedPoint[]) => Math.min(...ring.map(([, y]) => y));

type Stage = { key: string; title: string; regions: SegmentedRegion[] };

async function draw(photo: Buffer, mediaType: string, stage: Stage, dir: string) {
  const annotated = await annotateOutlines(
    photo,
    mediaType,
    stage.regions.map((r) => ({ id: r.id, polygon: r.polygon, plantings: r.plantings })),
  );
  if (!annotated) {
    console.log(`  (${stage.key}: nothing to draw)`);
    return;
  }
  const file = path.join(dir, `${stage.key}.jpg`);
  writeFileSync(file, annotated.bytes);
  console.log(`  · ${file}`);
}

/**
 * Per region, what each stage left. The column that changes is the stage
 * that did it — which is the whole point of running this.
 */
function table(stages: Stage[]) {
  const ids = [...new Set(stages.flatMap((s) => s.regions.map((r) => r.id)))];
  const width = Math.max(12, ...ids.map((id) => id.length));
  console.log(`\n  ${"region".padEnd(width)}  ${stages.map((s) => s.title.padStart(16)).join("")}`);
  console.log(`  ${"-".repeat(width)}  ${stages.map(() => "-".repeat(16)).join("")}`);
  for (const id of ids) {
    const cells = stages.map((stage) => {
      const region = stage.regions.find((r) => r.id === id);
      if (!region) return "—".padStart(16);
      const cell = `${region.polygon.length}pt ${coverage(region.polygon).toFixed(1)}% t${topEdge(region.polygon).toFixed(2)}`;
      return cell.padStart(16);
    });
    console.log(`  ${id.padEnd(width)}  ${cells.join("")}`);
  }
  console.log(
    `\n  Each cell is: vertices, share of the frame, y of the topmost vertex.` +
      `\n  A region that loses area or whose top edge drops between two columns` +
      `\n  was changed by that stage, not by the model.`,
  );
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const raw = readFileSync(PHOTO);
  const photo = await normalizePhoto(raw, "");
  console.log(
    `\n${PHOTO} → ${photo.mediaType} ${photo.width}×${photo.height}` +
      `${photo.transcodedFrom ? ` (from ${photo.transcodedFrom})` : ""}`,
  );

  const credential = readCredential();
  if (credential.status === "present") {
    console.log(
      env.applied.includes("ANTHROPIC_API_KEY")
        ? `  key: from ${env.path}`
        : `  key: from the shell environment${env.found ? ` (overriding ${env.path})` : ""}`,
    );
  } else {
    console.log(
      `\n  NO ANTHROPIC_API_KEY — running the demo overlay through the same stages.` +
        `\n  The pictures below are of the fixture, not of your photograph, and say` +
        `\n  nothing about how well anything is recognised.` +
        `\n  ${env.found ? `Read ${env.path} and found no key in it.` : `No ${env.path}.`}` +
        `\n  Run \`npm run doctor\` — it checks the key against the real API.`,
    );
  }

  let first: SegmentedRegion[];
  let groundLine: NormalizedPoint[] | undefined;
  let firstText = "";
  let secondText = "";

  if (credential.status === "present") {
    const client = credential.apiKey
      ? new Anthropic({ apiKey: credential.apiKey })
      : new Anthropic();
    const started = Date.now();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: photo.mediaType,
                data: photo.bytes.toString("base64"),
              },
            },
            { type: "text", text: SEGMENTATION_PROMPT },
          ],
        },
      ],
    });
    console.log(`  first pass: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    firstText = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = parseSegmentationRaw(firstText, "claude");
    first = parsed.regions;
    groundLine = parsed.groundLine;
  } else {
    const demo = demoSegmentation();
    first = demo.regions;
  }

  const stages: Stage[] = [{ key: "01-model", title: "1 model", regions: first }];

  // Stage 2 — the ground-line clamp.
  const held = holdRegionsToGround(first, groundLine);
  stages.push({ key: "02-ground", title: "2 ground line", regions: held });
  if (groundLine) {
    const usable = usableGroundLine(groundLine);
    console.log(
      usable
        ? `  ground line: ${groundLine.length} points, y ${Math.min(...usable.map(([, y]) => y)).toFixed(2)}–${Math.max(...usable.map(([, y]) => y)).toFixed(2)} — applied`
        : `  ground line: ${groundLine.length} points — refused (too narrow a span), nothing clamped`,
    );
    if (held.length < first.length) {
      console.log(`  ground line dropped ${first.length - held.length} region(s) entirely`);
    }
  } else {
    console.log("  ground line: none reported, nothing clamped");
  }

  // Stage 3 — the second look.
  let refined = held;
  if (credential.status === "present" && REFINE && held.length > 0) {
    const annotated = await annotateOutlines(
      photo.bytes,
      photo.mediaType,
      held.map((r) => ({ id: r.id, polygon: r.polygon, plantings: r.plantings })),
    );
    if (!annotated) {
      console.log("  second look: the photo would not annotate, skipped");
    } else {
      writeFileSync(path.join(OUT, "02b-sent-for-second-look.jpg"), annotated.bytes);
      const client = credential.apiKey
        ? new Anthropic({ apiKey: credential.apiKey })
        : new Anthropic();
      const started = Date.now();
      const second = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: annotated.mediaType,
                  data: annotated.bytes.toString("base64"),
                },
              },
              { type: "text", text: refinementPrompt(annotated.legend) },
            ],
          },
        ],
      });
      console.log(`  second look: ${((Date.now() - started) / 1000).toFixed(1)}s`);
      secondText = second.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const shapes = parseRefinement(secondText, extractJson);
      const tally = summarizeRefinement(held, shapes);
      console.log(
        `  second look kept: outlines ${tally.outlinesAccepted}/${tally.outlinesOffered}, ` +
          `plants ${tally.plantsAccepted}/${tally.plantsOffered}` +
          (tally.outlinesOffered > tally.outlinesAccepted
            ? "  ← refused corrections are the merge bounds, not the model"
            : ""),
      );
      refined = mergeRefinement(held, shapes);
    }
  } else if (!REFINE) {
    console.log("  second look: off (VISION_REFINE=off)");
  }
  stages.push({ key: "03-refined", title: "3 second look", regions: refined });

  // Stage 4 — what is actually drawn on the customer's photo.
  const drawn = refined.map((region) => ({
    ...region,
    polygon: smoothOutline(region.polygon),
  }));
  stages.push({ key: "04-drawn", title: "4 drawn", regions: drawn });

  console.log("");
  for (const stage of stages) await draw(photo.bytes, photo.mediaType, stage, OUT);

  writeFileSync(
    path.join(OUT, "segmentation.json"),
    JSON.stringify(
      {
        photo: { path: PHOTO, width: photo.width, height: photo.height },
        groundLine: groundLine ?? null,
        groundLineUsable: groundLine ? Boolean(usableGroundLine(groundLine)) : false,
        stages: Object.fromEntries(stages.map((s) => [s.key, s.regions])),
        // The unparsed replies, because a polygon that never made it
        // through the parser — or a field we deliberately drop, like the
        // ground line the second pass is no longer allowed to move — is
        // invisible in every other artifact here. Finding that one cost a
        // round trip that this file existed to prevent.
        firstPassText: firstText || null,
        secondPassText: secondText || null,
      },
      null,
      2,
    ),
  );
  console.log(`  · ${path.join(OUT, "segmentation.json")}`);

  table(stages);

  // The fill the customer sees is inset inside the drawn outline; if that
  // is what looks wrong, it is this and not the recognition.
  const insetLoss = refined.map((region) => {
    const path = smoothOutline(region.polygon);
    const before = doubleArea(path);
    const after = doubleArea(insetOutline(path, insetForRegion(path, 0.006)));
    return before > 0 ? 1 - after / before : 0;
  });
  if (insetLoss.length > 0) {
    // The inset is a fixed fraction of the frame, so it takes a far
    // bigger bite out of a narrow bed than a wide lawn. Worth seeing next
    // to the outlines when the complaint is "the material stops short".
    console.log(
      `\n  Material fill sits inside the drawn outline by up to ${(Math.max(...insetLoss) * 100).toFixed(1)}% of a region's area.`,
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // The one failure worth translating. A raw 401 body sends people looking
  // at this script; the key is what is wrong, and doctor already knows how
  // to say which way it is wrong.
  if (/authentication_error|invalid x-api-key|401/i.test(message)) {
    console.error(
      `\n  The API rejected the key.` +
        `\n  ${env.applied.includes("ANTHROPIC_API_KEY") ? `It came from ${env.path}.` : "It came from the shell environment."}` +
        `\n  Run \`npm run doctor\` — it checks the key against the real API and says what to fix.\n`,
    );
  } else {
    console.error(`\n  ${message}\n`);
  }
  process.exit(1);
});
