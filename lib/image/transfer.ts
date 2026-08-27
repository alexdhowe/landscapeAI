/**
 * Which file a paste or a drop actually meant.
 *
 * The desktop entry points hand over a *bag* rather than a file. A drop
 * from Finder can carry several; a paste out of the clipboard usually
 * carries the image alongside a text/html fragment describing it, and a
 * paste copied from a web page may carry nothing else at all.
 *
 * Choosing from that bag is not `files[0]`. Two things make it a
 * decision:
 *
 *   - **`File.type` is a hint, not a fact.** Safari reports `""` for a
 *     HEIC dragged out of Photos, several file managers report
 *     `application/octet-stream` for anything they do not recognise, and
 *     either can be set to whatever the page likes. `sniffMediaType` in
 *     ./mediaTypes reads the bytes and is the actual gate — but it runs on
 *     the server, after an upload this function decides whether to start.
 *     So an unrecognised type must not be a refusal here: refusing it
 *     locally means an iPhone photo that silently does nothing, and the
 *     customer has no way to learn why. Sending it means the server
 *     answers with the real reason.
 *   - **A refusal must not be silent.** Where the bag holds nothing that
 *     could be an image, the caller needs to say so rather than appear to
 *     ignore the gesture.
 *
 * Pure: names and declared types in, one of them out. No DOM, no I/O.
 */
import { UPLOAD_IMAGE_MEDIA_TYPES } from "./mediaTypes";

/** The part of a `File` this decision needs. */
export type TransferFile = { name?: string; type?: string };

/** Types a file manager or a browser uses to mean "no idea". */
const UNKNOWN_TYPES = ["", "application/octet-stream", "binary/octet-stream"];

const HEIC_EXTENSIONS = [".heic", ".heif"];

/**
 * The image in a paste or a drop, or null when there is nothing that
 * could be one.
 *
 * Preference order, most certain first: a declared type we accept; a
 * name that ends in a HEIC extension (the empty-type case above); any
 * `image/*` at all, so a format we do not accept still reaches the
 * server and gets a named refusal; and finally a single file whose type
 * is one of the "no idea" values, which is what a HEIC off a mounted
 * iPhone looks like.
 */
export function pickImage<T extends TransferFile>(files: readonly T[]): T | null {
  if (files.length === 0) return null;

  const accepted = files.find((file) =>
    (UPLOAD_IMAGE_MEDIA_TYPES as readonly string[]).includes(file.type ?? ""),
  );
  if (accepted) return accepted;

  const heicByName = files.find((file) =>
    HEIC_EXTENSIONS.some((ext) => (file.name ?? "").toLowerCase().endsWith(ext)),
  );
  if (heicByName) return heicByName;

  const anyImage = files.find((file) => (file.type ?? "").startsWith("image/"));
  if (anyImage) return anyImage;

  // Only when it is unambiguous. Two mystery files are a folder drag, not
  // a photo, and guessing between them is worse than saying nothing here.
  if (files.length === 1 && UNKNOWN_TYPES.includes(files[0].type ?? "")) {
    return files[0];
  }

  return null;
}

/**
 * What to tell somebody whose paste or drop carried nothing usable.
 *
 * One sentence, no jargon, and it names the gesture they just made so it
 * is obvious which thing did not work.
 */
export function nothingToUploadMessage(gesture: "paste" | "drop"): string {
  return gesture === "paste"
    ? "There's no photo on your clipboard — copy the image itself, not a link to it."
    : "That didn't look like a photo. Drop a JPEG, PNG, HEIC, GIF or WebP.";
}
