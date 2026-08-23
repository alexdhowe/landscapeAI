"use client";

import { useState } from "react";

import type { DisclosurePolicy } from "@/lib/pricing/types";
import type { PricingConfig } from "@/lib/pricebook/types";

import type { Send } from "./PriceBookEditor";
import { Field, Section, button, input } from "./shared";

const MODES: DisclosurePolicy["mode"][] = ["band", "tiers", "figure"];

/**
 * The numbers that apply to every job rather than to one line.
 *
 * `showUnitRates` is not on this form and never will be. It is typed
 * `false`, forced `false` by the server, and rejected by the publish
 * validator — showing a customer your unit rates is not a setting.
 */
export function Settings({
  config,
  busy,
  send,
}: {
  config: PricingConfig;
  busy: boolean;
  send: Send;
}) {
  const [margin, setMargin] = useState({
    targetGmPct: String(config.margin.targetGmPct),
    minGmPct: String(config.margin.minGmPct),
    contingencyPct: String(config.margin.contingencyPct),
  });
  const [band, setBand] = useState({
    mode: config.bandPolicy.mode,
    bandWidthPct: String(config.bandPolicy.bandWidthPct),
    roundTo: String(config.bandPolicy.roundTo),
  });
  const [quote, setQuote] = useState({
    mode: config.finalQuotePolicy.mode,
    bandWidthPct: String(config.finalQuotePolicy.bandWidthPct),
    roundTo: String(config.finalQuotePolicy.roundTo),
  });

  const save = (payload: Record<string, unknown>) =>
    send("/api/pricebook/settings", "PATCH", payload);

  return (
    <div className="space-y-5">
      <Section
        title="Margin and contingency"
        subtitle="Applied to every estimate. The floor clamps margin upward when a job would otherwise price below it."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Target gross margin %">
            <input
              type="number"
              step="0.1"
              value={margin.targetGmPct}
              onChange={(e) => setMargin({ ...margin, targetGmPct: e.target.value })}
              disabled={busy}
              className={input}
            />
          </Field>
          <Field label="Floor gross margin %">
            <input
              type="number"
              step="0.1"
              value={margin.minGmPct}
              onChange={(e) => setMargin({ ...margin, minGmPct: e.target.value })}
              disabled={busy}
              className={input}
            />
          </Field>
          <Field label="Contingency %">
            <input
              type="number"
              step="0.1"
              value={margin.contingencyPct}
              onChange={(e) => setMargin({ ...margin, contingencyPct: e.target.value })}
              disabled={busy}
              className={input}
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={() =>
            save({
              margin: {
                targetGmPct: Number(margin.targetGmPct),
                minGmPct: Number(margin.minGmPct),
                contingencyPct: Number(margin.contingencyPct),
              },
            })
          }
          disabled={busy}
          className={`${button} mt-4 bg-bark-900 text-white hover:bg-bark-700`}
        >
          Save to draft
        </button>
      </Section>

      {(
        [
          [
            "Opening band",
            "What a customer browsing sees, before a rep has measured anything.",
            band,
            setBand,
            "bandPolicy",
          ],
          [
            "Final quote",
            "What a rep issues after confirming quantities on site. A figure, not a range — the site visit is what removed the uncertainty.",
            quote,
            setQuote,
            "finalQuotePolicy",
          ],
        ] as const
      ).map(([title, subtitle, state, setState, key]) => (
        <Section key={key} title={`${title} disclosure`} subtitle={subtitle}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Mode">
              <select
                value={state.mode}
                onChange={(e) =>
                  setState({ ...state, mode: e.target.value as DisclosurePolicy["mode"] })
                }
                disabled={busy}
                className={input}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Band half-width %">
              <input
                type="number"
                step="0.1"
                value={state.bandWidthPct}
                onChange={(e) => setState({ ...state, bandWidthPct: e.target.value })}
                disabled={busy}
                className={input}
              />
            </Field>
            <Field label="Round displayed prices to">
              <input
                type="number"
                step="1"
                value={state.roundTo}
                onChange={(e) => setState({ ...state, roundTo: e.target.value })}
                disabled={busy}
                className={input}
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() =>
              save({
                [key]: {
                  mode: state.mode,
                  bandWidthPct: Number(state.bandWidthPct),
                  roundTo: Number(state.roundTo),
                },
              })
            }
            disabled={busy}
            className={`${button} mt-4 bg-bark-900 text-white hover:bg-bark-700`}
          >
            Save to draft
          </button>
        </Section>
      ))}
    </div>
  );
}
