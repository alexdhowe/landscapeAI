/**
 * Recognising a connection pooler from its URL.
 *
 * postgres.js uses named prepared statements by default and PgBouncer in
 * transaction mode cannot keep them, so the second query fails with
 * "prepared statement does not exist" — which reads like a database fault
 * and is a connection-string choice. The free-tier Postgres this repo
 * documents is exactly where somebody meets it.
 */
import { describe, expect, it } from "vitest";

import { isPooledConnection, normalizeConnectionUrl } from "../client";

describe("pooled connection strings", () => {
  it("spots the poolers the documented providers hand out", () => {
    // Neon: the pooled host is the project name plus -pooler.
    expect(
      isPooledConnection("postgres://u:p@ep-cool-name-pooler.us-east-2.aws.neon.tech/db"),
    ).toBe(true);
    // Supabase: the transaction pooler answers on 6543.
    expect(isPooledConnection("postgres://u:p@db.example.supabase.co:6543/postgres")).toBe(true);
    // The convention several providers pass along.
    expect(isPooledConnection("postgres://u:p@host.example.com/db?pgbouncer=true")).toBe(true);
  });

  it("leaves a direct connection alone", () => {
    // The endpoint docs/deploy.md tells you to use: one small instance
    // opening a handful of connections has nothing to pool.
    expect(
      isPooledConnection("postgres://u:p@ep-cool-name.us-east-2.aws.neon.tech/db?sslmode=require"),
    ).toBe(false);
    expect(isPooledConnection("postgres://postgres@127.0.0.1:5432/landscapeai")).toBe(false);
    expect(isPooledConnection("postgres://u:p@db.example.supabase.co:5432/postgres")).toBe(false);
  });

  it("does not throw on something that is not a URL", () => {
    // A malformed connection string has a better error waiting for it than
    // one thrown from a heuristic.
    expect(isPooledConnection("not a url")).toBe(false);
    expect(isPooledConnection("")).toBe(false);
  });
});

describe("normalizeConnectionUrl", () => {
  // The string Neon's console hands out, shape-for-shape.
  const neon =
    "postgresql://user:pw@ep-example-123-pooler.us-east-2.aws.neon.tech/neondb" +
    "?sslmode=require&channel_binding=require";

  it("strips the parameter that makes a Neon paste fail", () => {
    // postgres.js forwards anything it does not recognise into the startup
    // packet, and the server answers `unrecognized configuration parameter
    // "channel_binding"`. drizzle-kit does not report that — it spins on
    // "applying migrations..." indefinitely.
    const out = normalizeConnectionUrl(neon);
    expect(out).not.toContain("channel_binding");
    expect(out).toContain("sslmode=require");
  });

  it("leaves the host, credentials and database exactly as they were", () => {
    const out = new URL(normalizeConnectionUrl(neon));
    expect(out.username).toBe("user");
    expect(out.password).toBe("pw");
    expect(out.hostname).toBe("ep-example-123-pooler.us-east-2.aws.neon.tech");
    expect(out.pathname).toBe("/neondb");
  });

  it("still reads as pooled afterwards", () => {
    // The two functions have to agree, or stripping a parameter would
    // silently turn prepared statements back on against a pooler.
    expect(isPooledConnection(normalizeConnectionUrl(neon))).toBe(true);
  });

  it("returns the string untouched when there is nothing to remove", () => {
    const plain = "postgres://user:pw@db.example.com:5432/app?sslmode=require";
    expect(normalizeConnectionUrl(plain)).toBe(plain);
  });

  it("leaves real server settings alone", () => {
    // `application_name` and `options` are Postgres settings, not libpq
    // client parameters, and an operator who set them meant them.
    const url =
      "postgres://user:pw@db.example.com/app?application_name=myscape&options=-c%20statement_timeout%3D5000";
    const out = normalizeConnectionUrl(url);
    expect(out).toContain("application_name=myscape");
    expect(out).toContain("options=");
  });

  it("removes the other libpq client-side parameters too", () => {
    for (const param of ["sslcert", "gssencmode", "passfile", "krbsrvname"]) {
      const out = normalizeConnectionUrl(
        `postgres://user:pw@db.example.com/app?${param}=whatever`,
      );
      expect(out).not.toContain(param);
    }
  });

  it("does not leave a dangling question mark", () => {
    // Harmless to a driver, but it reads like a truncated string in a log.
    const out = normalizeConnectionUrl(
      "postgres://user:pw@db.example.com/app?channel_binding=require",
    );
    expect(out).toBe("postgres://user:pw@db.example.com/app");
  });

  it("hands a string that is not a URL straight back", () => {
    // Malformed input is the driver's to complain about, with its own
    // message, rather than this function's to swallow.
    expect(normalizeConnectionUrl("not a url at all")).toBe("not a url at all");
  });
});
