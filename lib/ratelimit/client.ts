/**
 * Who is this request from, for the purpose of a budget.
 *
 * There is no login on the customer side and there must not be one, so the
 * only handle on a caller is their address. That makes *which header the
 * address is read from* a security decision rather than a detail: a header
 * the client can set is a header that hands every request its own fresh
 * budget.
 *
 * The order below is deliberate. A single-valued header written by the
 * proxy that actually terminated the connection (`fly-client-ip`,
 * `cf-connecting-ip`, `x-real-ip`) cannot be spoofed through that proxy —
 * whatever the client sends is overwritten. `x-forwarded-for` is a list
 * that anything upstream may have appended to, so it is the fallback and
 * not the default, and the *leftmost* entry is used: behind a CDN in front
 * of a host, the rightmost entry is the CDN's own address, and bucketing on
 * that would put every customer in the world in one bucket — a limiter that
 * refuses everybody at once is worse than none.
 *
 * Set `RATE_LIMIT_CLIENT_IP_HEADER` to the one header your platform writes
 * and this stops guessing. See docs/deploy.md.
 *
 * Pure apart from reading that one variable; edge-runtime safe.
 */

/** Headers a proxy writes itself, most specific first. */
const TRUSTED_SINGLE_VALUE_HEADERS = [
  "fly-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-real-ip",
];

export type HeaderSource = { get(name: string): string | null };

/**
 * A stable key for the caller, or "unknown" when nothing identifies them.
 *
 * Everything unidentifiable shares one bucket. That is the right failure:
 * it is the smallest budget in the deployment, so a misconfigured proxy
 * degrades the service loudly instead of quietly disabling the limiter.
 */
export function clientKey(headers: HeaderSource, configuredHeader?: string): string {
  const configured = configuredHeader?.trim().toLowerCase();
  if (configured) {
    const value = firstAddress(headers.get(configured));
    return value ? normalize(value) : "unknown";
  }

  for (const name of TRUSTED_SINGLE_VALUE_HEADERS) {
    const value = firstAddress(headers.get(name));
    if (value) return normalize(value);
  }

  const forwarded = firstAddress(headers.get("x-forwarded-for"));
  return forwarded ? normalize(forwarded) : "unknown";
}

function firstAddress(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * Canonical form of an address, and a /64 for IPv6.
 *
 * A residential IPv6 customer is handed a /64 or larger, so the individual
 * address in a request is not a stable identity — and an attacker with one
 * /64 has 18 quintillion of them to rotate through. The prefix is the
 * subscriber; the address is not.
 */
function normalize(raw: string): string {
  let address = raw.trim().toLowerCase();

  // [2001:db8::1]:443 → 2001:db8::1
  if (address.startsWith("[")) {
    const close = address.indexOf("]");
    if (close > 0) address = address.slice(1, close);
  }

  // ::ffff:203.0.113.4 → 203.0.113.4, before anything counts colons.
  if (address.startsWith("::ffff:") && address.includes(".")) {
    address = address.slice("::ffff:".length);
  }

  // 203.0.113.4:51234 → 203.0.113.4. One colon means a port; more than one
  // means IPv6, where the colons are the address.
  if (address.includes(".") && address.split(":").length === 2) {
    address = address.split(":")[0];
  }

  if (!address.includes(":")) return address;
  return ipv6Prefix(address);
}

function ipv6Prefix(address: string): string {
  const [head, tail = ""] = address.split("::", 2);
  const headGroups = head.split(":").filter(Boolean);
  if (!address.includes("::")) return `${headGroups.slice(0, 4).join(":")}::/64`;

  const tailGroups = tail.split(":").filter(Boolean);
  const missing = Math.max(0, 8 - headGroups.length - tailGroups.length);
  const full = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  return `${full.slice(0, 4).join(":")}::/64`;
}
