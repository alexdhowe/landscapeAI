import { Wordmark } from "@/components/ui/Wordmark";

/**
 * The customer chrome: a slim header and nothing else.
 *
 * Deliberately thin. These surfaces are for someone standing outside on a
 * phone, and every row of navigation is a row of their photo they cannot
 * see. The wordmark is here because it is what makes this and the
 * contractor console read as the same company.
 */
export default function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col">
      <header className="border-b border-bark-200 bg-white/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-5 sm:px-6">
          <Wordmark />
        </div>
      </header>
      {children}
    </div>
  );
}
