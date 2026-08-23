/**
 * Where the deployment's own address comes from, and in what order.
 *
 * The bug this exists around is silent: the value is baked at build time
 * (see the module's own note), so a deployment that sets it afterwards
 * looks configured and publishes `http://localhost:3000` inside every Open
 * Graph URL. These test the resolution; the build-time part is a fact
 * about Next that no unit test can hold in place, which is why it is
 * written down in the module and in docs/deploy.md.
 */
import { describe, expect, it } from "vitest";

import { LOCAL_SITE_URL, siteUrl, siteUrlIsPlaceholder } from "../url";

describe("the site URL", () => {
  it("prefers the explicit variable over the older one", () => {
    expect(
      siteUrl({
        SITE_URL: "https://landscape.example.com",
        NEXT_PUBLIC_SITE_URL: "https://baked-in-at-build.example.com",
      }),
    ).toBe("https://landscape.example.com");
  });

  it("still honours the original variable", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://landscape.example.com" })).toBe(
      "https://landscape.example.com",
    );
  });

  it("uses what the host already knows, so a normal deployment configures nothing", () => {
    expect(siteUrl({ RENDER_EXTERNAL_URL: "https://landscapeai.onrender.com" })).toBe(
      "https://landscapeai.onrender.com",
    );
  });

  it("takes a bare hostname and assumes https", () => {
    expect(siteUrl({ SITE_URL: "landscape.example.com" })).toBe("https://landscape.example.com");
  });

  it("keeps only the origin, whatever else was pasted in", () => {
    expect(siteUrl({ SITE_URL: "https://landscape.example.com/start?utm=x" })).toBe(
      "https://landscape.example.com",
    );
    expect(siteUrl({ SITE_URL: "  https://landscape.example.com/  " })).toBe(
      "https://landscape.example.com",
    );
  });

  it("falls back rather than throwing, because this runs inside root metadata", () => {
    // A typo in one environment variable must not be why no page renders.
    expect(siteUrl({ SITE_URL: "http://[not a url" })).toBe(LOCAL_SITE_URL);
    expect(siteUrl({})).toBe(LOCAL_SITE_URL);
    expect(siteUrlIsPlaceholder({})).toBe(true);
    expect(siteUrlIsPlaceholder({ SITE_URL: "https://landscape.example.com" })).toBe(false);
  });
});
