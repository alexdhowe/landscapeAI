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
        condition: "healthy with some thin patches",
        estimatedAreaSf: 1100,
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
        // The plants that stay put when the surface is swapped. Here so
        // the no-key demo exercises the same path a real segmentation
        // does — without them, "swap mulch for stone" looks correct in
        // development and paints over every shrub in production.
        plantings: [
          { id: "demo_bed_plant_1", cx: 0.11, cy: 0.645, rx: 0.035, ry: 0.033, label: "ornamental grass" },
          { id: "demo_bed_plant_2", cx: 0.23, cy: 0.635, rx: 0.038, ry: 0.036, label: "ornamental grass" },
          { id: "demo_bed_plant_3", cx: 0.36, cy: 0.63, rx: 0.032, ry: 0.03, label: "daylily clump" },
        ],
        existingMaterial: "hardwood mulch",
        condition: "faded, weeds coming through",
        estimatedAreaSf: 300,
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
        plantings: [
          { id: "demo_foundation_plant_1", cx: 0.57, cy: 0.585, rx: 0.04, ry: 0.045, label: "boxwood" },
          { id: "demo_foundation_plant_2", cx: 0.67, cy: 0.58, rx: 0.042, ry: 0.048, label: "boxwood" },
          { id: "demo_foundation_plant_3", cx: 0.78, cy: 0.575, rx: 0.045, ry: 0.05, label: "yew" },
          { id: "demo_foundation_plant_4", cx: 0.89, cy: 0.57, rx: 0.04, ry: 0.045, label: "yew" },
        ],
        existingMaterial: "overgrown shrubs in mulch",
        condition: "overgrown, crowding the siding",
        estimatedAreaSf: 250,
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
        condition: "sound, minor surface cracking",
        estimatedAreaSf: 180,
        confidence: 0.9,
      },
    ],
    verticalElements: [
      {
        kind: "steps",
        description: "two concrete steps at the front door",
        confidence: 0.85,
      },
      {
        kind: "grade_change",
        description: "lawn slopes gently down toward the street",
        confidence: 0.6,
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
