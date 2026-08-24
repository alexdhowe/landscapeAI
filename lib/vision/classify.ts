/**
 * Claude vision segmentation. Server-only: called from the /api/vision
 * route handler. Falls back to the demo segmentation when no API key is
 * configured so the flow stays exercisable in local dev.
 */
import Anthropic from "@anthropic-ai/sdk";

import { readCredential } from "./credentials";
import { demoSegmentation } from "./demo";
import type { VisionImageMediaType } from "./mediaTypes";
import { parseSegmentation } from "./parse";
import type { SegmentationResult } from "./types";

const SEGMENTATION_PROMPT = `You are analyzing a homeowner's photo of their yard for a landscape design tool.

COORDINATES. Everything you return is in normalized image coordinates: x and y between 0 and 1, origin at the TOP-LEFT corner, x rightward, y downward. y=0 is the very top edge of the image — usually sky or roof. y=1 is the very bottom edge — usually the ground closest to the camera. A point halfway down the image is y=0.5 whether or not anything interesting is there.

Most photos of a front yard are taken standing up, so the top third is sky and house and the bottom half is ground close to the camera. The most common mistake on this task is placing ground regions too HIGH — giving a lawn or a bed a top edge that sits on the house wall behind it. Before you outline anything, find where the ground actually starts in this photo and work downward from there.

FIRST, report the ground line: the line where vertical surfaces meet the ground, left to right across the whole photo — the base of the house, of a fence, of a retaining wall. Give 2-8 points ordered by increasing x, spanning as much of the image width as the photo shows. Everything on the ground plane lies BELOW this line. If the photo shows no vertical surface meeting the ground, return an empty array.

THEN identify the distinct landscape regions visible in the photo. For each region return a polygon outlining it, 4-12 vertices. Only outline ground-plane landscape areas — never the house walls, roof, sky, cars, or people. Every vertex of every region must be at or below the ground line you just reported.

Allowed region kinds (use exactly these strings):
- "turf" — lawn / grass areas
- "bed" — planting or mulch beds not against the house
- "hardscape" — patios, walkways, driveways, steps
- "foundation_planting" — planted strips directly against the house foundation

For each region, also report the individual plants standing in it — shrubs, ornamental grasses, perennial clumps — as ellipses: "cx"/"cy" for the centre and "rx"/"ry" for the radii, all as fractions of image width and height. These are what stays when the homeowner swaps the mulch for stone, so cover the plant's visible mass rather than outlining it precisely, and skip ground cover and lawn grass. Return at most a dozen per region; an empty array is a fine answer for a bed with nothing growing in it.

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
    model: "claude-opus-5",
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

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return parseSegmentation(text, "claude");
}
