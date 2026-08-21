import Link from "next/link";

import { PriceBookEditor } from "@/components/pricebook/PriceBookEditor";
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

function Unavailable({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <p className="font-medium">The price book is read-only here.</p>
      <p className="mt-2">{message}</p>
    </div>
  );
}

/** Every published revision, and what it changed. */
function History({ history }: { history: RevisionHistoryEntry[] }) {
  const published = history.filter((r) => r.status === "published");
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        History
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Every revision is frozen once published, so this diff is what actually
        happened — there is no separate log that could disagree with the rows.
      </p>
      <ol className="mt-4 space-y-4">
        {published.map((revision) => (
          <li key={revision.id} className="border-l-2 border-neutral-200 pl-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-neutral-900">
                Revision {revision.revision}
              </span>
              {revision.label && (
                <span className="text-sm text-neutral-700">{revision.label}</span>
              )}
              <span className="text-xs text-neutral-400">
                {revision.publishedBy} ·{" "}
                {revision.publishedAt
                  ? new Date(revision.publishedAt).toLocaleString("en-US")
                  : "—"}
              </span>
            </div>
            {revision.note && (
              <p className="mt-1 text-sm text-neutral-500">{revision.note}</p>
            )}
            {revision.changes.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                {revision.changes.slice(0, 12).map((change, i) => (
                  <li key={`${change.key}-${i}`}>{describeChange(change)}</li>
                ))}
                {revision.changes.length > 12 && (
                  <li className="text-neutral-400">
                    …and {revision.changes.length - 12} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">
                {revision.revision === 1
                  ? "The seeded book — nothing before it to differ from."
                  : "No changes."}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
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
      <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm">
        <p className="font-medium text-neutral-900">Admins only.</p>
        <p className="mt-2">
          The price book decides what every customer is quoted, so it is limited to
          admin accounts.{" "}
          <Link href="/dashboard" className="underline">
            Back to the lead inbox
          </Link>
          .
        </p>
      </div>
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
      <PriceBookEditor initial={view} />
      <History history={history} />
    </div>
  );
}
