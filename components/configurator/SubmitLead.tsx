"use client";

import { useCallback, useEffect, useState } from "react";

import { customerBand, isFinalQuotePayload } from "@/lib/design/quote";
import type { SnapshotCustomerView } from "@/lib/lead/snapshot";

import { Button } from "@/components/ui/Button";
import { Callout, Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";

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
      <div className="rounded-xl border border-canopy-200 bg-canopy-50 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-canopy-900">
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
          >
            <path d="M3.5 10.5 8 15l8.5-10" />
          </svg>
          Design sent to the contractor
        </p>
        {band && (
          <p className="mt-2 text-sm text-canopy-800">
            Your locked estimate:{" "}
            <strong className="tnum">
              {usd(band.low)} – {usd(band.high)}
            </strong>
            {measured
              ? ", measured from your yard."
              : ", based on typical projects like yours."}
          </p>
        )}
        <p className="mt-3 text-xs text-canopy-800">
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

  // Nothing to send yet, so nothing here. A four-field form the customer
  // cannot submit is most of a phone screen spent on a dead end, and a
  // placeholder saying "pick something first" would be the third card in a
  // row saying it — the budget card already does. This appears the moment
  // there is an estimate to send.
  if (!canSubmit) return null;

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-2xs font-semibold uppercase tracking-wider text-bark-500">
        Like this design?
      </h2>
      <p className="mt-1.5 text-sm text-bark-700">
        Send it to the contractor — a rep confirms everything on site before
        anything is final.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Field label="Your name">
          {(props) => (
            <input
              {...props}
              type="text"
              required
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Email">
          {(props) => (
            <input
              {...props}
              type="email"
              required
              autoComplete="email"
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Phone" hint="Optional.">
          {(props) => (
            <input
              {...props}
              type="tel"
              autoComplete="tel"
              maxLength={40}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          )}
        </Field>
        <Field label="Anything the crew should know?" hint="Optional.">
          {(props) => (
            <textarea
              {...props}
              maxLength={2000}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {error && (
          <Callout tone="clay" role="alert" className="text-xs">
            {error}
          </Callout>
        )}
        <Button type="submit" disabled={sending} block size="lg">
          {sending ? "Sending…" : "Send my design & estimate"}
        </Button>
      </form>
    </Card>
  );
}
