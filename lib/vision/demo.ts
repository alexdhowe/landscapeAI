/**
 * Deterministic fallback segmentation for local development without an
 * ANTHROPIC_API_KEY. Always labeled source: "demo" so the UI can say so —
 * a demo overlay must never pass itself off as an analysis of the photo.
 */
import type { SegmentationResult } from "./types";

export function demoSegmentation(): SegmentationResult {
  return {
    regions: [
      {
        id: "demo_lawn",
        kind: "turf",
        label: "Front lawn",
        polygon: [
          [0.02, 0.72],
          [0.98, 0.72],
          [0.98, 0.98],
          [0.02, 0.98],
        ],
        existingMaterial: "turf grass",
        confidence: 0.9,
      },
      {
        id: "demo_bed",
        kind: "bed",
        label: "Bed along front walk",
        polygon: [
          [0.05, 0.58],
          [0.45, 0.55],
          [0.47, 0.7],
          [0.04, 0.73],
        ],
        existingMaterial: "hardwood mulch",
        confidence: 0.85,
      },
      {
        id: "demo_foundation",
        kind: "foundation_planting",
        label: "Foundation planting",
        polygon: [
          [0.5, 0.52],
          [0.95, 0.5],
          [0.96, 0.64],
          [0.51, 0.66],
        ],
        existingMaterial: "overgrown shrubs in mulch",
        confidence: 0.8,
      },
      {
        id: "demo_walk",
        kind: "hardscape",
        label: "Front walkway",
        polygon: [
          [0.45, 0.66],
          [0.55, 0.66],
          [0.62, 0.98],
          [0.4, 0.98],
        ],
        existingMaterial: "concrete",
        confidence: 0.9,
      },
    ],
    cannotSee: [
      "side and back yards",
      "grade changes and drainage",
      "bed edges hidden behind plantings",
    ],
    source: "demo",
  };
}
