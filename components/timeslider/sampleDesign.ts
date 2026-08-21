/**
 * Phase 3.5 demo scene — a fixed sample design until the Phase 2/3
 * configurator exists to supply a real one.
 *
 * Everything here is in plan-view feet. The static geometry (house,
 * walkway, bed outline) is rendered identically at every slider year —
 * only the plants read the growth curve.
 */
import type { PlantPlacement } from "../../lib/growth";

/** Scene extents, feet. */
export const SCENE = { widthFt: 60, heightFt: 40 };

/** Static geometry — never touched by the slider. */
export const HOUSE = { x: 12, y: 0, w: 36, h: 12 };
export const WALKWAY = { x: 28, y: 12, w: 4, h: 28 };
/** Foundation bed hugging the house, drawn as an SVG path (feet). */
export const BED_PATH =
  "M 6 12 L 54 12 Q 56 12 56 14 L 56 18 Q 56 21 52 21 L 36 21 Q 34 21 34 19.5 L 34 14.5 L 26 14.5 L 26 19.5 Q 26 21 24 21 L 8 21 Q 4 21 4 18 L 4 14 Q 4 12 6 12 Z";

/** Display styling per SKU in the demo palette. */
export const skuStyles: Record<string, { fill: string; stroke: string }> = {
  plant_spirea_goldflame: { fill: "#d4c34a", stroke: "#a89a2e" },
  plant_hydrangea_annabelle: { fill: "#9fbf6e", stroke: "#6f9440" },
  plant_boxwood_green_velvet: { fill: "#3e7a44", stroke: "#2c5931" },
  plant_karl_foerster: { fill: "#c8b98a", stroke: "#9a8b5c" },
  plant_serviceberry_ab: { fill: "#7fae6a", stroke: "#557a43" },
};

/**
 * The placed plants. The five spireas sit at 18 in centers on purpose —
 * they are the acceptance case that must trip the crowding warning.
 */
export const placements: PlantPlacement[] = [
  // hydrangea group, west bed — 5.5 ft centers, comfortable
  { id: "hyd_1", skuId: "plant_hydrangea_annabelle", xFt: 9, yFt: 16.5 },
  { id: "hyd_2", skuId: "plant_hydrangea_annabelle", xFt: 14.5, yFt: 16.5 },
  { id: "hyd_3", skuId: "plant_hydrangea_annabelle", xFt: 20, yFt: 16.5 },
  // feather reed grass by the walk — 2 ft centers, fine for a 2 ft spread
  { id: "krf_1", skuId: "plant_karl_foerster", xFt: 24, yFt: 18.5 },
  { id: "krf_2", skuId: "plant_karl_foerster", xFt: 34.5, yFt: 18.5 },
  { id: "krf_3", skuId: "plant_karl_foerster", xFt: 36.5, yFt: 18.5 },
  // spirea hedge, east bed — 18 in centers on a 4 ft spread: CROWDED
  { id: "spi_1", skuId: "plant_spirea_goldflame", xFt: 40, yFt: 16.5 },
  { id: "spi_2", skuId: "plant_spirea_goldflame", xFt: 41.5, yFt: 16.5 },
  { id: "spi_3", skuId: "plant_spirea_goldflame", xFt: 43, yFt: 16.5 },
  { id: "spi_4", skuId: "plant_spirea_goldflame", xFt: 44.5, yFt: 16.5 },
  { id: "spi_5", skuId: "plant_spirea_goldflame", xFt: 46, yFt: 16.5 },
  // boxwood corner accents — 3.5 ft centers on a 3 ft spread
  { id: "box_1", skuId: "plant_boxwood_green_velvet", xFt: 50.5, yFt: 17 },
  { id: "box_2", skuId: "plant_boxwood_green_velvet", xFt: 54, yFt: 17 },
  // the one tree, out in the lawn
  { id: "tree_1", skuId: "plant_serviceberry_ab", xFt: 11, yFt: 30 },
];
