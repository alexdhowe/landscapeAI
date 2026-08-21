import { describe, expect, it } from "vitest";

import type { Quantity } from "@/lib/pricing/types";

import { renderModeForProject } from "../render";

const qty = (value: number, unit: "SF" | "LF"): Quantity => ({
  value,
  unit,
  source: "user_drawn",
  confidence: 0.85,
  capturedAt: "2026-08-21T00:00:00Z",
});

describe("renderModeForProject", () => {
  it("allows generative rendering while nothing is measured", () => {
    expect(renderModeForProject({})).toBe("generative_ok");
    expect(renderModeForProject({ aerialRegions: [] })).toBe("generative_ok");
  });

  it("switches to deterministic once any quantity has been measured", () => {
    expect(
      renderModeForProject({
        aerialRegions: [
          {
            id: "a1",
            photoRegionId: "bed_1",
            ring: [
              [-89.4, 43.07],
              [-89.399, 43.07],
              [-89.399, 43.071],
            ],
            areaSf: qty(310, "SF"),
            perimeterLf: qty(75, "LF"),
          },
        ],
      }),
    ).toBe("deterministic");
  });
});
