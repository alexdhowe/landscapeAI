/**
 * The upload normalisation path, against real files.
 *
 * The HEIC case runs the actual libheif wasm decoder over an actual HEIF
 * container (see fixtures/README.md) rather than mocking it, because the
 * thing most likely to be wrong is whether that decoder does what this
 * module believes it does — in particular whether it applies the
 * container's rotation, which nothing but a real file can answer.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { exifHasGps, findJpegExif, jpegHasExif, jpegOrientation } from "../exif";
import { isHeic, sniffMediaType } from "../mediaTypes";
import {
  MAX_PASSTHROUGH_BYTES,
  UnsupportedImageError,
  normalizePhoto,
} from "../normalize";
import { MAX_LONG_EDGE } from "../transform";
import { VISION_IMAGE_MEDIA_TYPES } from "../../vision/mediaTypes";

const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name));

const HEIC = fixture("portrait-iphone.heic");
const PORTRAIT_JPEG = fixture("portrait-iphone.jpg");
const UPRIGHT_GPS_JPEG = fixture("upright-with-gps.jpg");

/** Decode a JPEG back to pixels so a test can look at a corner. */
async function pixels(bytes: Buffer) {
  const jpeg = await import("jpeg-js");
  const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return {
    width: raw.width,
    height: raw.height,
    at(x: number, y: number) {
      const i = (y * raw.width + x) * 4;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]] as const;
    },
  };
}

/** Which named colour a sample is closest to. */
const COLOURS = {
  red: [214, 48, 40],
  green: [40, 168, 72],
  blue: [48, 76, 208],
  yellow: [232, 196, 40],
} as const;

function nearest(sample: readonly number[]): keyof typeof COLOURS {
  let best: keyof typeof COLOURS = "red";
  let bestDistance = Infinity;
  for (const [name, rgb] of Object.entries(COLOURS) as [keyof typeof COLOURS, readonly number[]][]) {
    const d =
      (sample[0] - rgb[0]) ** 2 + (sample[1] - rgb[1]) ** 2 + (sample[2] - rgb[2]) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = name;
    }
  }
  return best;
}

/**
 * The EXIF payload inside a HEIF container.
 *
 * Not a box parser: HEIF puts the EXIF item's bytes in `mdat` as a 4-byte
 * offset followed by a bare TIFF header, and writers differ on whether an
 * "Exif\0\0" preamble sits in between. Scanning for the TIFF magic is
 * enough for a fixture, and all this needs to do is prove the fixture
 * really does carry coordinates before the stripping test claims to have
 * removed them.
 */
function heifExif(bytes: Buffer): Uint8Array | null {
  for (const magic of ["MM\u0000*\u0000\u0000\u0000\b", "II*\u0000\b\u0000\u0000\u0000"]) {
    const at = bytes.indexOf(Buffer.from(magic, "latin1"));
    if (at >= 0) return bytes.subarray(at);
  }
  return null;
}

describe("media type sniffing", () => {
  it("recognises the fixtures from their leading bytes", () => {
    expect(sniffMediaType(HEIC)).toBe("image/heic");
    expect(sniffMediaType(PORTRAIT_JPEG)).toBe("image/jpeg");
  });

  it("does not take the browser's word for it", async () => {
    // Safari reports "" for a HEIC out of Photos; an Android picker
    // reports application/octet-stream. Both must still work.
    const result = await normalizePhoto(HEIC, "application/octet-stream");
    expect(result.transcodedFrom).toBe("image/heic");
  });

  it("refuses bytes that are not an image we read", async () => {
    const notAnImage = Buffer.from("This is a PDF, honestly. ".repeat(4), "utf8");
    await expect(normalizePhoto(notAnImage, "image/jpeg")).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
  });
});

describe("HEIC off an iPhone", () => {
  it("is a real HEIF container carrying coordinates", () => {
    expect(HEIC.subarray(4, 12).toString("latin1")).toBe("ftypheic");
    expect(exifHasGps(heifExif(HEIC))).toBe(true);
  });

  it("becomes a JPEG the vision API accepts", async () => {
    const result = await normalizePhoto(HEIC, "image/heic");
    expect(result.mediaType).toBe("image/jpeg");
    expect(VISION_IMAGE_MEDIA_TYPES).toContain(result.mediaType);
    expect(result.transcodedFrom).toBe("image/heic");
    expect(result.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("comes out portrait, the way the phone displays it", async () => {
    // Stored 64x48 landscape, displayed 48x64 portrait. If the rotation
    // were dropped every segmentation polygon would land sideways.
    const result = await normalizePhoto(HEIC, "image/heic");
    expect(result.width).toBe(48);
    expect(result.height).toBe(64);

    const out = await pixels(result.bytes);
    // A 90° clockwise turn sends the original top-left to the top-right.
    expect(nearest(out.at(out.width - 4, 4))).toBe("red");
    expect(nearest(out.at(out.width - 4, out.height - 4))).toBe("green");
    expect(nearest(out.at(4, 4))).toBe("blue");
    expect(nearest(out.at(4, out.height - 4))).toBe("yellow");
  });

  it("carries no metadata into storage", async () => {
    const result = await normalizePhoto(HEIC, "image/heic");
    expect(jpegHasExif(result.bytes)).toBe(false);
    expect(result.bytes.includes(Buffer.from("Exif", "latin1"))).toBe(false);
  });
});

describe("EXIF orientation on a JPEG", () => {
  it("the fixture really does carry the tag", () => {
    expect(jpegOrientation(PORTRAIT_JPEG)).toBe(6);
  });

  it("is baked into the pixels and the tag is gone", async () => {
    const result = await normalizePhoto(PORTRAIT_JPEG, "image/jpeg");
    expect(result.orientationApplied).toBe(6);
    expect(result.width).toBe(48);
    expect(result.height).toBe(64);
    expect(jpegOrientation(result.bytes)).toBe(1);
    expect(jpegHasExif(result.bytes)).toBe(false);

    const out = await pixels(result.bytes);
    expect(nearest(out.at(out.width - 4, 4))).toBe("red");
    expect(nearest(out.at(4, 4))).toBe("blue");
  });
});

describe("GPS", () => {
  it("the upright fixture really does carry coordinates", () => {
    expect(exifHasGps(findJpegExif(UPRIGHT_GPS_JPEG))).toBe(true);
  });

  it("is dropped even when there is nothing else to do", async () => {
    // Small enough not to resize and upright enough not to rotate: the
    // only reason to re-encode this image is the coordinates.
    const result = await normalizePhoto(UPRIGHT_GPS_JPEG, "image/jpeg");
    expect(result.orientationApplied).toBe(1);
    expect(result.resizedFrom).toBeNull();
    expect(jpegHasExif(result.bytes)).toBe(false);
    expect(exifHasGps(findJpegExif(result.bytes))).toBe(false);
  });
});

describe("downscale", () => {
  /** A JPEG of the given size, built in-process — no fixture to commit. */
  async function syntheticJpeg(width: number, height: number) {
    const jpeg = await import("jpeg-js");
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = (x * 255) / width;
        data[i + 1] = (y * 255) / height;
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }
    return Buffer.from(jpeg.encode({ data, width, height }, 90).data);
  }

  it("caps the long edge and keeps the aspect ratio", async () => {
    const big = await syntheticJpeg(2400, 1800);
    const result = await normalizePhoto(big, "image/jpeg");
    expect(result.width).toBe(MAX_LONG_EDGE);
    expect(result.height).toBe(1200);
    expect(result.resizedFrom).toEqual({ width: 2400, height: 1800 });
    expect(result.bytes.byteLength).toBeLessThan(big.byteLength);
  });

  it("leaves an already-small photo at its own size", async () => {
    const small = await syntheticJpeg(800, 600);
    const result = await normalizePhoto(small, "image/jpeg");
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.resizedFrom).toBeNull();
    // Nothing to strip, nothing to rotate, nothing to shrink: the
    // customer's own bytes, not a re-compressed copy of them.
    expect(result.bytes).toBe(small);
  });
});

describe("formats that pass through", () => {
  const png = (() => {
    // A 1x1 PNG is enough: nothing decodes it, the point is the branch.
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    return Buffer.from(base64, "base64");
  })();

  it("stores a PNG exactly as it arrived", async () => {
    const result = await normalizePhoto(png, "image/png");
    expect(result.mediaType).toBe("image/png");
    expect(result.bytes).toBe(png);
    expect(result.transcodedFrom).toBeNull();
  });

  it("refuses one too large to reach the vision API", async () => {
    const oversized = Buffer.concat([png, Buffer.alloc(MAX_PASSTHROUGH_BYTES)]);
    await expect(normalizePhoto(oversized, "image/png")).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
  });
});

describe("the media type split", () => {
  it("never hands storage something the vision API cannot read", async () => {
    // The invariant the whole split exists for: whatever a customer is
    // allowed to upload, what comes out of here is on the vision list.
    for (const input of [HEIC, PORTRAIT_JPEG, UPRIGHT_GPS_JPEG]) {
      const result = await normalizePhoto(input);
      expect(VISION_IMAGE_MEDIA_TYPES).toContain(result.mediaType);
    }
  });

  it("keeps HEIC on the upload list and off the vision list", () => {
    expect(isHeic("image/heic")).toBe(true);
    expect(VISION_IMAGE_MEDIA_TYPES).not.toContain("image/heic" as never);
  });
});
