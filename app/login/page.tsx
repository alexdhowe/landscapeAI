import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { currentContractor } from "@/lib/auth/session";
import { isLoginConfigured } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

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
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-6">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
            LandscapeAI <span className="font-normal text-neutral-400">· Contractor</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            This console shows costs, margin and customer contact details. Customers
            never sign in.
          </p>

          <div className="mt-6">
            {configured ? (
              <LoginForm next={target} />
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">No contractor login is configured.</p>
                <p className="mt-2">
                  With a database, create one with{" "}
                  <code className="rounded bg-amber-100 px-1">npm run db:user</code>.
                  Without one, set{" "}
                  <code className="rounded bg-amber-100 px-1">CONTRACTOR_EMAIL</code>{" "}
                  and{" "}
                  <code className="rounded bg-amber-100 px-1">CONTRACTOR_PASSWORD</code>.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-neutral-500">
          Looking to design your yard?{" "}
          <Link href="/start" className="text-neutral-900 underline">
            Start here
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
