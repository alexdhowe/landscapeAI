/**
 * Rendering has two modes, gated by confidence (architectural invariant).
 *
 * At the play stage the price is a typology band, so generative rendering
 * is acceptable — no quantity claim is being made. The moment a designed
 * region carries a measured quantity, the displayed numbers are
 * quantity-derived and rendering must be deterministic: generated only
 * from the design object graph (procedural textures, scaled catalog
 * assets), never from a model that could disagree with the number next to
 * it.
 *
 * Pure — takes the project state, returns the mode. Every rendering
 * surface consults this instead of deciding for itself.
 */
import type { DesignProject } from "./types";

export type RenderMode = "generative_ok" | "deterministic";

export function renderModeForProject(
  project: Pick<DesignProject, "aerialRegions">,
): RenderMode {
  return (project.aerialRegions?.length ?? 0) > 0 ? "deterministic" : "generative_ok";
}
