import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOut } from "@/components/auth/SignOut";
import { currentContractor } from "@/lib/auth/session";

/**
 * The contractor console chrome, and the real gate on it.
 *
 * Everything under this layout is an INTERNAL surface: line items, unit
 * economics, margin, and every lead's contact details. `middleware.ts`
 * bounces anyone with no session cookie, but that check is UX — this is
 * where the token is actually verified, and nothing below renders until it
 * has been.
 */
export default async function ContractorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const contractor = await currentContractor();
  if (!contractor) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-semibold tracking-tight text-neutral-900">
              LandscapeAI <span className="font-normal text-neutral-400">· Contractor</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-500">
              <Link href="/dashboard" className="hover:text-neutral-900">
                Lead inbox
              </Link>
              <Link href="/deltas" className="hover:text-neutral-900">
                Estimation error
              </Link>
              {contractor.role === "admin" && (
                <Link href="/pricebook" className="hover:text-neutral-900">
                  Price book
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
              Internal — full pricing visible
            </span>
            <SignOut name={contractor.name || contractor.email} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
