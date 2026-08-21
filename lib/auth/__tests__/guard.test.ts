/**
 * The contractor gate, through the real route handlers.
 *
 * Before this existed, anyone who could guess a project id could write to
 * the training corpus and issue a binding quote. These tests are the
 * regression: they call the same handlers the console calls, once without
 * a session and once with one.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

process.env.PROJECTS_DATA_DIR = mkdtempSync(
  path.join(os.tmpdir(), "landscape-auth-test-"),
);

const store = await import("../../store/projects");
const { demoSegmentation } = await import("../../vision/demo");
const { contractorHeaders } = await import("./helpers");
const { readCookie } = await import("../session");
const { POST: submitPOST } = await import(
  "../../../app/api/projects/[projectId]/submit/route"
);
const { GET: snapshotGET } = await import(
  "../../../app/api/projects/[projectId]/snapshot/route"
);
const { POST: confirmPOST } = await import(
  "../../../app/api/projects/[projectId]/confirm/route"
);
const { POST: quotePOST, GET: quoteGET } = await import(
  "../../../app/api/projects/[projectId]/quote/route"
);

afterAll(() => {
  rmSync(process.env.PROJECTS_DATA_DIR!, { recursive: true, force: true });
});

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

const anonymous = (url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const asContractor = async (url: string, body?: unknown, who = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: await contractorHeaders(who),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function submittedLead() {
  const project = await store.createProject(Buffer.from("x"), "image/jpeg", "jpg");
  await store.setSegmentation(project.id, { status: "ready", ...demoSegmentation() });
  await store.setSelection(project.id, "demo_bed", {
    surfaceOptionId: "surface_stone_river_rock",
    addonOptionIds: [],
  });
  const res = await submitPOST(
    anonymous(`/api/projects/${project.id}/submit`, {
      contact: { name: "Dana", email: "dana@example.com" },
    }),
    params(project.id),
  );
  expect(res.status).toBe(201);
  return project.id;
}

const CORRECTIONS = {
  corrections: [{ photoRegionId: "demo_bed", unit: "SF", value: 470 }],
};

describe("readCookie", () => {
  it("finds a cookie among others, and nothing when it is absent", () => {
    expect(readCookie("a=1; authjs.session-token=abc; b=2", "authjs.session-token")).toBe(
      "abc",
    );
    expect(readCookie("authjs.session-token=abc", "authjs.session-token")).toBe("abc");
    expect(readCookie("a=1; b=2", "authjs.session-token")).toBeNull();
    expect(readCookie(null, "authjs.session-token")).toBeNull();
    // A prefix must not match: session-token is not authjs.session-token.
    expect(readCookie("xauthjs.session-token=abc", "authjs.session-token")).toBeNull();
  });
});

describe("the contractor gate", () => {
  it("refuses an anonymous correction and an anonymous quote", async () => {
    const projectId = await submittedLead();

    const confirm = await confirmPOST(
      anonymous(`/api/projects/${projectId}/confirm`, CORRECTIONS),
      params(projectId),
    );
    expect(confirm.status).toBe(401);

    const quote = await quotePOST(
      anonymous(`/api/projects/${projectId}/quote`),
      params(projectId),
    );
    expect(quote.status).toBe(401);

    // And nothing was written by either attempt.
    const project = await store.getProject(projectId);
    expect(project.deltas ?? []).toHaveLength(0);
    expect(project.status).toBe("submitted");
  });

  it("refuses a forged or foreign session cookie", async () => {
    const projectId = await submittedLead();
    for (const cookie of [
      "authjs.session-token=not-a-token",
      "authjs.session-token=",
      // A well-formed JWT signed with someone else's secret.
      "authjs.session-token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.Xy",
    ]) {
      const res = await confirmPOST(
        new Request(`http://localhost/api/projects/${projectId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify(CORRECTIONS),
        }),
        params(projectId),
      );
      expect(res.status, cookie).toBe(401);
    }
  });

  it("lets a signed-in contractor through, and records THEM as the corrector", async () => {
    const projectId = await submittedLead();

    const confirm = await confirmPOST(
      await asContractor(`/api/projects/${projectId}/confirm`, CORRECTIONS, {
        name: "Jordan Field",
      }),
      params(projectId),
    );
    expect(confirm.status).toBe(201);

    const delta = (await store.getProject(projectId)).deltas![0];
    // Provenance comes from the session. A caller cannot assert it.
    expect(delta.correctedBy).toBe("Jordan Field");
    expect(delta.afterQty.value).toBe(470);

    const quote = await quotePOST(
      await asContractor(`/api/projects/${projectId}/quote`),
      params(projectId),
    );
    expect(quote.status).toBe(201);
  });

  it("keeps the customer's own surfaces anonymous", async () => {
    const projectId = await submittedLead();
    await confirmPOST(
      await asContractor(`/api/projects/${projectId}/confirm`, CORRECTIONS),
      params(projectId),
    );
    await quotePOST(
      await asContractor(`/api/projects/${projectId}/quote`),
      params(projectId),
    );

    // The customer never signs in: reading their own estimate and the
    // quote they were given must not require a session.
    const snapshot = await snapshotGET(
      new Request(`http://localhost/api/projects/${projectId}/snapshot`),
      params(projectId),
    );
    expect(snapshot.status).toBe(200);

    const quote = await quoteGET(
      new Request(`http://localhost/api/projects/${projectId}/quote`),
      params(projectId),
    );
    expect(quote.status).toBe(200);
  });
});
