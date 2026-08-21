import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-center text-4xl font-semibold tracking-tight text-neutral-900">
        LandscapeAI
      </h1>
      <p className="max-w-md text-center text-neutral-600">
        Upload a photo of your yard, swap materials on your own picture, and
        see what projects like yours typically cost — before anyone visits.
      </p>
      <Link
        href="/start"
        className="rounded-full bg-emerald-600 px-6 py-3 font-medium text-white transition hover:bg-emerald-700"
      >
        Start with a photo
      </Link>
      <Link
        href="/design/demo"
        className="text-sm text-emerald-700 underline underline-offset-2"
      >
        See a planting grow over time →
      </Link>
    </main>
  );
}
