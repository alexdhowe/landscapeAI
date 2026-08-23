/**
 * Card and Callout — the two container shapes in the app.
 *
 * `Card` is the neutral panel: white on the page ground, hairline border,
 * one step of elevation. `Callout` is the tinted message block, and its
 * tone is the vocabulary the whole product uses:
 *
 *   canopy  something good and settled — the design was sent, sensors agree
 *   survey  something measured — the aerial pass, a narrowed band
 *   flag    attention, not alarm — unmeasured areas, a demo overlay, drafts
 *   clay    a refusal or a failure
 *   neutral information with no temperature
 *
 * Text sits at the 800 stop on a 50 ground in every tone, which is AA by
 * construction (lib/design/__tests__/tokens.test.ts checks the ramps).
 */
export type Tone = "neutral" | "canopy" | "survey" | "flag" | "clay";

const CALLOUT_TONES: Record<Tone, string> = {
  neutral: "border-bark-200 bg-bark-100 text-bark-800",
  canopy: "border-canopy-200 bg-canopy-50 text-canopy-800",
  survey: "border-survey-200 bg-survey-50 text-survey-800",
  flag: "border-flag-200 bg-flag-50 text-flag-800",
  clay: "border-clay-200 bg-clay-50 text-clay-800",
};

export function Card({
  className = "",
  as: As = "div",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return (
    <As
      className={`rounded-xl border border-bark-200 bg-white shadow-e1 ${className}`}
      {...rest}
    />
  );
}

export function Callout({
  tone = "neutral",
  title,
  icon,
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${CALLOUT_TONES[tone]} ${className}`}
      {...rest}
    >
      {icon ? (
        <span aria-hidden className="mt-0.5 shrink-0">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 break-words">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * A section heading inside the console: an all-caps eyebrow, an optional
 * subtitle, and room for an action on the right.
 */
export function SectionHeader({
  title,
  subtitle,
  right,
  id,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2
          id={id}
          className="text-xs font-semibold uppercase tracking-wider text-bark-500"
        >
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-bark-600">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

/**
 * Nothing here yet, and why. Every list in the console has one of these —
 * a blank panel that says nothing is a bug report waiting to happen.
 */
export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-bark-300 bg-bark-50 px-6 py-10 text-center">
      {icon ? (
        <div aria-hidden className="mb-3 flex justify-center text-bark-500">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-bark-800">{title}</p>
      {children ? (
        <div className="mx-auto mt-1.5 max-w-sm text-sm text-bark-600">{children}</div>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
