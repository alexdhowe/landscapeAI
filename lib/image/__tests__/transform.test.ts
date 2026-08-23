/**
 * The pixel transforms, on their own. Pure functions over tiny rasters —
 * no codec, no fixture, no I/O.
 */
import { describe, expect, it } from "vitest";

import type { Orientation } from "../exif";
import {
  MAX_LONG_EDGE,
  applyOrientation,
  fitWithin,
  orientationSwapsAxes,
  resize,
  toRgba,
  type RasterImage,
} from "../transform";

/** A 2x1 raster: left pixel red, right pixel blue. */
function twoByOne(): RasterImage {
  return {
    width: 2,
    height: 1,
    data: new Uint8Array([255, 0, 0, 0, 0, 255]),
    channels: 3,
  };
}

const pixel = (img: RasterImage, x: number, y: number) => {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

describe("fitWithin", () => {
  it("caps the long edge and preserves the ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("never upscales", () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(MAX_LONG_EDGE, 900)).toEqual({ width: MAX_LONG_EDGE, height: 900 });
  });

  it("keeps a very thin image at least one pixel tall", () => {
    expect(fitWithin(8000, 3).height).toBe(1);
  });
});

describe("applyOrientation", () => {
  it("returns the input untouched when there is nothing to do", () => {
    const source = twoByOne();
    expect(applyOrientation(source, 1)).toBe(source);
  });

  it("mirrors horizontally for orientation 2", () => {
    const out = applyOrientation(twoByOne(), 2);
    expect([out.width, out.height]).toEqual([2, 1]);
    expect(pixel(out, 0, 0)).toEqual([0, 0, 255]);
    expect(pixel(out, 1, 0)).toEqual([255, 0, 0]);
  });

  it("turns 90° clockwise for orientation 6 — the iPhone portrait case", () => {
    const out = applyOrientation(twoByOne(), 6);
    expect([out.width, out.height]).toEqual([1, 2]);
    // The left-hand red pixel ends up on top.
    expect(pixel(out, 0, 0)).toEqual([255, 0, 0]);
    expect(pixel(out, 0, 1)).toEqual([0, 0, 255]);
  });

  it("turns 90° counter-clockwise for orientation 8", () => {
    const out = applyOrientation(twoByOne(), 8);
    expect([out.width, out.height]).toEqual([1, 2]);
    expect(pixel(out, 0, 0)).toEqual([0, 0, 255]);
    expect(pixel(out, 0, 1)).toEqual([255, 0, 0]);
  });

  it("swaps axes for exactly the four rotated orientations", () => {
    const swapped = ([1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]).filter(
      orientationSwapsAxes,
    );
    expect(swapped).toEqual([5, 6, 7, 8]);
  });

  it("round-trips every orientation back to the original size", () => {
    const source: RasterImage = {
      width: 3,
      height: 2,
      data: new Uint8Array(3 * 2 * 3).map((_, i) => i * 7),
      channels: 3,
    };
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]) {
      const out = applyOrientation(source, o);
      const area = out.width * out.height;
      expect(area, `orientation ${o}`).toBe(6);
      // Every source byte is present exactly once — a transform, not a
      // resample.
      expect([...out.data].sort((a, b) => a - b)).toEqual(
        [...source.data].sort((a, b) => a - b),
      );
    }
  });
});

describe("resize", () => {
  it("averages the pixels it covers rather than picking one", () => {
    const source: RasterImage = {
      width: 2,
      height: 2,
      data: new Uint8Array([0, 0, 0, 100, 100, 100, 100, 100, 100, 200, 200, 200]),
      channels: 3,
    };
    const out = resize(source, 1, 1);
    expect(pixel(out, 0, 0)).toEqual([100, 100, 100]);
  });

  it("refuses to upscale", () => {
    const out = resize(twoByOne(), 40, 40);
    expect([out.width, out.height]).toEqual([2, 1]);
  });

  it("can widen to RGBA on the way out", () => {
    const out = resize(twoByOne(), 2, 1, 4);
    expect(out.channels).toBe(4);
    expect(out.data.length).toBe(8);
    expect(out.data[3]).toBe(255);
  });
});

describe("toRgba", () => {
  it("adds an opaque alpha channel", () => {
    const out = toRgba(twoByOne());
    expect(out.channels).toBe(4);
    expect([...out.data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it("passes RGBA through untouched", () => {
    const already: RasterImage = {
      width: 1,
      height: 1,
      data: new Uint8Array([1, 2, 3, 4]),
      channels: 4,
    };
    expect(toRgba(already)).toBe(already);
  });
});
