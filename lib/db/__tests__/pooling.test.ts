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

import { isPooledConnection } from "../client";

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
