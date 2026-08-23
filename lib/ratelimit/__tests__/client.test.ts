/**
 * Which header the caller's address is read from — a security decision,
 * not a detail: a header the client can set is a budget the client can
 * reset.
 */
import { describe, expect, it } from "vitest";

import { clientKey } from "../client";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("the client key", () => {
  it("prefers the header the proxy writes over the one the client can append to", () => {
    // A client that sets x-forwarded-for itself gets nowhere: the proxy's
    // own single-valued header wins.
    const key = clientKey(
      headers({
        "fly-client-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1, 203.0.113.7",
      }),
    );
    expect(key).toBe("203.0.113.7");
  });

  it("uses the header the operator configured, and nothing else", () => {
    const key = clientKey(
      headers({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "198.51.100.4" }),
      "CF-Connecting-IP",
    );
    expect(key).toBe("203.0.113.9");
  });

  it("falls back to the leftmost forwarded-for entry", () => {
    // The rightmost is the CDN's own address; bucketing on it would put
    // every customer in the world in one bucket.
    expect(clientKey(headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.7" }))).toBe(
      "198.51.100.1",
    );
  });

  it("buckets IPv6 by /64, because that is the subscriber", () => {
    const a = clientKey(headers({ "fly-client-ip": "2001:db8:1234:5678:1:2:3:4" }));
    const b = clientKey(headers({ "fly-client-ip": "2001:db8:1234:5678:aaaa:bbbb:cccc:dddd" }));
    expect(a).toBe(b);

    const elsewhere = clientKey(headers({ "fly-client-ip": "2001:db8:1234:9999::1" }));
    expect(elsewhere).not.toBe(a);
  });

  it("expands a compressed IPv6 address before taking its prefix", () => {
    expect(clientKey(headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8:0:0::/64");
    expect(clientKey(headers({ "x-real-ip": "[2001:db8::1]:443" }))).toBe("2001:db8:0:0::/64");
  });

  it("strips ports and IPv4-mapped prefixes", () => {
    expect(clientKey(headers({ "x-real-ip": "203.0.113.4:51234" }))).toBe("203.0.113.4");
    expect(clientKey(headers({ "x-real-ip": "::ffff:203.0.113.4" }))).toBe("203.0.113.4");
    expect(clientKey(headers({ "x-real-ip": " 203.0.113.4 " }))).toBe("203.0.113.4");
  });

  it("puts everything unidentifiable in one bucket", () => {
    // The loud failure is the right one: a misconfigured proxy degrades the
    // service instead of quietly disabling the limiter.
    expect(clientKey(headers({}))).toBe("unknown");
    expect(clientKey(headers({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(clientKey(headers({ "fly-client-ip": "" }), "fly-client-ip")).toBe("unknown");
  });
});
