/**
 * What a customer may upload.
 *
 * The counterpart to lib/vision/mediaTypes.ts, and deliberately a
 * different list: iPhones shoot HEIC, the vision API does not read HEIC,
 * and the gap between the two lists is exactly the work
 * lib/image/normalize.ts does.
 *
 * Pure: no I/O, no environment. Safe to import anywhere.
 */
import type { VisionImageMediaType } from "../vision/mediaTypes";

export type HeicMediaType = "image/heic" | "image/heif";

export type UploadImageMediaType = VisionImageMediaType | HeicMediaType;

export const UPLOAD_IMAGE_MEDIA_TYPES: readonly UploadImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Human list for the upload affordance and the 415 body. */
export const UPLOAD_MEDIA_TYPE_LABEL = "JPEG, PNG, HEIC, GIF, or WebP";

export function isUploadMediaType(value: string): value is UploadImageMediaType {
  return (UPLOAD_IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

export function isHeic(value: string): value is HeicMediaType {
  return value === "image/heic" || value === "image/heif";
}

/**
 * The `accept` attribute for the file input.
 *
 * `.heic`/`.heif` extensions are listed alongside the media types because
 * a desktop browser picking a HEIC off a mounted iPhone frequently reports
 * an empty `type`, and an accept list of media types alone then greys the
 * file out in the picker.
 */
export const UPLOAD_ACCEPT_ATTRIBUTE = [
  ...UPLOAD_IMAGE_MEDIA_TYPES,
  ".heic",
  ".heif",
].join(",");

/**
 * The media type from the file's own leading bytes.
 *
 * The browser's `File.type` is a hint, not a fact: Safari on macOS reports
 * `""` for a HEIC dragged out of Photos, Android file pickers report
 * `application/octet-stream` for anything they do not recognise, and
 * either can be set to whatever a caller likes. The bytes cannot.
 *
 * Returns null when the leading bytes are not one of ours — which is a
 * rejection, not a fall back to the declared type.
 */
export function sniffMediaType(bytes: Uint8Array): UploadImageMediaType | null {
  const at = (i: number) => bytes[i];
  const ascii = (from: number, to: number) =>
    bytes.length >= to ? String.fromCharCode(...bytes.subarray(from, to)) : "";

  // JPEG: SOI marker.
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return "image/jpeg";
  }
  // PNG signature.
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47
  ) {
    return "image/png";
  }
  // GIF87a / GIF89a.
  if (ascii(0, 6).startsWith("GIF8")) return "image/gif";
  // RIFF....WEBP
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // ISO base media file format: a `ftyp` box whose major brand names one
  // of the HEIF flavours. `mif1`/`msf1` are the generic image brands an
  // iPhone also emits; `avif` is deliberately absent — libheif can decode
  // it, but nothing shoots AVIF and accepting it widens the surface for
  // no user.
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}
