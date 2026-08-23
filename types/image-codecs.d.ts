/**
 * Declarations for the two image codecs. Neither ships types and neither
 * has a @types package; both are pure JavaScript with a small surface, so
 * the surface this app uses is written out rather than left as `any`.
 */
declare module "heic-decode" {
  type DecodedImage = {
    width: number;
    height: number;
    /** RGBA, 4 bytes per pixel, already upright — libheif applies the
     *  container's irot/imir transform properties while decoding. */
    data: ArrayBufferLike;
  };
  function decode(options: { buffer: Uint8Array }): Promise<DecodedImage>;
  export default decode;
}

declare module "jpeg-js" {
  type RawImage = { width: number; height: number; data: Uint8Array };
  export function decode(
    data: Uint8Array,
    options?: { useTArray?: boolean; formatAsRGBA?: boolean; maxMemoryUsageInMB?: number },
  ): RawImage;
  export function encode(
    image: { data: Uint8Array | Buffer; width: number; height: number },
    quality?: number,
  ): { data: Uint8Array; width: number; height: number };
  const _default: { decode: typeof decode; encode: typeof encode };
  export default _default;
}
