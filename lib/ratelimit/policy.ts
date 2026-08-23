/**
 * Which budget applies to which request.
 *
 * The customer side of this app is anonymous by design — project-map §2's
 * whole thesis is no address and no form — and that is not the thing being
 * fixed here. Anonymous plus *unmetered* is: `POST /api/projects` accepts
 * 25 MB and then spends about a second and a half of CPU-bound, pure-JS
 * image decode on it, and `POST /api/vision` spends a metered Anthropic
 * call. Both are somebody else's bill and neither needs any skill to run in
 * a loop. Nothing here asks a customer to identify themselves; it only
 * bounds what one address can spend.
 *
 * The two numbers per policy are burst (`capacity`) and sustained
 * (`refillPerMinute`). They are set from what one real customer does, with
 * room: a customer uploads one photo — occasionally three, when the first
 * two were of the wrong corner of the yard — segments it once or twice, and
 * then swaps materials for a couple of minutes, which is where the price
 * calls come from.
 *
 * Pure — a (method, pathname) pair in, a budget out. No env, no clock, no
 * request object, so the table can be read and tested as a table.
 */
import type { Budget } from "./bucket";

export type Policy = {
  /** Bucket namespace, so a customer's price calls cannot starve their upload. */
  name: string;
  budget: Budget;
};

/**
 * 25 MB in, ~1.5 s of CPU out. The tightest budget in the table, and the
 * one that matters most: three uploads a minute sustained is more than any
 * customer does and far less than a loop.
 */
const UPLOAD: Policy = { name: "upload", budget: { capacity: 6, refillPerMinute: 3 } };

/** One Anthropic vision call each. Metered money rather than metered CPU. */
const VISION: Policy = { name: "vision", budget: { capacity: 8, refillPerMinute: 4 } };

/** A third party's quota, and their usage policy, not ours to spend. */
const GEOCODE: Policy = { name: "geocode", budget: { capacity: 12, refillPerMinute: 12 } };

/**
 * The pricing engine per call. Pure CPU, but small, and it fires on every
 * material swap — this budget has to be comfortable or the product feels
 * broken while somebody is playing.
 */
const PRICE: Policy = { name: "price", budget: { capacity: 40, refillPerMinute: 30 } };

/** Writes a lead. A human sends one design, once. */
const SUBMIT: Policy = { name: "submit", budget: { capacity: 5, refillPerMinute: 2 } };

/** One POST per polygon the customer draws or redraws on the aerial. */
const DRAW: Policy = { name: "draw", budget: { capacity: 40, refillPerMinute: 30 } };

/**
 * Sign-in. Passwords are scrypt, so each attempt is deliberately expensive
 * to check as well as expensive to guess; this bounds both the guessing and
 * the CPU it would cost us to refuse.
 */
const AUTH: Policy = { name: "auth", budget: { capacity: 10, refillPerMinute: 5 } };

/** Reading back a project, its photo, snapshot or quote. Cheap, polled by the UI. */
const READ: Policy = { name: "read", budget: { capacity: 120, refillPerMinute: 120 } };

/** Anything else that writes — the contractor console's routes, all behind auth. */
const WRITE: Policy = { name: "write", budget: { capacity: 60, refillPerMinute: 60 } };

/**
 * The budget for a request, or null when the route is not metered.
 *
 * `pathname` is a URL path; ids are matched positionally rather than
 * parsed, because this table must not need updating when the id format
 * changes.
 */
export function policyFor(method: string, pathname: string): Policy | null {
  const verb = method.toUpperCase();
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api") return null;

  // The platform's health check. Metering it would let a flood from one
  // proxy address make the deployment look unhealthy and get it restarted,
  // which is the opposite of shedding load.
  if (segments[1] === "health") return null;

  if (segments[1] === "auth") return verb === "GET" ? READ : AUTH;

  if (segments[1] === "vision") return VISION;
  if (segments[1] === "geocode") return GEOCODE;
  if (segments[1] === "price") return PRICE;

  if (segments[1] === "projects") {
    // POST /api/projects — the upload itself.
    if (segments.length === 2) return verb === "POST" ? UPLOAD : WRITE;
    const leaf = segments[3];
    if (leaf === "submit") return SUBMIT;
    if (leaf === "aerial") return DRAW;
    return verb === "GET" ? READ : WRITE;
  }

  return verb === "GET" ? READ : WRITE;
}
