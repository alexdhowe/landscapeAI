/**
 * The one line a segmentation writes about what it cost.
 *
 * It exists because two questions have stayed open across several
 * sessions purely for want of a number: how much of section 2's thirty
 * seconds the model call takes, and whether the refinement pass earns the
 * second call it costs. Neither needed an experiment, only instrumentation
 * — so what is asserted here is that the line carries enough to answer
 * them, and that nothing about it can throw on a path where a real
 * segmentation is otherwise fine.
 */
import { describe, expect, it } from "vitest";

import { formatVisionTiming, reportVisionTiming, visionTotalMs } from "../timing";
import type { RefinementTiming, VisionTiming } from "../timing";

const TALLY = {
  outlinesOffered: 4,
  outlinesAccepted: 3,
  plantsOffered: 7,
  plantsAccepted: 6,
  plantsCarried: 0,
};

function timing(refinement: RefinementTiming, over: Partial<VisionTiming> = {}): VisionTiming {
  return { firstPassMs: 5200, regions: 4, refinement, ...over };
}

describe("visionTotalMs", () => {
  it("adds the second look to the first pass", () => {
    expect(
      visionTotalMs(timing({ status: "merged", ms: 3200, annotateMs: 200, tally: TALLY })),
    ).toBe(8400);
  });

  it("counts a second look that failed, because the customer waited for it", () => {
    expect(visionTotalMs(timing({ status: "skipped", ms: 1800, reason: "overloaded" }))).toBe(7000);
  });

  it("is the first pass alone when there was no second look", () => {
    expect(visionTotalMs(timing({ status: "off" }))).toBe(5200);
    expect(visionTotalMs(timing({ status: "no-regions" }, { regions: 0 }))).toBe(5200);
  });
});

describe("formatVisionTiming", () => {
  it("leads with the total, which is the number with a budget against it", () => {
    const line = formatVisionTiming(
      timing({ status: "merged", ms: 3200, annotateMs: 200, tally: TALLY }),
    );
    expect(line).toBe(
      "[vision] segmentation 8.4s — first pass 5.2s, 4 regions; " +
        "annotate 0.2s, second look 3.0s, outlines 3/4 kept, plants 6/7 kept",
    );
  });

  it("reports how much of the second look survived the merge bounds", () => {
    // The deciding number for "does the refinement earn its latency": a
    // pass whose corrections are mostly refused is a merge to loosen, not
    // a call to make faster, and elapsed time cannot tell those apart.
    const line = formatVisionTiming(
      timing({
        status: "merged",
        ms: 3200,
        annotateMs: 200,
        tally: {
          outlinesOffered: 4,
          outlinesAccepted: 0,
          plantsOffered: 7,
          plantsAccepted: 1,
          plantsCarried: 6,
        },
      }),
    );
    expect(line).toContain("outlines 0/4 kept");
    expect(line).toContain("plants 1/7 kept");
  });

  it("says so when the second look is switched off", () => {
    expect(formatVisionTiming(timing({ status: "off" }))).toBe(
      "[vision] segmentation 5.2s — first pass 5.2s, 4 regions; second look off (VISION_REFINE=off)",
    );
  });

  it("says so when there was nothing to correct", () => {
    expect(formatVisionTiming(timing({ status: "no-regions" }, { regions: 0 }))).toBe(
      "[vision] segmentation 5.2s — first pass 5.2s, 0 regions; second look not attempted",
    );
  });

  it("names one region as one region", () => {
    expect(formatVisionTiming(timing({ status: "off" }, { regions: 1 }))).toContain("1 region;");
  });

  it("carries the reason a second look was skipped", () => {
    expect(
      formatVisionTiming(timing({ status: "skipped", ms: 1800, reason: "529 overloaded_error" })),
    ).toBe(
      "[vision] segmentation 7.0s — first pass 5.2s, 4 regions; " +
        "second look skipped after 1.8s (529 overloaded_error)",
    );
  });

  it("keeps an API error to one line of log", () => {
    // The reason is arbitrary text from somewhere else and can be a
    // paragraph; a log line is not the place to print all of it.
    const sprawling = `first line of the error\nstack frame\nanother frame`;
    const line = formatVisionTiming(timing({ status: "skipped", ms: 100, reason: sprawling }));
    expect(line).not.toContain("\n");
    expect(line).toContain("first line of the error");

    const long = formatVisionTiming(
      timing({ status: "skipped", ms: 100, reason: "x".repeat(400) }),
    );
    expect(long.length).toBeLessThan(220);
    expect(long).toContain("…");
  });

  it("says so when the second look came back with nothing usable", () => {
    expect(formatVisionTiming(timing({ status: "no-shapes", ms: 2500 }))).toContain(
      "second look 2.5s, nothing usable came back",
    );
  });
});

describe("reportVisionTiming", () => {
  function captured(refinement: RefinementTiming) {
    const lines: { level: string; text: string }[] = [];
    const info = console.info;
    const warn = console.warn;
    console.info = (text: string) => void lines.push({ level: "info", text });
    console.warn = (text: string) => void lines.push({ level: "warn", text });
    try {
      reportVisionTiming(timing(refinement));
    } finally {
      console.info = info;
      console.warn = warn;
    }
    return lines;
  }

  it("writes exactly one line, so a run is one row of data", () => {
    for (const refinement of [
      { status: "off" } as const,
      { status: "no-regions" } as const,
      { status: "no-shapes", ms: 10 } as const,
      { status: "skipped", ms: 10, reason: "boom" } as const,
      { status: "merged", ms: 10, annotateMs: 1, tally: TALLY } as const,
    ]) {
      expect(captured(refinement)).toHaveLength(1);
    }
  });

  it("warns when the second look failed and informs when it did not", () => {
    expect(captured({ status: "skipped", ms: 10, reason: "boom" })[0].level).toBe("warn");
    expect(captured({ status: "merged", ms: 10, annotateMs: 1, tally: TALLY })[0].level).toBe(
      "info",
    );
  });
});
