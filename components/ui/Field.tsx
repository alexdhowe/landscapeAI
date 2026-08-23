"use client";

import { useId } from "react";

/**
 * A labelled form control.
 *
 * Built because every form in the app had grown its own: the customer's
 * lead form used placeholders as labels (which vanish the moment you type
 * and are invisible to a screen reader), the login form had real labels,
 * and the price book had a third shape. One control, one label, one
 * description, one error — wired together with ids so assistive tech sees
 * the same relationships a sighted user does.
 *
 * The input is 16px on purpose. Below that, iOS Safari zooms the viewport
 * when the field takes focus, which on /start throws the customer out of
 * the layout on their first tap.
 */
const CONTROL =
  "w-full rounded-lg border border-bark-300 bg-white px-3 py-2.5 text-base text-bark-900 " +
  "placeholder:text-bark-500 transition-colors hover:border-bark-400 " +
  "disabled:cursor-not-allowed disabled:bg-bark-100 disabled:text-bark-500 " +
  "aria-[invalid=true]:border-clay-600";

/** Dense variant for the console, where a row holds six of these. */
const CONTROL_DENSE =
  "w-full rounded-md border border-bark-300 bg-white px-2.5 py-1.5 text-sm text-bark-900 " +
  "placeholder:text-bark-500 transition-colors hover:border-bark-400 " +
  "disabled:cursor-not-allowed disabled:bg-bark-100 disabled:text-bark-500";

export const controlClass = CONTROL;
export const denseControlClass = CONTROL_DENSE;

type FieldProps = {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Rendered as a visually-hidden label — for a control whose purpose is
   *  obvious from its surroundings but which still needs a name. */
  hideLabel?: boolean;
  dense?: boolean;
  children: (props: {
    id: string;
    className: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
  }) => React.ReactNode;
};

export function Field({
  label,
  hint,
  error,
  hideLabel = false,
  dense = false,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className={
          hideLabel
            ? "sr-only"
            : dense
              ? "block text-xs font-medium text-bark-600"
              : "block text-sm font-medium text-bark-700"
        }
      >
        {label}
      </label>
      <div className={hideLabel ? "" : "mt-1.5"}>
        {children({
          id,
          className: dense ? CONTROL_DENSE : CONTROL,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-bark-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs font-medium text-clay-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
