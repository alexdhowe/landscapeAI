/**
 * Drawing the first pass's outlines onto the photo, so the model can be
 * asked to correct something it can see rather than to produce coordinates
 * blind.
 *
 * These assert the properties the refinement pass depends on: that the
 * output is a decodable JPEG of the same size, that the outline is
 * actually drawn where the polygon says, that untouched ground is left
 * alone, and that anything it cannot handle comes back as "no second look"
 * rather than as an error.
 */
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";

import { OUTLINE_COLORS, annotateOutlines } from "../annotate";
import type { NormalizedPoint } from "../../vision/types";

const W = 240;
const H = 180;

/** A flat mid-grey photo, so anything drawn on it is unmistakable. */
function plainJpeg(): Buffer {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 128;
    data[i * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width: W, height: H }, 100).data);
}

function pixel(bytes: Buffer, x: number, y: number): [number, number, number] {
  const img = jpeg.decode(bytes, { useTArray: true });
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/** Closeness in RGB, loose enough to survive a JPEG round trip. */
function near(a: readonly number[], b: readonly number[], tolerance = 60) {
  return a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}

const BOX: NormalizedPoint[] = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
];

describe("annotateOutlines", () => {
  it("draws the outline where the polygon runs, and leaves the rest of the photo alone", async () => {
    const result = (await annotateOutlines(plainJpeg(), "image/jpeg", [
      { id: "bed", polygon: BOX },
    ]))!;
    expect(result).not.toBeNull();
    expect(result.mediaType).toBe("image/jpeg");

    const red = OUTLINE_COLORS[0].rgb;
    // On the top edge of the box.
    expect(near(pixel(result.bytes, Math.round(0.5 * W), Math.round(0.25 * H)), red)).toBe(true);
    // Well inside it — still the photo.
    expect(near(pixel(result.bytes, Math.round(0.5 * W), Math.round(0.5 * H)), [128, 128, 128])).toBe(true);
    // Well outside it — still the photo.
    expect(near(pixel(result.bytes, 4, 4), [128, 128, 128])).toBe(true);
  });

  it("keeps the photo's dimensions, so the coordinates still mean the same thing", async () => {
    const result = (await annotateOutlines(plainJpeg(), "image/jpeg", [
      { id: "bed", polygon: BOX },
    ]))!;
    const img = jpeg.decode(result.bytes, { useTArray: true });
    expect([img.width, img.height]).toEqual([W, H]);
  });

  it("gives each region its own colour and reports which", async () => {
    const result = (await annotateOutlines(plainJpeg(), "image/jpeg", [
      { id: "bed", polygon: BOX },
      { id: "lawn", polygon: [[0.05, 0.85], [0.95, 0.85], [0.95, 0.95], [0.05, 0.95]] },
    ]))!;
    expect(result.legend).toEqual([
      { id: "bed", color: OUTLINE_COLORS[0].name },
      { id: "lawn", color: OUTLINE_COLORS[1].name },
    ]);
    expect(near(pixel(result.bytes, Math.round(0.5 * W), Math.round(0.85 * H)), OUTLINE_COLORS[1].rgb)).toBe(true);
  });

  it("returns nothing to refine rather than failing", async () => {
    // A PNG the upload let through untouched, an empty region list, and
    // bytes that are not an image at all. None of these is an error: the
    // caller keeps the first pass.
    expect(await annotateOutlines(plainJpeg(), "image/png", [{ id: "bed", polygon: BOX }])).toBeNull();
    expect(await annotateOutlines(plainJpeg(), "image/jpeg", [])).toBeNull();
    expect(await annotateOutlines(Buffer.from("not an image"), "image/jpeg", [
      { id: "bed", polygon: BOX },
    ])).toBeNull();
  });
});
