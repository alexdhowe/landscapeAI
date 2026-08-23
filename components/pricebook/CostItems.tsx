"use client";

import { useState } from "react";

import type { CostItem, CostItemKind } from "@/lib/pricing/types";
import type { PricingConfig } from "@/lib/pricebook/types";

import type { Send } from "./PriceBookEditor";
import { Field, Section, button, input, usd } from "./shared";

const KINDS: CostItemKind[] = ["material", "labor", "equipment", "disposal"];
const UNITS = ["SF", "LF", "EA", "CY", "HR", "TON"];

type Draft = {
  id: string;
  name: string;
  kind: CostItemKind;
  unit: string;
  unitCost: string;
  burdenPct: string;
  wasteFactorPct: string;
};

const toDraft = (item: CostItem): Draft => ({
  id: item.id,
  name: item.name,
  kind: item.kind,
  unit: item.unit,
  unitCost: String(item.unitCost),
  burdenPct: item.burdenPct === undefined ? "" : String(item.burdenPct),
  wasteFactorPct: item.wasteFactorPct === undefined ? "" : String(item.wasteFactorPct),
});

const EMPTY: Draft = {
  id: "",
  name: "",
  kind: "material",
  unit: "EA",
  unitCost: "0",
  burdenPct: "",
  wasteFactorPct: "",
};

const body = (draft: Draft) => ({
  name: draft.name,
  kind: draft.kind,
  unit: draft.unit,
  unitCost: Number(draft.unitCost),
  burdenPct: draft.burdenPct === "" ? undefined : Number(draft.burdenPct),
  wasteFactorPct: draft.wasteFactorPct === "" ? undefined : Number(draft.wasteFactorPct),
});

function Form({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  isNew,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  isNew: boolean;
}) {
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...draft, [key]: e.target.value });

  return (
    <div className="space-y-3 rounded-lg border border-bark-300 bg-bark-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {isNew && (
          <Field label="SKU id">
            <input
              value={draft.id}
              onChange={set("id")}
              placeholder="stone_pea_gravel"
              disabled={busy}
              className={input}
            />
          </Field>
        )}
        <Field label="Name">
          <input value={draft.name} onChange={set("name")} disabled={busy} className={input} />
        </Field>
        <Field label="Kind">
          <select value={draft.kind} onChange={set("kind")} disabled={busy} className={input}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit">
          <select value={draft.unit} onChange={set("unit")} disabled={busy} className={input}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit cost (your cost, not sell)">
          <input
            type="number"
            step="0.01"
            value={draft.unitCost}
            onChange={set("unitCost")}
            disabled={busy}
            className={input}
          />
        </Field>
        <Field label="Burden % (labor)">
          <input
            type="number"
            step="0.1"
            value={draft.burdenPct}
            onChange={set("burdenPct")}
            placeholder="—"
            disabled={busy}
            className={input}
          />
        </Field>
        <Field label="Waste factor % (material)">
          <input
            type="number"
            step="0.1"
            value={draft.wasteFactorPct}
            onChange={set("wasteFactorPct")}
            placeholder="—"
            disabled={busy}
            className={input}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || draft.id.trim() === "" || draft.name.trim() === ""}
          className={`${button} bg-bark-900 text-white shadow-e1 hover:bg-bark-800`}
        >
          Save to draft
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`${button} border border-bark-300 bg-white text-bark-700 hover:border-bark-400 hover:bg-bark-50`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CostItems({
  config,
  busy,
  send,
}: {
  config: PricingConfig;
  busy: boolean;
  send: Send;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);

  const save = async (sku: string) => {
    const ok = await send(`/api/pricebook/cost-items/${encodeURIComponent(sku)}`, "PUT", body(draft));
    if (ok) {
      setEditing(null);
      setAdding(false);
    }
  };

  return (
    <Section
      title="Cost items"
      subtitle="What you pay, before burden, waste, overhead or margin. The pricing engine resolves components by these ids."
      right={
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setAdding(true);
            setEditing(null);
          }}
          disabled={busy || adding}
          className={`${button} border border-bark-300 bg-white text-bark-700 hover:border-bark-400 hover:bg-bark-50`}
        >
          Add cost item
        </button>
      }
    >
      <div className="space-y-3">
        {adding && (
          <Form
            draft={draft}
            setDraft={setDraft}
            onSave={() => save(draft.id.trim())}
            onCancel={() => setAdding(false)}
            busy={busy}
            isNew
          />
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-bark-200 text-xs uppercase tracking-wide text-bark-500">
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 font-medium">Unit</th>
                <th className="py-2 pr-3 text-right font-medium">Cost</th>
                <th className="py-2 pr-3 text-right font-medium">Burden</th>
                <th className="py-2 pr-3 text-right font-medium">Waste</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {config.priceBook.costItems.map((item) =>
                editing === item.id ? (
                  <tr key={item.id}>
                    <td colSpan={8} className="py-3">
                      <Form
                        draft={draft}
                        setDraft={setDraft}
                        onSave={() => save(item.id)}
                        onCancel={() => setEditing(null)}
                        busy={busy}
                        isNew={false}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b border-bark-100">
                    <td className="py-2 pr-3 font-mono text-xs text-bark-500">{item.id}</td>
                    <td className="py-2 pr-3 text-bark-800">{item.name}</td>
                    <td className="py-2 pr-3 text-bark-500">{item.kind}</td>
                    <td className="py-2 pr-3 text-bark-500">{item.unit}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-bark-800">
                      {usd(item.unitCost)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-bark-500">
                      {item.burdenPct === undefined ? "—" : `${item.burdenPct}%`}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-bark-500">
                      {item.wasteFactorPct === undefined ? "—" : `${item.wasteFactorPct}%`}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(toDraft(item));
                          setEditing(item.id);
                          setAdding(false);
                        }}
                        disabled={busy}
                        className="text-xs text-bark-600 underline hover:text-bark-900"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          send(`/api/pricebook/cost-items/${encodeURIComponent(item.id)}`, "DELETE")
                        }
                        disabled={busy}
                        className="ml-3 text-xs text-clay-700 underline hover:text-clay-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
