/**
 * Reading the Anthropic key out of the environment, forgivingly.
 *
 * The key arrives by being typed or pasted into a `.env.local` file by a
 * person, which means it arrives with the things people paste: a trailing
 * space, a newline that came along for the ride, a pair of quotes somebody
 * added because the other lines had them, or the placeholder from the
 * setup instructions still sitting there untouched.
 *
 * None of those are interesting failures, and all of them used to produce
 * the same thing: a 401 from the API, rendered to the customer as raw
 * JSON. Fixing the string is a few lines; fixing the *diagnosis* is the
 * rest of this file — `npm run doctor` and the server log both read their
 * verdict from here, so there is one answer to "is the key usable" rather
 * than three.
 *
 * Pure and dependency-free: it takes an environment and returns a verdict,
 * so it is testable without one.
 */

export type CredentialStatus =
  /** Nothing set. The app uses the labelled demo overlay, which is fine. */
  | "missing"
  /** Set, but to the instructions' placeholder. Almost certainly a mistake. */
  | "placeholder"
  /** Set to something usable. Whether the API accepts it is another question. */
  | "present";

export type Credential = {
  status: CredentialStatus;
  /** Cleaned key — quotes and whitespace removed. Never logged. */
  apiKey?: string;
  /** What to tell an operator, when there is something to tell them. */
  note?: string;
};

export type CredentialEnv = {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
};

/**
 * Values that mean "somebody followed the instructions and stopped".
 * Matched loosely: the point is to catch a half-finished setup, not to
 * police what a key may contain.
 */
const PLACEHOLDER_MARKERS = [
  "paste-your-key",
  "paste your key",
  "your-key-here",
  "your-api-key",
  "changeme",
  "xxxxx",
  "<",
  "…",
];

/**
 * Strip what a person's paste brings with it: surrounding whitespace, a
 * trailing newline, and one layer of matching quotes.
 */
export function cleanKey(raw: string | undefined): string {
  let value = (raw ?? "").trim();
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  if (quoted && value.length >= 2) value = value.slice(1, -1).trim();
  return value;
}

export function readCredential(env: CredentialEnv = process.env as CredentialEnv): Credential {
  const apiKey = cleanKey(env.ANTHROPIC_API_KEY);

  if (!apiKey) {
    // An auth token or a signed-in CLI profile is a valid way to
    // authenticate too — leave those to the SDK to resolve.
    if (cleanKey(env.ANTHROPIC_AUTH_TOKEN)) return { status: "present" };
    return { status: "missing" };
  }

  const lowered = apiKey.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker))) {
    return {
      status: "placeholder",
      note: "ANTHROPIC_API_KEY is still the placeholder from the setup instructions. Put a real key in .env.local and restart the server.",
    };
  }

  return { status: "present", apiKey };
}

/**
 * Does this deployment have something to authenticate with?
 *
 * A placeholder counts as "no": the labelled demo overlay is a better
 * answer to a half-finished setup than a 401 rendered at a customer.
 */
export function hasVisionCredentials(env: CredentialEnv = process.env as CredentialEnv): boolean {
  return readCredential(env).status === "present";
}

/**
 * Does the shape of this key look like an Anthropic key? Advisory only —
 * `npm run doctor` says so out loud, and nothing refuses on it, because a
 * gateway or a future key format is allowed to disagree.
 */
export function looksLikeAnthropicKey(apiKey: string): boolean {
  return apiKey.startsWith("sk-ant-") && apiKey.length > 40;
}
