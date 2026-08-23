/**
 * The absolute base this deployment is reached at.
 *
 * Used for Open Graph and icon URLs (`app/layout.tsx`) and for the host
 * line in `app/robots.ts`.
 *
 * **This is a build-time value, and that is not a choice this file gets to
 * make.** Both callers are static: Next evaluates the root layout's
 * `metadata` export and prerenders `/robots.txt` during `next build` and
 * bakes the result into the output, so a deployment that sets the variable
 * on its hosting dashboard and restarts is still serving
 * `http://localhost:3000` inside every OG image URL it publishes. That was
 * checked both ways against a production build — set at build, correct;
 * set only at runtime, ignored — because the failure is silent and the
 * page looks fine.
 *
 * The prefix is a red herring: `NEXT_PUBLIC_SITE_URL` is *also* inlined,
 * for a second reason. What matters is that whichever variable is used has
 * to be present when the image is built. Render converts a service's
 * environment variables into Docker build arguments automatically, and the
 * Dockerfile declares them, so setting one in the dashboard and
 * redeploying is enough there; `fly deploy --build-arg` is the same idea
 * spelled out.
 *
 * What this file adds is that there are three places the value can come
 * from — an explicit `SITE_URL`, the original `NEXT_PUBLIC_SITE_URL`, and
 * whatever the host already knows about itself — so the common case is
 * nothing to configure at all, and a typo degrades instead of throwing.
 *
 * Pure. Takes its environment as an argument so it can be tested without
 * one.
 */
export type SiteUrlEnv = {
  /** Set this one. No NEXT_PUBLIC_ prefix, because nothing here is a secret
   *  and nothing here needs to reach a browser bundle — the server renders
   *  every URL it is used in. Must be present at build time. */
  SITE_URL?: string;
  /** The original. Still honoured, same build-time rule. */
  NEXT_PUBLIC_SITE_URL?: string;
  /** Render sets this itself, so a Render deployment can set neither. */
  RENDER_EXTERNAL_URL?: string;
};

export const LOCAL_SITE_URL = "http://localhost:3000";

/**
 * The base URL, or localhost when nothing says otherwise.
 *
 * A malformed value falls back rather than throwing: this is called from
 * the root layout's metadata, and a typo in an environment variable must
 * not be the reason the whole application refuses to render a page.
 */
export function siteUrl(env: SiteUrlEnv = process.env as SiteUrlEnv): string {
  for (const candidate of [env.SITE_URL, env.NEXT_PUBLIC_SITE_URL, env.RENDER_EXTERNAL_URL]) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      return new URL(normalized).origin;
    } catch {
      // Try the next one. A bad value is worth nothing, not an outage.
    }
  }
  return LOCAL_SITE_URL;
}

/** True when nothing has told this deployment its own address. */
export function siteUrlIsPlaceholder(env: SiteUrlEnv = process.env as SiteUrlEnv): boolean {
  return siteUrl(env) === LOCAL_SITE_URL;
}
