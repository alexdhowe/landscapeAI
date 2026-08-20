/**
 * Claude vision segmentation. Server-only: called from the /api/vision
 * route handler. Falls back to the demo segmentation when no API key is
 * configured so the flow stays exercisable in local dev.
 */
import Anthropic from "@anthropic-ai/sdk";

import { demoSegmentation } from "./demo";
import { parseSegmentation } from "./parse";
import type { SegmentationResult } from "./types";

export type SupportedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export const SUPPORTED_IMAGE_MEDIA_TYPES: SupportedImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const SEGMENTATION_PROMPT = `You are analyzing a homeowner's photo of their yard for a landscape design tool.

Identify the distinct landscape regions visible in the photo. For each region return a polygon outlining it in NORMALIZED image coordinates: x and y between 0 and 1, origin at the top-left corner, x rightward, y downward. Use 4-12 vertices per polygon. Only outline ground-plane landscape areas — never the house walls, roof, sky, cars, or people.

Allowed region kinds (use exactly these strings):
- "turf" — lawn / grass areas
- "bed" — planting or mulch beds not against the house
- "hardscape" — patios, walkways, driveways, steps
- "foundation_planting" — planted strips directly against the house foundation

Respond with ONLY a JSON object, no other text:
{
  "regions": [
    {
      "id": "short_snake_case_id",
      "kind": "turf" | "bed" | "hardscape" | "foundation_planting",
      "label": "Short human label, e.g. 'Bed along front walk'",
      "polygon": [[x, y], [x, y], ...],
      "existing_material": "what is there now, e.g. 'hardwood mulch', 'concrete'",
      "confidence": 0.0-1.0
    }
  ],
  "cannot_see": ["things you cannot determine from this photo, e.g. 'back yard', 'drainage'"]
}

If the photo shows no yard at all, return {"regions": [], "cannot_see": ["no landscape visible in photo"]}.`;

export function hasVisionCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * Segment a yard photo into labeled regions. Returns the demo overlay
 * (clearly marked source: "demo") when no Anthropic credentials are set.
 */
export async function classifyPhoto(
  imageData: Buffer,
  mediaType: SupportedImageMediaType,
): Promise<SegmentationResult> {
  if (!hasVisionCredentials()) {
    return demoSegmentation();
  }

  const client = new Anthropic();
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
