/**
 * Drawing the model's own work back onto the photograph.
 *
 * Asking a vision model for polygon vertices in one shot gets you the
 * right area and the wrong edge: against a real yard the outline of a
 * curved bed came back as a few straight chords that covered lawn on one
 * side and missed bed on the other. Asking the same model to *correct* an
 * outline it can see drawn on the picture is a much easier question than
 * asking it to produce one blind, so the segmentation pass draws its first
 * answer here and sends it back for a second look.
 *
 * Each region gets its own colour and the prompt names them, which is why
 * this returns the assignment as well as the bytes — there is no text
 * rendering here, and none is wanted: a label burned into the picture is
 * one more thing for the model to mistake for a landscape feature.
 *
 * JPEG only. Everything the upload route stores after normalising is JPEG,
 * but a small PNG can pass through untouched, and the caller skips the
 * refinement pass rather than converting one — a second look is an
 * improvement, never a requirement.
 */
import type { NormalizedPoint } from "../vision/types";

/**
 * Colours a person would name the same way the model does, chosen to sit
 * on top of a yard: no greens (foliage), no browns (mulch), nothing dark
 * enough to read as shadow.
 */
export const OUTLINE_COLORS: readonly { name: string; rgb: [number, number, number] }[] = [
  { name: "red", rgb: [255, 32, 32] },
  { name: "blue", rgb: [16, 80, 255] },
  { name: "yellow", rgb: [255, 224, 0] },
  { name: "magenta", rgb: [255, 32, 208] },
  { name: "cyan", rgb: [0, 229, 255] },
  { name: "orange", rgb: [255, 138, 0] },
  { name: "white", rgb: [255, 255, 255] },
  { name: "purple", rgb: [160, 64, 255] },
];

export type OutlineSubject = {
  id: string;
  polygon: NormalizedPoint[];
};

/** Which colour each region was drawn in, so the prompt can name them. */
export type OutlineLegend = { id: string; color: string };

export type AnnotatedPhoto = {
  bytes: Buffer;
  mediaType: "image/jpeg";
  legend: OutlineLegend[];
};

type Raster = { data: Uint8Array; width: number; height: number };

/** Stamp a filled square of side 2r+1, clipped to the raster. */
function stamp(raster: Raster, cx: number, cy: number, r: number, rgb: [number, number, number]) {
  const x0 = Math.max(0, Math.round(cx - r));
  const x1 = Math.min(raster.width - 1, Math.round(cx + r));
  const y0 = Math.max(0, Math.round(cy - r));
  const y1 = Math.min(raster.height - 1, Math.round(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * raster.width + x) * 4;
      raster.data[i] = rgb[0];
      raster.data[i + 1] = rgb[1];
      raster.data[i + 2] = rgb[2];
      raster.data[i + 3] = 255;
    }
  }
}

/** A thick straight line, walked at whole-pixel steps along its longer axis. */
function line(
  raster: Raster,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  rgb: [number, number, number],
) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stamp(raster, ax + (bx - ax) * t, ay + (by - ay) * t, r, rgb);
  }
}

/**
 * Draw each subject's outline on a copy of the photo.
 *
 * Returns null when the bytes are not a JPEG this can decode, which the
 * caller treats as "no second look available" rather than as an error.
 */
export async function annotateOutlines(
  photo: Buffer,
  mediaType: string,
  subjects: readonly OutlineSubject[],
): Promise<AnnotatedPhoto | null> {
  if (mediaType !== "image/jpeg" || subjects.length === 0) return null;

  let decoded: { data: Uint8Array; width: number; height: number };
  try {
    const jpeg = await import("jpeg-js");
    decoded = jpeg.decode(photo, { useTArray: true });
  } catch {
    return null;
  }
  const raster: Raster = {
    data: decoded.data,
    width: decoded.width,
    height: decoded.height,
  };
  if (!raster.width || !raster.height) return null;

  // Scaled to the picture rather than fixed: a stroke that reads clearly at
  // 1600px is invisible at 400 and covers the edge it is describing at 4000.
  const strokeRadius = Math.max(1, Math.round(raster.width * 0.0022));
  const vertexRadius = strokeRadius * 3;

  const legend: OutlineLegend[] = [];
  subjects.forEach((subject, i) => {
    const swatch = OUTLINE_COLORS[i % OUTLINE_COLORS.length];
    legend.push({ id: subject.id, color: swatch.name });
    const points = subject.polygon.map(
      ([x, y]) => [x * raster.width, y * raster.height] as const,
    );
    for (let p = 0; p < points.length; p++) {
      const [ax, ay] = points[p];
      const [bx, by] = points[(p + 1) % points.length];
      line(raster, ax, ay, bx, by, strokeRadius, swatch.rgb);
    }
    // The vertices themselves, so "move this corner" has something to
    // refer to and the model can see how few of them there are.
    for (const [x, y] of points) stamp(raster, x, y, vertexRadius, swatch.rgb);
  });

  const jpeg = await import("jpeg-js");
  const encoded = jpeg.encode(
    { data: raster.data, width: raster.width, height: raster.height },
    88,
  );
  return { bytes: Buffer.from(encoded.data), mediaType: "image/jpeg", legend };
}
