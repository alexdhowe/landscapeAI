/**
 * Claude vision segmentation. Server-only: called from the /api/vision
 * route handler. Falls back to the demo segmentation when no API key is
 * configured so the flow stays exercisable in local dev.
 */
import Anthropic from "@anthropic-ai/sdk";

import { annotateOutlines } from "../image/annotate";
import { readCredential } from "./credentials";
import { demoSegmentation } from "./demo";
import type { VisionImageMediaType } from "./mediaTypes";
import { extractJson, parseSegmentation } from "./parse";
import { mergeRefinement, parseRefinement, refinementPrompt } from "./refine";
import type { SegmentationResult } from "./types";

const SEGMENTATION_PROMPT = `You are analyzing a homeowner's photo of their yard for a landscape design tool.

COORDINATES. Everything you return is in normalized image coordinates: x and y between 0 and 1, origin at the TOP-LEFT corner, x rightward, y downward. y=0 is the very top edge of the image — usually sky or roof. y=1 is the very bottom edge — usually the ground closest to the camera. A point halfway down the image is y=0.5 whether or not anything interesting is there.

Most photos of a front yard are taken standing up, so the top third is sky and house and the bottom half is ground close to the camera. The most common mistake on this task is placing ground regions too HIGH — giving a lawn or a bed a top edge that sits on the house wall behind it. Before you outline anything, find where the ground actually starts in this photo and work downward from there.

FIRST, report the ground line: the line where vertical surfaces meet the ground, left to right across the whole photo — the base of the house, of a fence, of a retaining wall. Give 2-8 points ordered by increasing x, spanning as much of the image width as the photo shows. Everything on the ground plane lies BELOW this line. If the photo shows no vertical surface meeting the ground, return an empty array.

THEN identify the distinct landscape regions visible in the photo. Only outline ground-plane landscape areas — never the house walls, roof, sky, cars, or people. Every vertex of every region must be at or below the ground line you just reported.

TRACE THE EDGES. Landscape beds are curved, and a polygon of a few vertices cuts straight chords across a curve — the outline then covers lawn on one side and misses bed on the other, which is exactly what the customer sees when they swap the material. Use as many vertices as the edge needs: 6 is fine for a rectangular driveway, and a curved bed edge usually wants 20-40. Put them where the edge changes direction, not at even intervals. Follow the real boundary — the mulch/lawn line, the edge of the concrete — rather than drawing a convex hull around the area; regions are often long, thin, or crescent-shaped, and that is fine.

REGIONS DO NOT OVERLAP. Each part of the ground belongs to exactly one region. Where a bed sits inside a lawn, the lawn's outline goes around the bed rather than under it.

Allowed region kinds (use exactly these strings):
- "turf" — lawn / grass areas
- "bed" — planting or mulch beds not against the house
- "hardscape" — patios, walkways, driveways, steps
- "foundation_planting" — planted strips directly against the house foundation

For each region, also report the individual plants standing in it — every shrub, ornamental grass, perennial clump and flowering mass you can see — as ellipses: "cx"/"cy" for the centre and "rx"/"ry" for the radii, all as fractions of image width and height.

Be thorough and be generous with the size. These ellipses are what the homeowner's plants stay inside when they swap the mulch for stone: a plant you leave out, or draw too small, gets gravel painted across its leaves. Cover the plant's whole visible mass including the outer foliage, and where two shrubs of the same kind grow into each other, one ellipse over the pair is better than two that each miss an edge. Erring large is nearly free — a little extra bed around a plant is what a real bed looks like. Skip lawn grass and low ground cover. An empty array is still the right answer for a bed with nothing growing in it.

Also report vertical elements — things visible in the photo that an aerial view cannot show. Allowed kinds (use exactly these strings): "retaining_wall", "steps", "fence", "grade_change", "raised_bed", "other".

For each region, estimate its visible ground footprint in square feet ("estimated_area_sf"). This is a rough cross-check against a separate aerial measurement, not a billable quantity — give your honest best guess from context clues (door widths, siding courses, walkway widths) and reflect the uncertainty in the region's confidence.

Respond with ONLY a JSON object, no other text:
{
  "ground_line": [[x, y], [x, y], ...],
  "regions": [
    {
      "id": "short_snake_case_id",
      "kind": "turf" | "bed" | "hardscape" | "foundation_planting",
      "label": "Short human label, e.g. 'Bed along front walk'",
      "polygon": [[x, y], [x, y], ...],
      "plantings": [
        { "cx": x, "cy": y, "rx": r, "ry": r, "label": "e.g. 'boxwood'" }
      ],
      "existing_material": "what is there now, e.g. 'hardwood mulch', 'concrete'",
      "condition": "observed condition, e.g. 'faded mulch, weeds coming through'",
      "estimated_area_sf": rough visible ground area in square feet,
      "confidence": 0.0-1.0
    }
  ],
  "vertical_elements": [
    {
      "kind": "retaining_wall" | "steps" | "fence" | "grade_change" | "raised_bed" | "other",
      "description": "short description, e.g. 'timber retaining wall along driveway'",
      "confidence": 0.0-1.0
    }
  ],
  "cannot_see": ["things you cannot determine from this photo, e.g. 'back yard', 'drainage'"]
}

If the photo shows no yard at all, return {"ground_line": [], "regions": [], "vertical_elements": [], "cannot_see": ["no landscape visible in photo"]}.`;

export { hasVisionCredentials } from "./credentials";

const MODEL = "claude-opus-5";

/**
 * The refinement pass costs a second vision call, which is real latency
 * against section 2's thirty seconds and real money per upload. On by
 * default because the outlines are the product; `VISION_REFINE=off` turns
 * it off without touching code, for anyone measuring one against the other.
 */
function refinementEnabled(): boolean {
  return (process.env.VISION_REFINE ?? "").trim().toLowerCase() !== "off";
}

function textOf(response: { content: { type: string }[] }): string {
  return response.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Segment a yard photo into labeled regions. Returns the demo overlay
 * (clearly marked source: "demo") when no Anthropic credentials are set.
 */
export async function classifyPhoto(
  imageData: Buffer,
  mediaType: VisionImageMediaType,
): Promise<SegmentationResult> {
  const credential = readCredential();
  if (credential.status !== "present") {
    // A half-finished setup gets the labelled demo overlay rather than a
    // 401 rendered at a customer — but the operator hears about it, once,
    // where they are already looking.
    if (credential.note) console.warn(`[vision] ${credential.note}`);
    return demoSegmentation();
  }

  // The cleaned key, when there is one: quotes and stray whitespace from a
  // paste are not worth a 401. With no key but an auth token or a signed-in
  // profile, the SDK resolves credentials itself.
  const client = credential.apiKey
    ? new Anthropic({ apiKey: credential.apiKey })
    : new Anthropic();
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
              media_type: mediaType,
              data: imageData.toString("base64"),
            },
          },
          { type: "text", text: SEGMENTATION_PROMPT },
        ],
      },
    ],
  });

  const first = parseSegmentation(textOf(response), "claude");
  if (first.regions.length === 0 || !refinementEnabled()) return first;

  // The second look. Everything about it is best-effort: if the image
  // cannot be annotated, if the call fails, or if what comes back is
  // unusable, the first pass is the answer. A refinement is an
  // improvement, never a requirement — and never a reason to fail a
  // segmentation that already succeeded.
  try {
    const annotated = await annotateOutlines(
      imageData,
      mediaType,
      first.regions.map((region) => ({
        id: region.id,
        polygon: region.polygon,
        plantings: region.plantings,
      })),
    );
    if (!annotated) return first;
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
    const refined = parseRefinement(textOf(second), extractJson);
    if (refined.polygons.size === 0 && refined.plantings.size === 0) return first;
    return { ...first, regions: mergeRefinement(first.regions, refined) };
  } catch (error) {
    console.warn(
      `[vision] outline refinement skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
    return first;
  }
}
