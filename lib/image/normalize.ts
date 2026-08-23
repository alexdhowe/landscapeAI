/**
 * Upload normalisation — the one place a customer's photo becomes bytes
 * this application is willing to store.
 *
 * It exists because of one gap: iPhones shoot HEIC and Claude's vision API
 * does not read HEIC. Storing raw HEIC and serving it would render in
 * Safari and break in Chrome, which is worse than rejecting it. So HEIC is
 * transcoded to JPEG here, before the bytes reach lib/storage, and
 * everything downstream sees a format it already understands.
 *
 * Three other things happen in the same pass, because the upload path is
 * open and §1 says the image is a view and never the artifact — the object
 * graph is the truth, so nothing is lost by normalising the picture:
 *
 *   Orientation  baked into the pixels. iPhone photos carry a rotation
 *                tag; the browser applies it and the vision model does
 *                not, so a portrait photo can put every segmentation
 *                polygon in the wrong place.
 *   Downscale    to a 1600px long edge (see MAX_LONG_EDGE for why that
 *                number). A modern iPhone photo can exceed the old 8 MB
 *                cap outright and costs vision latency for detail the
 *                segmentation does not use.
 *   Metadata     dropped entirely, GPS included. The encoder writes no
 *                EXIF, so this is by construction rather than by a
 *                stripping pass that could miss a container.
 *
 * ---------------------------------------------------------------------
 * What is deliberately NOT normalised
 * ---------------------------------------------------------------------
 * PNG, GIF and WebP pass through untouched. Nothing shoots them — they
 * are screenshots and saved web images — so they carry no orientation tag
 * and no coordinates, and adding a PNG and a WebP codec to normalise
 * formats no camera produces would be dependency for its own sake. The
 * cost of that choice is that they cannot be shrunk, so they are held to a
 * smaller ceiling (MAX_PASSTHROUGH_BYTES) that keeps them inside the
 * vision API's own per-image limit. If that ever bites a real customer the
 * fix is a decoder for the offending format here, and nothing above this
 * module has to change.
 *
 * ---------------------------------------------------------------------
 * Why the server and not the browser
 * ---------------------------------------------------------------------
 * Converting HEIC in the browser is a real alternative and it was
 * rejected on the thirty seconds. Every in-browser HEIC decoder is the
 * same libheif wasm build this uses — around 6 MB unpacked — and it would
 * have to reach the phone *before* the first upload could start, over
 * whatever cellular connection the customer is standing on. That is a
 * multi-second tax on the first interaction of the funnel, paid by every
 * visitor including the ones who upload a JPEG. Here the wasm is loaded
 * lazily, in a warm server process, only when a HEIC actually arrives.
 *
 * Server-only (dynamically imports a wasm decoder).
 */
import { Buffer } from "node:buffer";

import type { VisionImageMediaType } from "../vision/mediaTypes";

import { jpegOrientation } from "./exif";
import { findJpegExif } from "./exif";
import {
  isHeic,
  sniffMediaType,
  UPLOAD_MEDIA_TYPE_LABEL,
  type UploadImageMediaType,
} from "./mediaTypes";
import type { Orientation } from "./exif";
import {
  MAX_PASSTHROUGH_BYTES,
  MAX_PIXELS,
  MAX_UPLOAD_BYTES,
} from "./limits";
import {
  MAX_LONG_EDGE,
  applyOrientation,
  fitWithin,
  resize,
  toRgba,
  type RasterImage,
} from "./transform";

/** JPEG quality for the re-encode. */
const JPEG_QUALITY = 82;

/** Refusals a customer sees. Everything else is a 500. */
export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

export type NormalizedPhoto = {
  bytes: Buffer;
  /** Always a type the vision API accepts — enforced by a test. */
  mediaType: VisionImageMediaType;
  width: number | null;
  height: number | null;
  /** What arrived, when it differs from what is being stored. */
  transcodedFrom: UploadImageMediaType | null;
  /** The tag that was baked in; 1 when there was nothing to do. */
  orientationApplied: Orientation;
  /** The source dimensions, when the image was shrunk. */
  resizedFrom: { width: number; height: number } | null;
};

/**
 * The codecs are imported lazily rather than at module load: the HEIC
 * decoder is a ~6 MB wasm bundle and most uploads never touch it, and
 * `lib/image` is imported by the route file, which Next evaluates on every
 * cold start.
 */
type JpegCodec = typeof import("jpeg-js");

async function jpegCodec(): Promise<JpegCodec> {
  return import("jpeg-js");
}

function encodeJpeg(codec: JpegCodec, image: RasterImage): Buffer {
  const rgba = toRgba(image);
  const encoded = codec.encode(
    { data: rgba.data, width: rgba.width, height: rgba.height },
    JPEG_QUALITY,
  );
  return Buffer.from(encoded.data);
}

function guardPixels(width: number, height: number): void {
  if (width * height > MAX_PIXELS) {
    throw new UnsupportedImageError(
      "That image is too large to analyse — try a normal camera photo.",
    );
  }
}

/**
 * Bytes in, storable bytes out.
 *
 * `declaredMediaType` is the browser's `File.type` and is only a fallback
 * for the error message: the decision is made from the leading bytes,
 * because Safari reports `""` for a HEIC out of Photos and an Android
 * picker reports `application/octet-stream` for anything it does not know.
 */
export async function normalizePhoto(
  input: Buffer,
  declaredMediaType = "",
): Promise<NormalizedPhoto> {
  const sniffed = sniffMediaType(input);
  if (!sniffed) {
    const named = declaredMediaType ? `"${declaredMediaType}"` : "that file";
    throw new UnsupportedImageError(
      `We can't read ${named} — use ${UPLOAD_MEDIA_TYPE_LABEL}.`,
    );
  }

  if (isHeic(sniffed)) return normalizeHeic(input, sniffed);
  if (sniffed === "image/jpeg") return normalizeJpeg(input);

  // PNG / GIF / WebP: stored as they arrived. See the header note.
  if (input.byteLength > MAX_PASSTHROUGH_BYTES) {
    throw new UnsupportedImageError(
      "That file is too large for us to analyse. A photo straight from your " +
        "camera works best — we resize those for you.",
    );
  }
  return {
    bytes: input,
    mediaType: sniffed,
    width: null,
    height: null,
    transcodedFrom: null,
    orientationApplied: 1,
    resizedFrom: null,
  };
}

async function normalizeJpeg(input: Buffer): Promise<NormalizedPhoto> {
  const orientation = jpegOrientation(input);
  const hasExif = findJpegExif(input) !== null;

  const codec = await jpegCodec();
  // RGB rather than RGBA: a third less to allocate and copy on a 48 MP
  // photo, and the alpha channel is discarded on the way out anyway.
  const decoded = codec.decode(input, { useTArray: true, formatAsRGBA: false });
  guardPixels(decoded.width, decoded.height);

  const source: RasterImage = {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data,
    channels: 3,
  };

  const upright = applyOrientation(source, orientation);
  const target = fitWithin(upright.width, upright.height);
  const shrunk = target.width !== upright.width || target.height !== upright.height;
  const final = shrunk ? resize(upright, target.width, target.height) : upright;

  // Nothing to change and nothing to strip: keep the customer's own bytes
  // rather than paying a generation of JPEG loss to produce a copy.
  if (!shrunk && orientation === 1 && !hasExif) {
    return {
      bytes: input,
      mediaType: "image/jpeg",
      width: final.width,
      height: final.height,
      transcodedFrom: null,
      orientationApplied: 1,
      resizedFrom: null,
    };
  }

  return {
    bytes: encodeJpeg(codec, final),
    mediaType: "image/jpeg",
    width: final.width,
    height: final.height,
    transcodedFrom: null,
    orientationApplied: orientation,
    resizedFrom: shrunk ? { width: upright.width, height: upright.height } : null,
  };
}

/**
 * HEIC → JPEG.
 *
 * Orientation is libheif's job here and not this module's. In HEIF the
 * rotation lives in the container's own `irot`/`imir` transform
 * properties, not in EXIF — ISO/IEC 23008-12 says an EXIF orientation tag
 * in a HEIF file is to be ignored — and libheif applies those properties
 * while decoding, so what comes back is already upright. Applying the EXIF
 * tag on top of that is the classic double-rotation bug. If a file ever
 * turns up where this is wrong, this is the paragraph to argue with.
 */
async function normalizeHeic(
  input: Buffer,
  from: UploadImageMediaType,
): Promise<NormalizedPhoto> {
  const { default: decodeHeic } = await import("heic-decode");

  let decoded: { width: number; height: number; data: ArrayBufferLike };
  try {
    decoded = await decodeHeic({ buffer: input });
  } catch {
    throw new UnsupportedImageError(
      "We couldn't read that HEIC photo. Try sending it as a JPEG.",
    );
  }
  guardPixels(decoded.width, decoded.height);

  const source: RasterImage = {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8Array(decoded.data),
    channels: 4,
  };
  const target = fitWithin(source.width, source.height);
  const shrunk = target.width !== source.width || target.height !== source.height;
  const final = shrunk ? resize(source, target.width, target.height) : source;

  const codec = await jpegCodec();
  return {
    bytes: encodeJpeg(codec, final),
    mediaType: "image/jpeg",
    width: final.width,
    height: final.height,
    transcodedFrom: from,
    orientationApplied: 1,
    resizedFrom: shrunk ? { width: source.width, height: source.height } : null,
  };
}

export { MAX_LONG_EDGE, MAX_PASSTHROUGH_BYTES, MAX_PIXELS, MAX_UPLOAD_BYTES };
