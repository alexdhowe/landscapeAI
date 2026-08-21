"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ConfirmableUnit, Correction } from "@/lib/confirm/types";
import type { QuantitySource } from "@/lib/pricing/types";

import { ProvenanceBadge } from "./badges";

/** One region as the rep finds it: the current number and where it came from. */
export type ConfirmRow = {
  regionId: string;
  label: string;
  areaSf: { value: number; source: QuantitySource; confidence: number };
  perimeterLf: { value: number; source: QuantitySource; confidence: number };
};

type Draft = { areaSf: string; perimeterLf: string };
/** Which dimensions the rep says they actually measured on site. */
type Checked = { areaSf: boolean; perimeterLf: boolean };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The confirmation gate, rep side.
 *
 * One rule decides what gets sent: a dimension is recorded if the rep says
 * they measured it. Editing a value says so implicitly and ticks the box;
 * an unchanged value can be ticked deliberately, which records a
 * zero-error delta.
 *
 * That second case matters more than it looks. A confirmed-correct
 * estimate is the strongest evidence the estimator works, and a corpus
 * that could only record misses would report the estimator as worse than
 * it is. What must never be recorded is a number nobody checked — hence
 * the box, rather than sending every field on screen.
 */
export function ConfirmQuantities({
  projectId,
  rows,
  locked,
}: {
  projectId: string;
  rows: ConfirmRow[];
  /** True once the final quote is issued — corrections would no longer reach it. */
  locked: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => [
          row.regionId,
          {
            areaSf: String(round1(row.areaSf.value)),
            perimeterLf: String(round1(row.perimeterLf.value)),
          },
        ]),
      ) as Record<string, Draft>,
    [rows],
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [checked, setChecked] = useState<Record<string, Checked>>({});
  const [repName, setRepName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdited = useCallback(
    (regionId: string, key: keyof Draft, current: number) => {
      const raw = drafts[regionId]?.[key];
      // Compare against the displayed (rounded) number, so re-typing what
      // is already on screen is not itself an edit.
      return raw !== undefined && Number(raw) !== round1(current);
    },
    [drafts],
  );

  const corrections = useMemo(() => {
    const out: Correction[] = [];
    for (const row of rows) {
      const draft = drafts[row.regionId];
      if (!draft) continue;
      const dims: [ConfirmableUnit, keyof Draft, number][] = [
        ["SF", "areaSf", row.areaSf.value],
        ["LF", "perimeterLf", row.perimeterLf.value],
      ];
      for (const [unit, key, current] of dims) {
        const value = Number(draft[key]);
        if (!Number.isFinite(value) || value <= 0) continue;
        const edited = Number(draft[key]) !== round1(current);
        if (!edited && !checked[row.regionId]?.[key]) continue;
        out.push({ photoRegionId: row.regionId, unit, value });
      }
    }
    return out;
  }, [checked, drafts, rows]);

  const setDraft = (regionId: string, key: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [regionId]: { ...d[regionId], [key]: value } }));

  const toggle = (regionId: string, key: keyof Draft) =>
    setChecked((c) => {
      const row = c[regionId] ?? { areaSf: false, perimeterLf: false };
      return { ...c, [regionId]: { ...row, [key]: !row[key] } };
    });

  const post = useCallback(
    async (url: string, body?: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          setError(payload?.error ?? "Something went wrong — try again.");
          return false;
        }
        router.refresh();
        return true;
      } catch {
        setError("Network error — try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const submitCorrections = useCallback(async () => {
    if (corrections.length === 0) return;
    const ok = await post(`/api/projects/${projectId}/confirm`, {
      correctedBy: repName.trim(),
      corrections: note.trim()
        ? corrections.map((c) => ({ ...c, note: note.trim() }))
        : corrections,
    });
    if (ok) {
      setNote("");
      setChecked({});
    }
  }, [corrections, note, post, projectId, repName]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        This design has no selected regions, so there is nothing to measure.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
              <th className="py-2 pr-3 font-medium">Region</th>
              <th className="py-2 pr-3 font-medium">Current source</th>
              <th className="py-2 pr-3 font-medium">Area (SF)</th>
              <th className="py-2 font-medium">Edge run (LF)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.regionId];
              const dims: { key: keyof Draft; unit: string; current: number }[] = [
                { key: "areaSf", unit: "SF", current: row.areaSf.value },
                { key: "perimeterLf", unit: "LF", current: row.perimeterLf.value },
              ];
              return (
                <tr key={row.regionId} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 text-neutral-800">{row.label}</td>
                  <td className="py-2 pr-3">
                    <ProvenanceBadge source={row.areaSf.source} />
                  </td>
                  {dims.map(({ key, unit, current }) => {
                    const edited = isEdited(row.regionId, key, current);
                    const ticked = edited || Boolean(checked[row.regionId]?.[key]);
                    return (
                      <td key={key} className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={1}
                            step="1"
                            aria-label={`${row.label} ${unit}`}
                            disabled={locked || busy}
                            value={draft?.[key] ?? ""}
                            onChange={(e) => setDraft(row.regionId, key, e.target.value)}
                            className={`w-28 rounded-lg border px-2 py-1 text-sm tabular-nums outline-none ${
                              edited
                                ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                                : "border-neutral-200 text-neutral-800"
                            } disabled:bg-neutral-100 disabled:text-neutral-400`}
                          />
                          <label
                            title="I measured this on site"
                            className="flex cursor-pointer items-center gap-1 text-[11px] text-neutral-400"
                          >
                            <input
                              type="checkbox"
                              checked={ticked}
                              // An edit already says the rep measured it;
                              // the box only adds the unchanged case.
                              disabled={locked || busy || edited}
                              onChange={() => toggle(row.regionId, key)}
                              className="h-3.5 w-3.5 accent-emerald-600"
                            />
                            measured
                          </label>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {locked ? (
        <p className="text-xs text-neutral-500">
          The final quote has been issued — further corrections would not reach
          it. A revised quote is a new revision, which this MVP does not model.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-neutral-500">
              Confirmed by
              <input
                value={repName}
                onChange={(e) => setRepName(e.target.value)}
                placeholder="Rep name"
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 outline-none focus:border-neutral-400"
              />
            </label>
            <label className="text-xs text-neutral-500">
              Site note (optional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. bed wraps behind the downspout"
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-800 outline-none focus:border-neutral-400"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submitCorrections}
              disabled={busy || corrections.length === 0 || repName.trim().length === 0}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:bg-neutral-300"
            >
              {busy
                ? "Recording…"
                : corrections.length === 0
                  ? "No changes to record"
                  : `Record ${corrections.length} correction${corrections.length === 1 ? "" : "s"}`}
            </button>
            <span className="max-w-md text-xs text-neutral-500">
              Each one writes a measurement delta — the estimate it replaced
              is kept, not overwritten. Tick <em>measured</em> without
              changing a number to record that the estimate was right.
            </span>
          </div>
        </>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
    </div>
  );
}

/** Issues the final quote once at least one correction is on record. */
export function IssueFinalQuote({
  projectId,
  disabled,
  reason,
}: {
  projectId: string;
  disabled: boolean;
  reason: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issue = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/quote`, { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? "Could not issue the quote.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }, [projectId, router]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={issue}
        disabled={disabled || busy}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:bg-neutral-300"
      >
        {busy ? "Issuing…" : "Issue final quote"}
      </button>
      <p className="text-xs text-neutral-500">{reason}</p>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
    </div>
  );
}
