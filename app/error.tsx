"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * The last-resort error boundary.
 *
 * Says what a customer can do about it and nothing about what went wrong
 * internally; the digest is there so a report can be matched to a log line
 * without printing a stack trace at somebody standing in their garden.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[unhandled]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-16 sm:px-6">
      <Wordmark className="mb-10 self-start" />
      <h1 className="display text-3xl text-bark-900">
        Something went wrong at our end.
      </h1>
      <p className="mt-3 text-base text-bark-600">
        Nothing you did caused this, and nothing you&apos;ve designed has been
        lost. Try again — if it keeps happening, come back in a few minutes.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset} size="lg">
          Try again
        </Button>
        <a
          href="/start"
          className="inline-flex min-h-11 items-center px-1 text-base font-medium text-bark-700 underline decoration-bark-300 underline-offset-4 hover:text-bark-900 sm:px-3"
        >
          Start over with a photo
        </a>
      </div>
      {error.digest ? (
        <p className="mt-8 text-xs text-bark-500">
          Reference <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </main>
  );
}
