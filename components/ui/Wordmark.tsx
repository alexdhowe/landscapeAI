import Link from "next/link";

/**
 * The mark and the name, in the display face. The one thing that appears
 * on both the customer surfaces and the contractor console, which is most
 * of what makes them read as the same company.
 */
export function Wordmark({
  className = "",
  href = "/",
  suffix,
  tone = "dark",
}: {
  className?: string;
  href?: string | null;
  /** e.g. "Contractor" — set apart, never part of the name. */
  suffix?: string;
  tone?: "dark" | "light";
}) {
  const body = (
    <span className="inline-flex items-center gap-2">
      <svg
        aria-hidden
        viewBox="0 0 64 64"
        className="size-6 shrink-0"
        focusable="false"
      >
        <rect width="64" height="64" rx="15" className="fill-canopy-700" />
        <path
          d="M32 13c10.5 0 19 8.3 19 18.5 0 3.9-1.3 7.6-3.5 10.6H16.5A17.8 17.8 0 0 1 13 31.5C13 21.3 21.5 13 32 13Z"
          className="fill-canopy-300"
        />
        <rect x="10" y="45" width="44" height="5.5" rx="2.75" className="fill-canopy-50" />
      </svg>
      <span
        className={`display text-lg ${tone === "light" ? "text-white" : "text-bark-900"}`}
      >
        LandscapeAI
      </span>
      {suffix ? (
        <span
          className={`text-sm ${tone === "light" ? "text-canopy-200" : "text-bark-500"}`}
        >
          · {suffix}
        </span>
      ) : null}
    </span>
  );

  if (!href) return <span className={className}>{body}</span>;
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center rounded-md ${className}`}
    >
      {body}
    </Link>
  );
}
