"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Ends the session and returns to the login page. */
export function SignOut({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500">
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
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
