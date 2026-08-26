/**
 * How big a stored photo is, read from its header.
 *
 * The wait estimate needs a pixel count and nothing else, and decoding a
 * 1600×1200 JPEG to get one costs about a second and a half of pure-JS
 * CPU on the critical path of a request whose whole job is to start a
 * vision call promptly. Every format this application stores writes its
 * dimensions in the first few dozen bytes, so this reads those instead.
 *
 * Deliberately partial. It answers for the four types the vision API
 * accepts and returns null for anything else, and null is a first-class
 * answer everywhere it is used: an unreadable header costs the estimate
 * its precision, never the upload.
 *
 * Pure — a buffer in, a size or null out.
 */

export type PixelSize = { width: number; height: number };

/** The dimensions of an image, or null if this build cannot read them. */
export function imageDimensions(bytes: Buffer): PixelSize | null {
  return jpegSize(bytes) ?? pngSize(bytes) ?? gifSize(bytes) ?? webpSize(bytes);
}

/** The pixel count, for callers that only want the area. */
export function imagePixels(bytes: Buffer): number | null {
  const size = imageDimensions(bytes);
  return size ? size.width * size.height : null;
}

/**
 * JPEG: walk the marker segments to the frame header.
 *
 * The size lives in whichever SOF marker the encoder used, and which one
 * that is depends on the encoding — baseline, progressive, arithmetic —
 * so the walk accepts the whole SOF range and skips the two in it that
 * are not frame headers (DHT at C4, DAC at CC, and the RSTn run at D0-D7).
 */
function jpegSize(bytes: Buffer): PixelSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // Padding between segments is legal and is written as repeated 0xff.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan: the entropy-coded data begins and there is no frame
    // header after it.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      if (offset + 9 > bytes.length) return null;
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}

/** PNG: the IHDR chunk is always first and always at a fixed offset. */
function pngSize(bytes: Buffer): PixelSize | null {
  if (bytes.length < 24) return null;
  if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
    return null;
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** GIF: little-endian screen descriptor, right after the signature. */
function gifSize(bytes: Buffer): PixelSize | null {
  if (bytes.length < 10) return null;
  const signature = bytes.toString("ascii", 0, 6);
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * WebP: three container variants, and the dimensions sit in a different
 * place and a different bit layout in each.
 */
function webpSize(bytes: Buffer): PixelSize | null {
  if (bytes.length < 30) return null;
  if (bytes.toString("ascii", 0, 4) !== "RIFF") return null;
  if (bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    // Lossy: a 3-byte start code, then 14-bit width and height.
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8L") {
    // Lossless: 14 bits each, packed across four bytes after the signature.
    const bits = bytes.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (chunk === "VP8X") {
    // Extended: canvas size as two 24-bit little-endian values, minus one.
    const width = bytes.readUIntLE(24, 3) + 1;
    const height = bytes.readUIntLE(27, 3) + 1;
    return { width, height };
  }
  return null;
}
