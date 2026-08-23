import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The 404. Reached most often by a customer whose design link has been
 * mistyped or has expired out of a local store, so it offers the one thing
 * that always works: start again with a photo.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-16 sm:px-6">
      <Wordmark className="mb-10 self-start" />
      <p className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
        404
      </p>
      <h1 className="display mt-2 text-3xl text-bark-900">
        There&apos;s nothing at this address.
      </h1>
      <p className="mt-3 text-base text-bark-600">
        The link may be mistyped, or the design it pointed at is no longer
        here.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/start" size="lg">
          Start with a photo
        </ButtonLink>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center px-1 text-base font-medium text-bark-700 underline decoration-bark-300 underline-offset-4 hover:text-bark-900 sm:px-3"
        >
          Back to the front page
        </Link>
      </div>
    </main>
  );
}
