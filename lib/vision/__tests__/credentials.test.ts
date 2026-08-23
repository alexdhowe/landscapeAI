/**
 * Reading the key out of the environment.
 *
 * Every case here is one somebody actually hit: a placeholder left in the
 * file, a key wrapped in quotes because the neighbouring lines had them,
 * a newline that came along with the paste. All three produced the same
 * 401 and none of them is an interesting failure.
 */
import { describe, expect, it } from "vitest";

import {
  cleanKey,
  hasVisionCredentials,
  looksLikeAnthropicKey,
  readCredential,
} from "../credentials";

const KEY = `sk-ant-api03-${"a".repeat(64)}`;

describe("cleaning a pasted key", () => {
  it("survives the things a paste brings with it", () => {
    expect(cleanKey(`  ${KEY}  `)).toBe(KEY);
    expect(cleanKey(`${KEY}\n`)).toBe(KEY);
    expect(cleanKey(`"${KEY}"`)).toBe(KEY);
    expect(cleanKey(`'${KEY}'`)).toBe(KEY);
    expect(cleanKey(` "${KEY}" \n`)).toBe(KEY);
  });

  it("leaves an unmatched quote alone rather than guessing", () => {
    expect(cleanKey(`"${KEY}`)).toBe(`"${KEY}`);
  });

  it("treats nothing as nothing", () => {
    expect(cleanKey(undefined)).toBe("");
    expect(cleanKey("   ")).toBe("");
  });
});

describe("the credential verdict", () => {
  it("recognises a usable key", () => {
    const credential = readCredential({ ANTHROPIC_API_KEY: ` "${KEY}" ` });
    expect(credential.status).toBe("present");
    expect(credential.apiKey).toBe(KEY);
    expect(hasVisionCredentials({ ANTHROPIC_API_KEY: KEY })).toBe(true);
  });

  it("calls a half-finished setup what it is", () => {
    for (const placeholder of [
      "paste-your-key-here",
      "your-api-key",
      "<your key>",
      "changeme",
    ]) {
      const credential = readCredential({ ANTHROPIC_API_KEY: placeholder });
      expect(credential.status, placeholder).toBe("placeholder");
      expect(credential.note).toMatch(/placeholder/i);
      // The labelled demo overlay is a better answer to this than a 401
      // rendered at a customer, so it counts as "no credentials".
      expect(hasVisionCredentials({ ANTHROPIC_API_KEY: placeholder })).toBe(false);
    }
  });

  it("reports nothing set as missing, quietly", () => {
    const credential = readCredential({});
    expect(credential.status).toBe("missing");
    expect(credential.note).toBeUndefined();
  });

  it("leaves other ways of authenticating to the SDK", () => {
    // An auth token or a signed-in CLI profile is valid too; this module
    // only cleans up the key it knows how to clean up.
    const credential = readCredential({ ANTHROPIC_AUTH_TOKEN: "some-token" });
    expect(credential.status).toBe("present");
    expect(credential.apiKey).toBeUndefined();
  });
});

describe("the shape check", () => {
  it("is advisory, and nothing refuses on it", () => {
    expect(looksLikeAnthropicKey(KEY)).toBe(true);
    expect(looksLikeAnthropicKey("sk-ant-short")).toBe(false);
    expect(looksLikeAnthropicKey("some-gateway-token")).toBe(false);
    // …but a gateway token still counts as present, because this repo does
    // not get to decide what a valid credential looks like.
    expect(hasVisionCredentials({ ANTHROPIC_API_KEY: "some-gateway-token" })).toBe(true);
  });
});
