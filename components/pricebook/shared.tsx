"use client";

import type { ValidationIssue } from "@/lib/pricebook/validate";
import type { EntityChange } from "@/lib/pricebook/diff";
import { describeChange } from "@/lib/pricebook/diff";

export const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const input =
  "w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 outline-none focus:border-neutral-400 disabled:bg-neutral-50";

export const button =
  "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-neutral-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** What is wrong with the draft. Errors block a publish; warnings do not. */
export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
            {errors.length} problem{errors.length === 1 ? "" : "s"} — cannot publish
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {errors.map((issue, i) => (
              <li key={`${issue.code}-${issue.path}-${i}`}>
                <span className="font-mono text-xs text-red-700">{issue.path}</span>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-amber-800">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"} — publishing is still allowed
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {warnings.map((issue, i) => (
              <li key={`${issue.code}-${issue.path}-${i}`}>
                <span className="font-mono text-xs text-amber-700">{issue.path}</span>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const CHANGE_TONE: Record<EntityChange["kind"], string> = {
  added: "text-emerald-700",
  removed: "text-red-700",
  changed: "text-neutral-700",
};

export function ChangeList({ changes }: { changes: EntityChange[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-neutral-500">No changes.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {changes.map((change, i) => (
        <li key={`${change.key}-${i}`} className={CHANGE_TONE[change.kind]}>
          {describeChange(change)}
        </li>
      ))}
    </ul>
  );
}

export function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
