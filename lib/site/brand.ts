/**
 * What the product is called, in one place.
 *
 * The name was in three: the wordmark that sits on every customer surface
 * and the contractor console, the metadata that titles every page and
 * every share card, and the OG image drawn for links. Renaming from
 * LandscapeAI to MyScape meant finding all three, and a fourth would have
 * been missed — a page title saying one thing while the header says
 * another is the kind of drift nobody notices until a customer does.
 *
 * So the name lives here and those surfaces import it. There is a test
 * asserting no surface spells it out for itself.
 */
export const BRAND_NAME = "MyScape";

/** The frame around every page title: "Something · MyScape". */
export const TITLE_TEMPLATE = `%s · ${BRAND_NAME}`;

/** What the product does, in the words a homeowner would use. */
export const TAGLINE =
  "Photograph your yard, swap what's in it, and see what projects like yours cost — before anyone visits.";

/** The headline on a share card and the default page title. */
export const HEADLINE = `${BRAND_NAME} — see what your yard could be`;
