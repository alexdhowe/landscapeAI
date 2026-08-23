import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOut } from "@/components/auth/SignOut";
import { Badge } from "@/components/ui/Badge";
import { Wordmark } from "@/components/ui/Wordmark";
import { currentContractor } from "@/lib/auth/session";

/**
 * The contractor console chrome, and the real gate on it.
 *
 * Everything under this layout is an INTERNAL surface: line items, unit
 * economics, margin, and every lead's contact details. `middleware.ts`
 * bounces anyone with no session cookie, but that check is UX — this is
 * where the token is actually verified, and nothing below renders until it
 * has been.
 *
 * Visually it is the same product as the customer side and deliberately a
 * different register: darker chrome, denser type, information first. The
 * wordmark is the shared part, and the amber "internal" marker is the one
 * thing on either side that says which of the two you are looking at.
 */
export default async function ContractorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const contractor = await currentContractor();
  if (!contractor) redirect("/login");

  const links = [
    { href: "/dashboard", label: "Lead inbox" },
    { href: "/deltas", label: "Estimation error" },
    ...(contractor.role === "admin"
      ? [{ href: "/pricebook", label: "Price book" }]
      : []),
  ];

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-bark-100">
      <header className="border-b border-bark-800 bg-bark-950">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <Wordmark href="/dashboard" suffix="Contractor" tone="light" />
            <nav aria-label="Console">
              <ul className="flex items-center gap-1">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 items-center rounded-md px-2.5 text-sm text-bark-300 transition-colors hover:bg-bark-800 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="flag">Internal — full pricing visible</Badge>
            <SignOut name={contractor.name || contractor.email} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-5 py-7 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
