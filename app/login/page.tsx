import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { Callout, Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/ui/Wordmark";
import { currentContractor } from "@/lib/auth/session";
import { isLoginConfigured } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contractor sign in" };

/** Only ever redirect to a path on this site. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await currentContractor()) redirect(target);

  const configured = isLoginConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-6">
      <div className="w-full max-w-sm">
        <Wordmark href={null} suffix="Contractor" className="mb-5" />
        <Card className="p-6">
          <h1 className="text-lg font-semibold tracking-tight text-bark-900">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-bark-600">
            This console shows costs, margin and customer contact details.
            Customers never sign in.
          </p>

          <div className="mt-6">
            {configured ? (
              <LoginForm next={target} />
            ) : (
              <Callout tone="flag" title="No contractor login is configured.">
                <p className="mt-1">
                  With a database, create one with{" "}
                  <code className="rounded bg-flag-100 px-1 font-mono text-xs">
                    npm run db:user
                  </code>
                  . Without one, set{" "}
                  <code className="rounded bg-flag-100 px-1 font-mono text-xs">
                    CONTRACTOR_EMAIL
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-flag-100 px-1 font-mono text-xs">
                    CONTRACTOR_PASSWORD
                  </code>
                  .
                </p>
              </Callout>
            )}
          </div>
        </Card>

        <p className="mt-5 text-center text-sm text-bark-600">
          Looking to design your yard?{" "}
          <Link
            href="/start"
            className="inline-flex min-h-11 items-center font-medium text-bark-900 underline decoration-bark-300 underline-offset-4 hover:decoration-bark-600"
          >
            Start here
          </Link>
        </p>
      </div>
    </div>
  );
}
