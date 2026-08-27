/**
 * The same sentence, in the verb the reader's device actually uses.
 *
 * The customer surfaces were written for a homeowner standing in their
 * yard holding a phone, and the words still said so on a desktop: "point
 * your camera", "take the photo", "tap an area", next to a mouse pointer
 * and no camera. The primary surface is a desktop browser now, and copy
 * that describes a gesture the reader cannot perform reads as a page
 * built for somebody else.
 *
 * Rendered both ways and switched by a media query rather than by
 * `matchMedia` in an effect, so the server sends the same markup to
 * everybody and neither branch flashes before hydration.
 *
 * Each branch carries exactly one display utility — `hidden`, under a
 * variant — and never a base display utility that could win over it.
 * That is the bug this file must not reintroduce: Tailwind emits its
 * display utilities in a fixed order, so an element with both `hidden`
 * and something resolving to `inline-flex` ships visible whatever the
 * class attribute reads. See the wrappers in StartUpload for where that
 * one was found.
 */
export function ByPointer({
  touch,
  pointer,
}: {
  /** What it says where there is a finger and a camera. */
  touch: React.ReactNode;
  /** What it says where there is a mouse and a keyboard. */
  pointer: React.ReactNode;
}) {
  return (
    <>
      <span className="fine:hidden">{touch}</span>
      <span className="coarse:hidden">{pointer}</span>
    </>
  );
}
