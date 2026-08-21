"use client";

import { useState } from "react";

import type { Assembly, AssemblyComponent, QuantityUnit } from "@/lib/pricing/types";
import type { PricingConfig } from "@/lib/pricebook/types";

import type { Send } from "./PriceBookEditor";
import { Field, Section, button, input, usd } from "./shared";

const UNITS: QuantityUnit[] = ["SF", "LF", "EA", "CY"];

type ComponentDraft = {
  costItemId: string;
  /** Exactly one of these is set — the other stays empty. */
  qtyPerUnit: string;
  productionRate: string;
};

type Draft = { id: string; name: string; unit: QuantityUnit; components: ComponentDraft[] };

const toDraft = (assembly: Assembly): Draft => ({
  id: assembly.id,
  name: assembly.name,
  unit: assembly.unit,
  components: assembly.components.map((c) => ({
    costItemId: c.costItemId,
    qtyPerUnit: c.qtyPerUnit === undefined ? "" : String(c.qtyPerUnit),
    productionRate: c.productionRate === undefined ? "" : String(c.productionRate),
  })),
});

const EMPTY: Draft = { id: "", name: "", unit: "SF", components: [] };

const body = (draft: Draft) => ({
  name: draft.name,
  unit: draft.unit,
  components: draft.components.map((c) => ({
    costItemId: c.costItemId,
    qtyPerUnit: c.qtyPerUnit === "" ? undefined : Number(c.qtyPerUnit),
    productionRate: c.productionRate === "" ? undefined : Number(c.productionRate),
  })),
});

/** What one component costs at a quantity of one assembly unit — a sanity read. */
function componentCost(config: PricingConfig, component: AssemblyComponent): number | null {
  const item = config.priceBook.costItems.find((c) => c.id === component.costItemId);
  if (!item) return null;
  if (component.qtyPerUnit !== undefined) return item.unitCost * component.qtyPerUnit;
  if (component.productionRate) return item.unitCost / component.productionRate;
  return null;
}

function Editor({
  config,
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
  isNew,
}: {
  config: PricingConfig;
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  isNew: boolean;
}) {
  const setComponent = (i: number, patch: Partial<ComponentDraft>) =>
    setDraft({
      ...draft,
      components: draft.components.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });

  return (
    <div className="space-y-4 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {isNew && (
          <Field label="Assembly id">
            <input
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              placeholder="stone_bed_conversion"
              disabled={busy}
              className={input}
            />
          </Field>
        )}
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            disabled={busy}
            className={input}
          />
        </Field>
        <Field label="Priced per">
          <select
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value as QuantityUnit })}
            disabled={busy}
            className={input}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Components
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Set a quantity per unit for materials, or a production rate (units per
          crew-hour) for labour and equipment — one or the other, never both.
        </p>
        <div className="mt-3 space-y-2">
          {draft.components.map((component, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Field label="Cost item">
                <select
                  value={component.costItemId}
                  onChange={(e) => setComponent(i, { costItemId: e.target.value })}
                  disabled={busy}
                  className={input}
                >
                  <option value="">Choose a SKU…</option>
                  {config.priceBook.costItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Qty per unit">
                <input
                  type="number"
                  step="any"
                  value={component.qtyPerUnit}
                  onChange={(e) =>
                    setComponent(i, { qtyPerUnit: e.target.value, productionRate: "" })
                  }
                  disabled={busy}
                  className={input}
                />
              </Field>
              <Field label="Units / hour">
                <input
                  type="number"
                  step="any"
                  value={component.productionRate}
                  onChange={(e) =>
                    setComponent(i, { productionRate: e.target.value, qtyPerUnit: "" })
                  }
                  disabled={busy}
                  className={input}
                />
              </Field>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    components: draft.components.filter((_, j) => j !== i),
                  })
                }
                disabled={busy}
                className="mb-1 text-xs text-red-700 underline hover:text-red-900"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              components: [
                ...draft.components,
                { costItemId: "", qtyPerUnit: "", productionRate: "" },
              ],
            })
          }
          disabled={busy}
          className="mt-3 text-xs text-neutral-600 underline hover:text-neutral-900"
        >
          Add component
        </button>
      </div>

      <div className="flex gap-2 border-t border-neutral-200 pt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || draft.id.trim() === "" || draft.name.trim() === ""}
          className={`${button} bg-neutral-900 text-white hover:bg-neutral-700`}
        >
          Save to draft
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`${button} border border-neutral-300 text-neutral-700`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Assemblies({
  config,
  busy,
  send,
}: {
  config: PricingConfig;
  busy: boolean;
  send: Send;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const save = async (key: string) => {
    const ok = await send(
      `/api/pricebook/assemblies/${encodeURIComponent(key)}`,
      "PUT",
      body(draft),
    );
    if (ok) {
      setEditing(null);
      setAdding(false);
    }
  };

  return (
    <Section
      title="Assemblies"
      subtitle="A priced recipe for one unit of work. The customer picks a catalog option; the option is built from these."
      right={
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setAdding(true);
            setEditing(null);
          }}
          disabled={busy || adding}
          className={`${button} border border-neutral-300 text-neutral-700 hover:border-neutral-900`}
        >
          Add assembly
        </button>
      }
    >
      <div className="space-y-3">
        {adding && (
          <Editor
            config={config}
            draft={draft}
            setDraft={setDraft}
            onSave={() => save(draft.id.trim())}
            onCancel={() => setAdding(false)}
            busy={busy}
            isNew
          />
        )}
        {config.priceBook.assemblies.map((assembly) =>
          editing === assembly.id ? (
            <Editor
              key={assembly.id}
              config={config}
              draft={draft}
              setDraft={setDraft}
              onSave={() => save(assembly.id)}
              onCancel={() => setEditing(null)}
              busy={busy}
              isNew={false}
            />
          ) : (
            <details key={assembly.id} className="rounded-lg border border-neutral-200 p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-neutral-800">
                  {assembly.name}{" "}
                  <span className="font-mono text-xs text-neutral-400">{assembly.id}</span>
                </span>
                <span className="text-xs text-neutral-500">
                  per {assembly.unit} · {assembly.components.length} component
                  {assembly.components.length === 1 ? "" : "s"}
                </span>
              </summary>
              <table className="mt-3 w-full text-left text-sm">
                <tbody>
                  {assembly.components.map((component, i) => {
                    const item = config.priceBook.costItems.find(
                      (c) => c.id === component.costItemId,
                    );
                    const cost = componentCost(config, component);
                    return (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="py-1.5 pr-3 text-neutral-700">
                          {item?.name ?? (
                            <span className="text-red-700">
                              missing SKU {component.costItemId}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-neutral-500">
                          {component.qtyPerUnit !== undefined
                            ? `${component.qtyPerUnit} ${item?.unit ?? ""} per ${assembly.unit}`
                            : `${component.productionRate} ${assembly.unit} per hour`}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-neutral-500">
                          {cost === null ? "—" : `${usd(cost)} / ${assembly.unit}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(toDraft(assembly));
                    setEditing(assembly.id);
                    setAdding(false);
                  }}
                  disabled={busy}
                  className="text-xs text-neutral-600 underline hover:text-neutral-900"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() =>
                    send(`/api/pricebook/assemblies/${encodeURIComponent(assembly.id)}`, "DELETE")
                  }
                  disabled={busy}
                  className="text-xs text-red-700 underline hover:text-red-900"
                >
                  Delete
                </button>
              </div>
            </details>
          ),
        )}
      </div>
    </Section>
  );
}
