import type { Metadata } from "next";

import { StartUpload } from "@/components/start/StartUpload";

export const metadata: Metadata = {
  title: "Start with a photo",
  description:
    "Upload or take a photo of the area you want worked on. No address, no forms.",
};

/**
 * The entry point, and the first thirty seconds.
 *
 * Designed for a homeowner standing in their yard holding a phone: the
 * camera is the primary affordance and the camera roll is the second, both
 * above the fold at 390×844, both well over 44px. Everything explanatory
 * sits below them — nobody reads it before they have tapped something.
 */
export default function StartPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-10 pt-8 sm:max-w-xl sm:px-6 sm:pt-12">
      <h1 className="display text-3xl text-bark-900 sm:text-4xl">
        See what your yard could be.
      </h1>
      <p className="mt-3 text-base text-bark-600">
        Point your camera at the area you want worked on. We&apos;ll label
        what&apos;s there and you can start swapping materials — no address, no
        forms.
      </p>

      <StartUpload />

      <ol className="mt-10 space-y-4 border-t border-bark-200 pt-8 text-sm text-bark-600">
        {[
          ["Take the photo", "Anything from the driveway or the front walk works."],
          ["We label the areas", "Lawn, beds, hardscape — outlined on your own picture."],
          ["Swap and see the range", "Tap an area, change what's in it, watch the budget follow."],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3.5">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-canopy-100 text-2xs font-semibold text-canopy-800"
            >
              {i + 1}
            </span>
            <span>
              <span className="font-medium text-bark-800">{title}.</span>{" "}
              {body}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
