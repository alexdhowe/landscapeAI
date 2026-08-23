"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Ends the session and returns to the login page. */
export function SignOut({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-2.5 text-sm text-bark-300">
      <span className="hidden sm:inline">{name}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { signOut } = await import("next-auth/react");
          await signOut({ redirect: false });
          router.push("/login");
          router.refresh();
        }}
        className="inline-flex min-h-11 items-center rounded-md border border-bark-700 px-3 text-xs font-medium text-bark-200 transition-colors hover:border-bark-500 hover:text-white disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
