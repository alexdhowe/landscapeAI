/**
 * The price book as an editable resource: read the draft, apply one pure
 * edit, publish.
 *
 * Every mutation is read → apply a lib/pricebook/mutate.ts function →
 * write back, inside one transaction at the database layer. The edits
 * themselves are pure and tested without a database; this module is the
 * plumbing and the two rules that need a database to enforce:
 *
 *   - A draft may be imperfect. Warnings and even most errors are allowed
 *     to sit in one, because a draft is where a contractor thinks.
 *   - Publishing may not. It is the moment the book starts pricing real
 *     estimates, so validatePricingConfig must come back clean.
 *
 * Server-only.
 */
import { getDb, isDatabaseConfigured } from "../db/client";
import * as q from "../db/queries";
import { DEFAULT_ORG_SLUG, resetOrgCache, resolveOrg } from "../org/resolve";

import { diffPricingConfig, type EntityChange } from "./diff";
import type { PricingConfig, RevisionMeta } from "./types";
import { canPublish, validatePricingConfig, type ValidationIssue } from "./validate";

/** Raised when the price book cannot be edited at all. */
export class PriceBookUnavailableError extends Error {
  constructor() {
    super(
      "The price book is read-only without a database — it is being served from seed/pricebook.seed.ts. Set DATABASE_URL and run `npm run db:setup` to edit it.",
    );
    this.name = "PriceBookUnavailableError";
  }
}

/** Raised when a publish is refused because the book would be broken. */
export class NotPublishableError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super("This draft cannot be published yet");
    this.name = "NotPublishableError";
    this.issues = issues;
  }
}

function assertAvailable(): void {
  if (!isDatabaseConfigured()) throw new PriceBookUnavailableError();
}

export type DraftView = {
  draft: RevisionMeta | null;
  published: RevisionMeta | null;
  config: PricingConfig;
  issues: ValidationIssue[];
  /** What publishing this draft would change. Empty when there is no draft. */
  changes: EntityChange[];
  /** Whether the draft is currently publishable. */
  publishable: boolean;
};

async function orgId(slug: string): Promise<string> {
  return (await resolveOrg(slug)).id;
}

/**
 * The editing surface: the draft if there is one, otherwise the published
 * book shown read-only, plus what is wrong with it and what would change.
 */
export async function readDraftView(slug = DEFAULT_ORG_SLUG): Promise<DraftView> {
  assertAvailable();
  const db = await getDb();
  const org = await resolveOrg(slug);
  const draft = await q.findDraft(db, org.id);

  const publishedConfig = await q.readRevisionConfig(db, org.revisionId);
  const published: RevisionMeta | null = (await q.findRevision(db, org.revisionId)) ?? null;

  if (!draft) {
    return {
      draft: null,
      published,
      config: publishedConfig,
      issues: validatePricingConfig(publishedConfig),
      changes: [],
      publishable: false,
    };
  }

  const config = await q.readRevisionConfig(db, draft.id);
  const issues = validatePricingConfig(config);
  return {
    draft,
    published,
    config,
    issues,
    changes: diffPricingConfig(publishedConfig, config),
    publishable: canPublish(issues),
  };
}

/** Open a draft, copying the current published book. Idempotent. */
export async function startDraft(by: string, slug = DEFAULT_ORG_SLUG): Promise<RevisionMeta> {
  assertAvailable();
  return q.createDraft(await getDb(), await orgId(slug), by);
}

export async function discardDraft(slug = DEFAULT_ORG_SLUG): Promise<boolean> {
  assertAvailable();
  return q.discardDraft(await getDb(), await orgId(slug));
}

/**
 * Apply one edit to the draft, opening a draft first if there isn't one.
 *
 * The mutation is a pure function; if it throws (PriceBookEditError) the
 * database is never touched.
 */
export async function editDraft(
  by: string,
  mutate: (config: PricingConfig) => PricingConfig,
  slug = DEFAULT_ORG_SLUG,
): Promise<DraftView> {
  assertAvailable();
  const db = await getDb();
  const id = await orgId(slug);
  const draft = (await q.findDraft(db, id)) ?? (await q.createDraft(db, id, by));
  const next = mutate(await q.readRevisionConfig(db, draft.id));
  await q.writeRevisionConfig(db, draft.id, next);
  return readDraftView(slug);
}

/**
 * Publish the draft, after checking it.
 *
 * This is the gate. Past it, the revision is frozen and every new estimate
 * prices from it, so the catalog guardrail and the margin sanity checks
 * have to hold — see lib/pricebook/validate.ts.
 */
export async function publishDraft(
  by: string,
  options: { label?: string; note?: string } = {},
  slug = DEFAULT_ORG_SLUG,
): Promise<RevisionMeta> {
  assertAvailable();
  const db = await getDb();
  const id = await orgId(slug);
  const draft = await q.findDraft(db, id);
  if (!draft) throw new Error("There is no draft to publish");

  const issues = validatePricingConfig(await q.readRevisionConfig(db, draft.id));
  if (!canPublish(issues)) throw new NotPublishableError(issues);

  const published = await q.publishDraft(db, id, by, options.label, options.note);
  // Every surface must price from the new book on the next request.
  resetOrgCache();
  return published;
}

export type RevisionHistoryEntry = RevisionMeta & {
  /** What this revision changed relative to the one before it. */
  changes: EntityChange[];
};

/**
 * The history: every revision, newest first, each with the diff against
 * its predecessor. Revisions are immutable, so this diff IS what happened —
 * there is no audit log that can drift from the rows.
 */
export async function readHistory(
  slug = DEFAULT_ORG_SLUG,
): Promise<RevisionHistoryEntry[]> {
  assertAvailable();
  const db = await getDb();
  const revisions = await q.listRevisions(db, await orgId(slug));
  const configs = new Map<string, PricingConfig>();
  for (const revision of revisions) {
    configs.set(revision.id, await q.readRevisionConfig(db, revision.id));
  }
  // `revisions` is newest first, so the predecessor is the NEXT entry.
  return revisions.map((revision, i) => {
    const previous = revisions[i + 1];
    return {
      ...revision,
      changes: previous
        ? diffPricingConfig(configs.get(previous.id)!, configs.get(revision.id)!)
        : [],
    };
  });
}
