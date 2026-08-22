/**
 * The imagery seam. It holds no decision — it holds the shape one will
 * arrive in — so what these test is that the demo tiles cannot pass
 * themselves off as licensed.
 */
import { describe, expect, it } from "vitest";

import {
  ESRI_WORLD_IMAGERY,
  licensedForMeasurement,
  resolveImageryProvider,
} from "../provider";

describe("the imagery provider", () => {
  it("defaults to the demo tiles, flagged as unreviewed", () => {
    expect(resolveImageryProvider({})).toEqual(ESRI_WORLD_IMAGERY);
    expect(ESRI_WORLD_IMAGERY.derivativeMeasurements).toBe("unreviewed");
    expect(licensedForMeasurement(ESRI_WORLD_IMAGERY)).toBe(false);
  });

  it("takes a configured provider's tiles and attribution", () => {
    const provider = resolveImageryProvider({
      tileUrl: "https://tiles.example.com/{z}/{y}/{x}",
      attribution: "Imagery © Example",
      maxZoom: "21",
      derivativeMeasurements: "permitted",
    });
    expect(provider.tileUrl).toBe("https://tiles.example.com/{z}/{y}/{x}");
    expect(provider.attribution).toBe("Imagery © Example");
    expect(provider.maxZoom).toBe(21);
    expect(licensedForMeasurement(provider)).toBe(true);
  });

  it("will not assume a licence nobody declared", () => {
    const provider = resolveImageryProvider({
      tileUrl: "https://tiles.example.com/{z}/{y}/{x}",
    });
    expect(provider.derivativeMeasurements).toBe("unreviewed");
    expect(licensedForMeasurement(provider)).toBe(false);
  });

  it("treats an unrecognised licence value as unreviewed, not as a yes", () => {
    const provider = resolveImageryProvider({
      tileUrl: "https://tiles.example.com/{z}/{y}/{x}",
      derivativeMeasurements: "probably fine",
    });
    expect(provider.derivativeMeasurements).toBe("unreviewed");
  });

  it("falls back to the demo tiles when the URL is blank", () => {
    expect(resolveImageryProvider({ tileUrl: "   " }).id).toBe(
      ESRI_WORLD_IMAGERY.id,
    );
  });
});
