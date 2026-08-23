"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Card";

/** The design page failed to render. Offer the two ways forward. */
export default function DesignError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[design]", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-5 py-16 sm:px-6">
      <Callout tone="clay" title="We couldn't open this design" role="alert">
        <p className="mt-1">
          The link may be wrong, or something failed at our end. Your photo and
          anything you&apos;ve chosen are still saved.
        </p>
      </Callout>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset}>Try again</Button>
        <a
          href="/start"
          className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-bark-700 underline decoration-bark-300 underline-offset-4 hover:text-bark-900 sm:px-3"
        >
          Start over with a photo
        </a>
      </div>
    </main>
  );
}
