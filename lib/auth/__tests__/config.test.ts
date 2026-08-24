/**
 * The one line of auth configuration that decides whether anybody can log
 * in at all.
 *
 * Auth.js will not build a callback URL from a Host header it does not
 * trust unless it recognises the hosting platform, and the only platform
 * it recognises by itself is Vercel. Every way this app actually ships —
 * the Dockerfile, `render.yaml`, `fly.toml`, `npm start` on a laptop — is
 * self-hosted, so without `trustHost` every request to /api/auth/* throws
 * `UntrustedHost`, the login page fails to render, and the console is
 * unreachable.
 *
 * That shipped, through eleven sessions and a whole deployment runbook,
 * because the only command that ever signed in (`npm run shots`, as the
 * README wrote it) passed AUTH_TRUST_HOST=1 on the command line. No
 * `.env.example` entry, no `render.yaml` var, no `fly secrets` line — the
 * documented path for every real deployment was a broken login.
 *
 * So it is asserted here, and `npm run shots` now signs in without the
 * variable set and reports a finding if it does not reach the dashboard.
 */
import { describe, expect, it } from "vitest";

import { authConfig } from "../options";

describe("authConfig", () => {
  it("trusts the host, because every deployment target is self-hosted", () => {
    expect(authConfig().trustHost).toBe(true);
  });

  it("does not depend on AUTH_TRUST_HOST being set in the environment", () => {
    const before = process.env.AUTH_TRUST_HOST;
    delete process.env.AUTH_TRUST_HOST;
    try {
      expect(authConfig().trustHost).toBe(true);
    } finally {
      if (before !== undefined) process.env.AUTH_TRUST_HOST = before;
    }
  });

  it("keeps the console on JWT sessions and its own sign-in page", () => {
    const config = authConfig();
    expect(config.session?.strategy).toBe("jwt");
    expect(config.pages?.signIn).toBe("/login");
    expect(config.providers).toHaveLength(1);
  });
});
