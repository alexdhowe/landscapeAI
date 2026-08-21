/**
 * Password hashing. The one place a contractor's credential is handled, so
 * the properties that matter are asserted rather than assumed.
 */
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../password";

// Real scrypt at the shipped cost takes ~100ms a call; these params keep
// the suite fast while exercising the same encode/verify path.
const FAST = { N: 1 << 12, r: 8, p: 1, keylen: 64 } as const;

describe("hashPassword / verifyPassword", () => {
  it("verifies the password it hashed", async () => {
    const stored = await hashPassword("correct horse battery staple", FAST);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple", FAST);
    expect(await verifyPassword("Correct horse battery staple", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
  });

  it("salts: the same password hashes differently every time", async () => {
    const a = await hashPassword("same password", FAST);
    const b = await hashPassword("same password", FAST);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("carries its parameters, so a hash written at one cost verifies at another", async () => {
    const cheap = await hashPassword("portable", FAST);
    expect(cheap.startsWith("scrypt$4096$8$1$64$")).toBe(true);
    // Written cheap, verified after the default cost was raised — no
    // migration, because the cost is in the string.
    expect(await verifyPassword("portable", cheap)).toBe(true);
  });

  it("normalizes unicode, so the same typed password matches either encoding", async () => {
    // "café" with a combining accent vs. a precomposed é.
    const combining = "café password";
    const precomposed = "café password";
    const stored = await hashPassword(combining, FAST);
    expect(await verifyPassword(precomposed, stored)).toBe(true);
  });

  it("returns false rather than throwing on a corrupt or hostile hash", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "scrypt$",
      "bcrypt$4096$8$1$64$AAAA$AAAA",
      "scrypt$notanumber$8$1$64$AAAA$AAAA",
      "scrypt$4096$8$1$64$AAAA$", // empty digest
      "scrypt$4096$8$1$999$AAAA$AAAA", // keylen disagrees with digest
      // A row asking for ~1 TB of scrypt memory must be refused, not attempted.
      "scrypt$1073741824$8$1$64$AAAA$AAAA",
    ]) {
      expect(await verifyPassword("anything", bad), bad).toBe(false);
    }
  });
});
