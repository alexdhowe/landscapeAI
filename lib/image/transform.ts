/**
 * Pixel transforms: orientation and downscale.
 *
 * Pure functions over a raw raster. No decoding, no encoding, no I/O —
 * which is what makes them testable without a fixture and reusable for
 * whatever decodes next.
 */
import type { Orientation } from "./exif";
import { MAX_LONG_EDGE } from "./limits";

export { MAX_LONG_EDGE };

export type RasterImage = {
  width: number;
  height: number;
  /** Interleaved samples, `channels` bytes per pixel. */
  data: Uint8Array;
  channels: 3 | 4;
};

/** Target dimensions for a long-edge cap. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_LONG_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Where a source pixel goes under each EXIF orientation, as
 * (swapAxes, flipX, flipY) applied to the *destination* coordinate.
 *
 * 1 upright · 2 mirrored · 3 180° · 4 mirrored+180°
 * 5 mirrored+90°CW · 6 90°CW · 7 mirrored+90°CCW · 8 90°CCW
 */
const ORIENTATIONS: Record<
  Orientation,
  { swap: boolean; flipX: boolean; flipY: boolean }
> = {
  1: { swap: false, flipX: false, flipY: false },
  2: { swap: false, flipX: true, flipY: false },
  3: { swap: false, flipX: true, flipY: true },
  4: { swap: false, flipX: false, flipY: true },
  5: { swap: true, flipX: false, flipY: false },
  6: { swap: true, flipX: true, flipY: false },
  7: { swap: true, flipX: true, flipY: true },
  8: { swap: true, flipX: false, flipY: true },
};

export function orientationSwapsAxes(orientation: Orientation): boolean {
  return ORIENTATIONS[orientation].swap;
}

/**
 * Bake an EXIF orientation into the pixels.
 *
 * Returns the input untouched for orientation 1, which is the overwhelming
 * majority of uploads and not worth a full copy.
 */
export function applyOrientation(
  image: RasterImage,
  orientation: Orientation,
): RasterImage {
  if (orientation === 1) return image;
  const { swap, flipX, flipY } = ORIENTATIONS[orientation];
  const { width: sw, height: sh, data: src, channels: ch } = image;
  const dw = swap ? sh : sw;
  const dh = swap ? sw : sh;
  const out = new Uint8Array(dw * dh * ch);

  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      // Undo the flips, then undo the transpose, to land on the source.
      const ux = flipX ? dw - 1 - dx : dx;
      const uy = flipY ? dh - 1 - dy : dy;
      const sx = swap ? uy : ux;
      const sy = swap ? ux : uy;
      let s = (sy * sw + sx) * ch;
      let d = (dy * dw + dx) * ch;
      for (let c = 0; c < ch; c++) out[d++] = src[s++];
    }
  }
  return { width: dw, height: dh, data: out, channels: ch };
}

/**
 * Area-average downscale.
 *
 * Every destination pixel is the mean of the source pixels it covers,
 * which is the right filter for shrinking and cheap enough to write out.
 * Nearest-neighbour would alias a photograph of grass and mulch into
 * something that looks like a compression artefact, which is the opposite
 * of the point.
 *
 * Refuses to upscale: pass a target no larger than the source.
 */
export function resize(
  image: RasterImage,
  targetWidth: number,
  targetHeight: number,
  outChannels: 3 | 4 = image.channels,
): RasterImage {
  const { width: sw, height: sh, data: src, channels: ch } = image;
  const dw = Math.max(1, Math.min(targetWidth, sw));
  const dh = Math.max(1, Math.min(targetHeight, sh));
  const out = new Uint8Array(dw * dh * outChannels);
  const xRatio = sw / dw;
  const yRatio = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.floor((dy + 1) * yRatio)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.floor((dx + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        let s = (y * sw + x0) * ch;
        for (let x = x0; x < x1; x++) {
          r += src[s];
          g += src[s + 1];
          b += src[s + 2];
          s += ch;
          n++;
        }
      }
      let d = (dy * dw + dx) * outChannels;
      out[d++] = r / n;
      out[d++] = g / n;
      out[d++] = b / n;
      if (outChannels === 4) out[d] = 255;
    }
  }
  return { width: dw, height: dh, data: out, channels: outChannels };
}

/** Widen to RGBA, which is what the JPEG encoder wants. */
export function toRgba(image: RasterImage): RasterImage {
  if (image.channels === 4) return image;
  const { width, height, data } = image;
  const out = new Uint8Array(width * height * 4);
  for (let i = 0, s = 0, d = 0; i < width * height; i++) {
    out[d++] = data[s++];
    out[d++] = data[s++];
    out[d++] = data[s++];
    out[d++] = 255;
  }
  return { width, height, data: out, channels: 4 };
}
