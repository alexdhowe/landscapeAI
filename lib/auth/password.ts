/**
 * Password hashing — scrypt from node:crypto, no dependency.
 *
 * The stored string carries its own parameters:
 *
 *   scrypt$N$r$p$keylen$saltB64$hashB64
 *
 * so the cost can be raised later without a migration: new passwords get
 * the new cost, old hashes keep verifying at the cost they were written
 * with. Verification is constant-time.
 *
 * Server-only. Pure apart from crypto and the clock it doesn't read.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scryptAsync = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });

/**
 * OWASP's floor for scrypt at the time of writing (N=2^17, r=8, p=1).
 * Raise N here and old hashes still verify — that is the point of encoding
 * the parameters in the string.
 */
const DEFAULT_PARAMS = { N: 1 << 17, r: 8, p: 1, keylen: 64 } as const;

/** scrypt's memory ceiling must be raised to match N; the default is 32 MB. */
const maxmem = (N: number, r: number) => Math.max(32 * 1024 * 1024, 256 * N * r * 2);

export async function hashPassword(
  password: string,
  params = DEFAULT_PARAMS,
): Promise<string> {
  const { N, r, p, keylen } = params;
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, keylen, {
    N,
    r,
    p,
    maxmem: maxmem(N, r),
  });
  return [
    "scrypt",
    N,
    r,
    p,
    keylen,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * True when `password` produced `stored`. Returns false — never throws —
 * on a malformed or unknown hash, so a corrupt row cannot become a 500 on
 * the login path.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, keylenRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  const keylen = Number(keylenRaw);
  if (![N, r, p, keylen].every((n) => Number.isInteger(n) && n > 0)) return false;
  // A hostile row must not be able to ask for gigabytes of scrypt memory.
  if (N > 1 << 20 || r > 16 || p > 16 || keylen > 128) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashB64, "base64");
    if (expected.length !== keylen) return false;
    const derived = await scryptAsync(
      password.normalize("NFKC"),
      Buffer.from(saltB64, "base64"),
      keylen,
      { N, r, p, maxmem: maxmem(N, r) },
    );
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
