/**
 * Reading EXIF, so it can be thrown away.
 *
 * Two tags matter to this application and they pull in opposite
 * directions:
 *
 *   Orientation  must be honoured. The browser applies it and the vision
 *                model does not, so a portrait iPhone photo that keeps its
 *                tag gets segmented sideways and every polygon lands on
 *                the wrong part of the picture.
 *   GPS          must not survive. A photo of somebody's house does not
 *                need to carry their coordinates into the object store.
 *                The address is asked for separately, on its own screen,
 *                with a decline button.
 *
 * Both are handled the same way: bake the rotation into the pixels and
 * re-encode. jpeg-js writes no EXIF at all, so the second requirement is
 * satisfied by construction rather than by a tag-stripping pass that could
 * miss a container — there is a test asserting the stored bytes carry no
 * APP1 segment.
 *
 * Pure: takes bytes, returns numbers. No I/O.
 */

/** The eight EXIF orientation values. 1 is "already upright". */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const ORIENTATION_TAG = 0x0112;
const GPS_IFD_TAG = 0x8825;

/**
 * The raw EXIF payload out of a JPEG's APP1 segment — the bytes starting
 * at the TIFF header, with the "Exif\0\0" preamble removed.
 *
 * Returns null when there is no APP1/Exif segment, which is the common
 * case for anything that is not a camera original.
 */
export function findJpegExif(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan: entropy-coded data follows, no more metadata.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;
    if (marker === 0xe1 && offset + 4 + 6 <= bytes.length) {
      const tag = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (tag === "Exif") {
        return bytes.subarray(offset + 10, offset + 2 + length);
      }
    }
    offset += 2 + length;
  }
  return null;
}

type Reader = {
  u16: (at: number) => number;
  u32: (at: number) => number;
};

/** A TIFF header reader, or null when `exif` does not start with one. */
function tiffReader(exif: Uint8Array): { read: Reader; ifd0: number } | null {
  if (exif.length < 8) return null;
  const le = exif[0] === 0x49 && exif[1] === 0x49;
  const be = exif[0] === 0x4d && exif[1] === 0x4d;
  if (!le && !be) return null;
  const view = new DataView(exif.buffer, exif.byteOffset, exif.byteLength);
  const read: Reader = {
    u16: (at) => view.getUint16(at, le),
    u32: (at) => view.getUint32(at, le),
  };
  if (read.u16(2) !== 42) return null;
  const ifd0 = read.u32(4);
  if (ifd0 < 8 || ifd0 + 2 > exif.length) return null;
  return { read, ifd0 };
}

/** Scan one IFD for `tag`, returning its SHORT/LONG value. */
function findTag(exif: Uint8Array, read: Reader, ifd: number, tag: number): number | null {
  if (ifd + 2 > exif.length) return null;
  const count = read.u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > exif.length) return null;
    if (read.u16(entry) !== tag) continue;
    const type = read.u16(entry + 2);
    if (type === 3) return read.u16(entry + 8); // SHORT
    if (type === 4) return read.u32(entry + 8); // LONG
    return null;
  }
  return null;
}

/**
 * The orientation tag from a raw EXIF payload, defaulting to 1.
 *
 * Anything outside 1–8 is a corrupt tag, and a corrupt tag is treated as
 * "upright" rather than as a reason to refuse the photo — the customer
 * cannot fix it and a slightly rotated preview beats a rejection.
 */
export function orientationFromExif(exif: Uint8Array | null): Orientation {
  if (!exif) return 1;
  const parsed = tiffReader(exif);
  if (!parsed) return 1;
  const value = findTag(exif, parsed.read, parsed.ifd0, ORIENTATION_TAG);
  return value !== null && value >= 1 && value <= 8 ? (value as Orientation) : 1;
}

/** Convenience: the orientation of a JPEG. */
export function jpegOrientation(bytes: Uint8Array): Orientation {
  return orientationFromExif(findJpegExif(bytes));
}

/**
 * Whether a raw EXIF payload carries a GPS IFD.
 *
 * Used by the tests to prove a fixture really does carry coordinates
 * before asserting the stored copy does not — a stripping test that
 * passes against an input with nothing to strip proves nothing.
 */
export function exifHasGps(exif: Uint8Array | null): boolean {
  if (!exif) return false;
  const parsed = tiffReader(exif);
  if (!parsed) return false;
  return findTag(exif, parsed.read, parsed.ifd0, GPS_IFD_TAG) !== null;
}

/** Whether a JPEG carries any EXIF at all. */
export function jpegHasExif(bytes: Uint8Array): boolean {
  return findJpegExif(bytes) !== null;
}
