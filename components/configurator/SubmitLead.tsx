"use client";

import { useCallback, useEffect, useState } from "react";

import { customerBand, isFinalQuotePayload } from "@/lib/design/quote";
import type { SnapshotCustomerView } from "@/lib/lead/snapshot";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The lead-capture card. Before submit: a short contact form ("a rep will
 * confirm on site"). After submit: the FROZEN estimate, fetched from the
 * snapshot endpoint — the exact bytes stored at submit time, so what this
 * card shows is what the contractor's dashboard records. Works with or
 * without an address; declining one only means the band stays typology.
 */
export function SubmitLead({
  projectId,
  submitted,
  canSubmit,
  onSubmitted,
}: {
  projectId: string;
  submitted: boolean;
  /** False until the design has a band — nothing to send yet. */
  canSubmit: boolean;
  onSubmitted: () => void;
}) {
  const [snapshot, setSnapshot] = useState<SnapshotCustomerView | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The frozen confirmation comes from the snapshot endpoint, never from
  // local state — the customer always re-reads the stored bytes.
  useEffect(() => {
    if (!submitted) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/projects/${projectId}/snapshot`);
      if (res.ok && !cancelled) {
        setSnapshot((await res.json()) as SnapshotCustomerView);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, submitted]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setSending(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact: {
              name,
              email,
              ...(phone.trim() ? { phone } : {}),
              ...(notes.trim() ? { notes } : {}),
            },
          }),
        });
        if (res.ok) {
          setSnapshot((await res.json()) as SnapshotCustomerView);
          onSubmitted();
        } else {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Something went wrong — please try again.");
        }
      } finally {
        setSending(false);
      }
    },
    [projectId, name, email, phone, notes, onSubmitted],
  );

  if (submitted || snapshot) {
    // The snapshot endpoint always serves the SUBMITTED estimate, so this
    // is always a band — a rep's final quote lands on its own endpoint and
    // never rewrites what the customer was shown here.
    const band = snapshot ? customerBand(snapshot.estimate) : null;
    const measured = band && !isFinalQuotePayload(snapshot!.estimate)
      ? snapshot!.estimate.band.basis === "measured"
      : false;
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">
          Design sent to the contractor ✓
        </p>
        {band && (
          <p className="mt-1 text-sm text-emerald-800">
            Your locked estimate: <strong>{usd(band.low)} – {usd(band.high)}</strong>
            {measured
              ? ", measured from your yard."
              : ", based on typical projects like yours."}
          </p>
        )}
        <p className="mt-2 text-xs text-emerald-700">
          A rep will reach out to confirm details and visit the site. This
          estimate is frozen exactly as you see it
          {snapshot ? (
            <>
              {" "}
              (ref <code className="font-mono">{snapshot.snapshotId.slice(0, 8)}</code>,{" "}
              {new Date(snapshot.issuedAt).toLocaleDateString("en-US")})
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Like this design?
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        Send it to the contractor — a rep confirms everything on site before
        anything is final.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-2.5">
        <input
          type="text"
          required
          maxLength={120}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="email"
          required
          maxLength={200}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="tel"
          maxLength={40}
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <textarea
          maxLength={2000}
          rows={2}
          placeholder="Anything the crew should know? (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={sending || !canSubmit}
          className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send my design & estimate"}
        </button>
        {!canSubmit && (
          <p className="text-xs text-neutral-400">
            Pick at least one material or add-on first so there&apos;s an estimate
            to send.
          </p>
        )}
      </form>
    </div>
  );
}
