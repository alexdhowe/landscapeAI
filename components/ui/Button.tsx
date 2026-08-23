import Link from "next/link";

/**
 * The button.
 *
 * Built because the same three-line class string had been retyped in eight
 * places with four different greens. It is not the start of a component
 * library — it exists because it was already repeated.
 *
 * Every size except `xs` clears the 44px minimum tap target on its own;
 * `xs` is for dense console rows and carries the `tap-target` utility,
 * which extends the hit area without changing how it looks.
 */
export type ButtonTone =
  | "primary"
  | "neutral"
  | "secondary"
  | "ghost"
  | "danger"
  | "survey";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const TONES: Record<ButtonTone, string> = {
  primary:
    "bg-canopy-700 text-white shadow-e1 hover:bg-canopy-800 active:bg-canopy-900",
  // The console's default action: the interface there is dense and
  // information-first, and a green button on every row would read as
  // decoration rather than as the one thing to press.
  neutral: "bg-bark-900 text-white shadow-e1 hover:bg-bark-800 active:bg-bark-950",
  secondary:
    "border border-bark-300 bg-white text-bark-800 hover:border-bark-400 hover:bg-bark-50",
  ghost: "text-bark-600 hover:bg-bark-100 hover:text-bark-900",
  danger: "bg-clay-700 text-white shadow-e1 hover:bg-clay-800 active:bg-clay-900",
  survey:
    "bg-survey-700 text-white shadow-e1 hover:bg-survey-800 active:bg-survey-900",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "tap-target min-h-8 rounded-md px-2.5 py-1 text-xs",
  sm: "min-h-11 rounded-lg px-3.5 py-2 text-sm",
  md: "min-h-11 rounded-lg px-4 py-2.5 text-sm",
  lg: "min-h-13 rounded-xl px-5 py-3 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";

export function buttonClass(
  tone: ButtonTone = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return `${BASE} ${TONES[tone]} ${SIZES[size]} ${extra}`.trim();
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  block?: boolean;
};

export function Button({
  tone = "primary",
  size = "md",
  block = false,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(tone, size, `${block ? "w-full" : ""} ${className}`)}
      {...rest}
    />
  );
}

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  block?: boolean;
};

export function ButtonLink({
  tone = "primary",
  size = "md",
  block = false,
  className = "",
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClass(tone, size, `${block ? "w-full" : ""} ${className}`)}
      {...rest}
    />
  );
}
