"use client";

import { useCallback, useState } from "react";

import type { AssemblyComponent, CostItem, CostItemKind } from "@/lib/pricing/types";
import type { Assembly } from "@/lib/pricing/types";
import type { DraftView } from "@/lib/pricebook/service";

import { Assemblies } from "./Assemblies";
import { CostItems } from "./CostItems";
import { Settings } from "./Settings";
import { ChangeList, IssueList, Section, button } from "./shared";

export type { AssemblyComponent, CostItem, CostItemKind, Assembly };

type Tab = "costs" | "assemblies" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "costs", label: "Cost items" },
  { id: "assemblies", label: "Assemblies" },
  { id: "settings", label: "Margin & disclosure" },
];

/**
 * The price book editor.
 *
 * Every edit goes to the draft, never to the published book — the server
 * opens a draft on the first change if there isn't one. Nothing here can
 * move a price a customer has already been shown; that is what publishing
 * a new revision is for, and what the frozen snapshots are proof against.
 */
export function PriceBookEditor({ initial }: { initial: DraftView }) {
  const [view, setView] = useState(initial);
  const [tab, setTab] = useState<Tab>("costs");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  /** Every mutation returns the whole new view, so there is one state to sync. */
  const send = useCallback(
    async (url: string, method: string, body?: unknown): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          setError(payload?.error ?? "Something went wrong — try again.");
          return false;
        }
        if (payload && "config" in payload) setView(payload as DraftView);
        return true;
      } catch {
        setError("Network error — try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    const res = await fetch("/api/pricebook");
    if (res.ok) setView((await res.json()) as DraftView);
  }, []);

  const publish = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pricebook/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(label.trim() ? { label: label.trim() } : {}),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error ?? "Could not publish.");
        return;
      }
      setLabel("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [label, refresh]);

  const discard = useCallback(async () => {
    if (await send("/api/pricebook/draft", "DELETE")) await refresh();
  }, [refresh, send]);

  const { draft, published, config, issues, changes, publishable } = view;

  return (
    <div className="space-y-5">
      <Section
        title="Revision"
        subtitle={
          draft
            ? `Draft ${draft.revision}, started by ${draft.createdBy}. Nothing here prices a customer until you publish.`
            : `Publishing from revision ${published?.revision ?? "—"}${
                published?.label ? ` · ${published.label}` : ""
              }. Editing anything opens a draft.`
        }
        right={
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              draft ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {draft ? `Draft · ${changes.length} change${changes.length === 1 ? "" : "s"}` : "Published"}
          </span>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <ChangeList changes={changes} />
            <IssueList issues={issues} />
            <div className="flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-4">
              <label className="flex-1 text-xs text-neutral-500">
                What changed, in your words
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Spring 2026 stone increase"
                  disabled={busy}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400"
                />
              </label>
              <button
                type="button"
                onClick={publish}
                disabled={busy || !publishable}
                className={`${button} bg-neutral-900 text-white hover:bg-neutral-700`}
              >
                {busy ? "Working…" : `Publish revision ${draft.revision}`}
              </button>
              <button
                type="button"
                onClick={discard}
                disabled={busy}
                className={`${button} border border-neutral-300 text-neutral-700 hover:border-neutral-900`}
              >
                Discard draft
              </button>
            </div>
            {!publishable && (
              <p className="text-xs text-red-700">
                Fix the problems above before publishing. Until then the book keeps
                pricing from revision {published?.revision ?? "—"}.
              </p>
            )}
          </div>
        ) : (
          <IssueList issues={issues} />
        )}
      </Section>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "costs" && <CostItems config={config} busy={busy} send={send} />}
      {tab === "assemblies" && <Assemblies config={config} busy={busy} send={send} />}
      {tab === "settings" && <Settings config={config} busy={busy} send={send} />}
    </div>
  );
}

export type Send = (url: string, method: string, body?: unknown) => Promise<boolean>;
