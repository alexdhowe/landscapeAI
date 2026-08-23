/**
 * The numbers that bound an upload, in one file with no imports, so the
 * browser can state them in the same breath the server enforces them —
 * a client component that hard-codes "8 MB" in its copy is a lie waiting
 * for someone to change the server.
 *
 * Pure. Safe in a client bundle.
 */

/**
 * The ingest cap, checked before the body is read into memory.
 *
 * Was 8 MB, which a 48-megapixel iPhone photo exceeds outright — the
 * customer most likely to be standing in their yard with a phone was the
 * one most likely to be rejected. 25 MB covers a max-quality 48 MP JPEG
 * with headroom while still bounding what one request can allocate. What
 * lands in storage is far smaller: normalisation caps the long edge first.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * The ceiling for a format lib/image/normalize.ts cannot re-encode (PNG,
 * GIF, WebP). Sized to stay inside the vision API's ~5 MB per-image limit
 * once base64 has inflated it by a third.
 */
export const MAX_PASSTHROUGH_BYTES = 3.5 * 1024 * 1024;

/**
 * Decode-bomb guard. A 48 MP photo is 48 million pixels; anything past
 * this is not a photograph of a yard, and decoding it would allocate
 * hundreds of megabytes to find that out.
 */
export const MAX_PIXELS = 80_000_000;

/**
 * The long-edge cap for a stored photo.
 *
 * 1600 is not arbitrary. Claude's vision API resizes an image whose long
 * edge exceeds ~1568px before the model ever sees it, so every pixel above
 * that is upload latency and nothing else — and the upload sits on the
 * critical path of §2's thirty seconds. 1600 is just above that threshold,
 * rounded to something a human can remember, which leaves the design
 * canvas a little more than the model uses on the theory that the
 * customer's own photo is the one thing on the page worth pixels.
 *
 * The segmentation polygons are in normalised coordinates, so downscaling
 * costs the object graph nothing: §1's "the image is a view, never the
 * artifact" is exactly the licence to do this.
 */
export const MAX_LONG_EDGE = 1600;

/** Whole megabytes, for a sentence a customer reads. */
export const megabytes = (bytes: number): number => Math.round(bytes / 1024 / 1024);
