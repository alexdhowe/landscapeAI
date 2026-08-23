import { ButtonLink } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import Link from "next/link";

/**
 * The front door. Mobile-first like every customer surface: one promise,
 * one button, and the two side doors kept small and out of the way.
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 pt-6 sm:px-8">
        <Wordmark href={null} />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-12 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-2xs font-semibold uppercase tracking-wider text-canopy-700">
            Design to estimate
          </p>
          <h1 className="display mt-3 text-4xl text-bark-900 sm:text-5xl">
            See what your yard could be — before anyone visits.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-bark-600">
            Take a photo of the area you want worked on. We label what&apos;s
            there, you swap what&apos;s in it, and a budget range appears based
            on what projects like yours actually cost.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/start" size="lg" className="sm:w-auto">
              Start with a photo
            </ButtonLink>
            <Link
              href="/design/demo"
              className="inline-flex min-h-11 items-center rounded-lg px-1 text-base font-medium text-canopy-800 underline decoration-canopy-300 underline-offset-4 hover:decoration-canopy-600 sm:px-3"
            >
              See a planting grow over five years
            </Link>
          </div>

          <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-bark-200 pt-8 sm:grid-cols-3">
            {[
              ["No address required", "Not until you want a sharper number."],
              ["No forms", "Design first. Contact details are the last step, not the first."],
              ["Real prices", "Ranges built from real bids, not a cost calculator."],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="text-sm font-semibold text-bark-800">{term}</dt>
                <dd className="mt-1 text-sm text-bark-600">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 pb-8 sm:px-8">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center text-sm text-bark-500 underline decoration-bark-300 underline-offset-4 hover:text-bark-800"
        >
          Contractor sign in
        </Link>
      </footer>
    </div>
  );
}
