import Link from "next/link";

/**
 * The contractor console chrome. Everything under this layout is an
 * INTERNAL surface: line items, unit economics, and margin are allowed
 * here and nowhere on the customer side. (Auth arrives with the contractor
 * onboarding work; the MVP console is unauthenticated.)
 */
export default function ContractorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-semibold tracking-tight text-neutral-900">
              LandscapeAI <span className="font-normal text-neutral-400">· Contractor</span>
            </Link>
            <nav className="text-sm text-neutral-500">
              <Link href="/dashboard" className="hover:text-neutral-900">
                Lead inbox
              </Link>
            </nav>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
            Internal — full pricing visible
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
