import type { Metadata } from "next";
import Link from "next/link";

import { PriceBookEditor } from "@/components/pricebook/PriceBookEditor";
import { Callout, Card, SectionHeader } from "@/components/ui/Card";
import { currentContractor } from "@/lib/auth/session";
import {
  PriceBookUnavailableError,
  readDraftView,
  readHistory,
  type DraftView,
  type RevisionHistoryEntry,
} from "@/lib/pricebook/service";
import { describeChange } from "@/lib/pricebook/diff";

/** The book changes under the page whenever anyone publishes. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Price book" };

function Unavailable({ message }: { message: string }) {
  return (
    <Callout tone="flag" title="The price book is read-only here.">
      <p className="mt-1">{message}</p>
    </Callout>
  );
}

/** Every published revision, and what it changed. */
function History({ history }: { history: RevisionHistoryEntry[] }) {
  const published = history.filter((r) => r.status === "published");
  return (
    <Card as="section" className="p-5">
      <SectionHeader
        title="History"
        subtitle="Every revision is frozen once published, so this diff is what actually happened — there is no separate log that could disagree with the rows."
      />
      <ol className="mt-4 space-y-4">
        {published.map((revision) => (
          <li key={revision.id} className="border-l-2 border-bark-200 pl-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-bark-900">
                Revision {revision.revision}
              </span>
              {revision.label && (
                <span className="text-sm text-bark-700">{revision.label}</span>
              )}
              <span className="text-xs text-bark-600">
                {revision.publishedBy} ·{" "}
                {revision.publishedAt
                  ? new Date(revision.publishedAt).toLocaleString("en-US")
                  : "—"}
              </span>
            </div>
            {revision.note && (
              <p className="mt-1 text-sm text-bark-600">{revision.note}</p>
            )}
            {revision.changes.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-bark-600">
                {revision.changes.slice(0, 12).map((change, i) => (
                  <li key={`${change.key}-${i}`}>{describeChange(change)}</li>
                ))}
                {revision.changes.length > 12 && (
                  <li className="text-bark-600">
                    …and {revision.changes.length - 12} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-bark-600">
                {revision.revision === 1
                  ? "The seeded book — nothing before it to differ from."
                  : "No changes."}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The price book admin surface (project-map section 4).
 *
 * ADMIN only, and the strictest surface in the app: it is cost, burden and
 * margin in full, and it is the one place a change can move what every
 * future customer is quoted. Which is exactly why edits land in a draft and
 * publishing is a separate, validated act.
 */
export default async function PriceBookPage() {
  const contractor = await currentContractor();
  if (contractor?.role !== "admin") {
    return (
      <Callout tone="neutral" title="Admins only.">
        <p className="mt-1">
          The price book decides what every customer is quoted, so it is
          limited to admin accounts.{" "}
          <Link
            href="/dashboard"
            className="font-medium underline underline-offset-4"
          >
            Back to the lead inbox
          </Link>
          .
        </p>
      </Callout>
    );
  }

  let view: DraftView;
  let history: RevisionHistoryEntry[];
  try {
    [view, history] = await Promise.all([readDraftView(), readHistory()]);
  } catch (error) {
    if (error instanceof PriceBookUnavailableError) {
      return <Unavailable message={error.message} />;
    }
    throw error;
  }

  return (
    <div className="space-y-5">
      <h1 className="display text-2xl text-bark-900">Price book</h1>
      <PriceBookEditor initial={view} />
      <History history={history} />
    </div>
  );
}
