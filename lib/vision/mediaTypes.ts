/**
 * What Claude's vision API accepts.
 *
 * This list used to be `SUPPORTED_IMAGE_MEDIA_TYPES` in classify.ts and
 * the upload route imported it to decide what a *customer* may upload.
 * Those are two different questions and their answers now differ: a
 * customer may send a HEIC off an iPhone, and the vision API will not take
 * one. Conflating them is what made "accept HEIC" look like a one-line
 * change to a constant.
 *
 * So: this list is the vision API's contract and nothing else may widen
 * it. The customer's list lives in lib/image/mediaTypes.ts, and
 * lib/image/normalize.ts guarantees that everything leaving the upload
 * route is in *this* one — there is a test for exactly that.
 */
export type VisionImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export const VISION_IMAGE_MEDIA_TYPES: readonly VisionImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export function isVisionMediaType(value: string): value is VisionImageMediaType {
  return (VISION_IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}
