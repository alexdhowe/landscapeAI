"use client";

import { denseControlClass } from "@/components/ui/Field";
import type { ValidationIssue } from "@/lib/pricebook/validate";
import type { EntityChange } from "@/lib/pricebook/diff";
import { describeChange } from "@/lib/pricebook/diff";
import { Card, SectionHeader } from "@/components/ui/Card";

export const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The dense console control, from the design system rather than from this
 * file's own idea of one. `outline-none` is deliberately gone: the global
 * focus ring in app/globals.css is what a keyboard user follows through a
 * price book with sixty inputs on the page.
 */
export const input = denseControlClass;

export const button =
  "inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-bark-600">
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
        <div role="alert" className="rounded-lg border border-clay-200 bg-clay-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-clay-800">
            {errors.length} problem{errors.length === 1 ? "" : "s"} — cannot publish
          </p>
          <ul className="mt-2 space-y-1 text-sm text-clay-900">
            {errors.map((issue, i) => (
              <li key={`${issue.code}-${issue.path}-${i}`}>
                <span className="font-mono text-xs text-clay-700">{issue.path}</span>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <details className="rounded-lg border border-flag-200 bg-flag-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-flag-800">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"} — publishing is still allowed
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-flag-900">
            {warnings.map((issue, i) => (
              <li key={`${issue.code}-${issue.path}-${i}`}>
                <span className="font-mono text-xs text-flag-700">{issue.path}</span>{" "}
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
  added: "text-canopy-700",
  removed: "text-clay-700",
  changed: "text-bark-700",
};

export function ChangeList({ changes }: { changes: EntityChange[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-bark-600">No changes.</p>;
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
    <Card as="section" className="p-5">
      <SectionHeader title={title} subtitle={subtitle} right={right} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}
