/**
 * Reading a photo's size out of its header.
 *
 * Against real encoders where there are any: the JPEG cases go through
 * `jpeg-js` and the repository's own iPhone fixtures, because the point
 * of this module is to agree with a decoder without being one. What it
 * feeds is the customer's wait estimate, so the failure that matters is
 * not "wrong by a pixel" — it is claiming a size for something it has not
 * actually understood, which would put a confident and wrong countdown on
 * the screen. Every case that cannot be read must come back null.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { imageDimensions, imagePixels } from "../dimensions";

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name));

/** The same bytes, decoded properly, for the header parse to agree with. */
async function decodedSize(bytes: Buffer) {
  const jpeg = await import("jpeg-js");
  const raw = jpeg.decode(bytes, { useTArray: true });
  return { width: raw.width, height: raw.height };
}

describe("imageDimensions", () => {
  it("agrees with a real JPEG decoder", async () => {
    for (const name of ["portrait-iphone.jpg", "upright-with-gps.jpg"]) {
      const bytes = fixture(name);
      expect(imageDimensions(bytes)).toEqual(await decodedSize(bytes));
    }
  });

  it("walks past the metadata segments an iPhone writes", () => {
    // This fixture carries EXIF (and GPS) before the frame header, which
    // is the case a naive "read bytes 5-9" parser gets wrong.
    expect(imageDimensions(fixture("upright-with-gps.jpg"))).not.toBeNull();
  });

  it("reads a PNG", () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(0x0d0a1a0a, 4);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1600, 16);
    png.writeUInt32BE(1200, 20);
    expect(imageDimensions(png)).toEqual({ width: 1600, height: 1200 });
  });

  it("reads a GIF, which counts little-endian and from the other end", () => {
    const gif = Buffer.alloc(10);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(640, 6);
    gif.writeUInt16LE(480, 8);
    expect(imageDimensions(gif)).toEqual({ width: 640, height: 480 });
  });

  it("reads a lossy WebP", () => {
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8 ", 12, "ascii");
    webp.writeUInt16LE(800, 26);
    webp.writeUInt16LE(600, 28);
    expect(imageDimensions(webp)).toEqual({ width: 800, height: 600 });
  });

  it("says nothing rather than something wrong", () => {
    expect(imageDimensions(Buffer.alloc(0))).toBeNull();
    expect(imageDimensions(Buffer.from("not an image at all"))).toBeNull();
    // A HEIC never reaches this — the upload route converts it — and a
    // parser that guessed at one would be worse than one that declines.
    expect(imageDimensions(fixture("portrait-iphone.heic"))).toBeNull();
    // Truncated to the signature and nothing else.
    expect(imageDimensions(fixture("portrait-iphone.jpg").subarray(0, 4))).toBeNull();
  });
});

describe("imagePixels", () => {
  it("is the area, for the wait estimate that is all it wants", async () => {
    const bytes = fixture("portrait-iphone.jpg");
    const { width, height } = await decodedSize(bytes);
    expect(imagePixels(bytes)).toBe(width * height);
  });

  it("is null when the size is", () => {
    expect(imagePixels(Buffer.from("nope"))).toBeNull();
  });
});
