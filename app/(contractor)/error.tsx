"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Card";

/**
 * The console's error boundary. A rep can be told what actually broke —
 * this is an internal surface — but not shown a stack trace.
 */
export default function ContractorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[console]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10">
      <Callout tone="clay" title="This page failed to load" role="alert">
        <p className="mt-1">
          Nothing was written and no lead was changed. Retry, and if it keeps
          failing the server log has the detail.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs">
            Reference <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </Callout>
      <Button onClick={reset} className="mt-5">
        Try again
      </Button>
    </div>
  );
}
