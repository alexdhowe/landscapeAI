/**
 * A plant, drawn from the object graph.
 *
 * Section 1: the image is a view, never the artifact. So a swapped plant
 * is not a photograph of that plant pasted onto the yard — it is an SVG
 * shape generated from the catalog entry the customer chose, exactly the
 * way a swapped surface is a generated texture rather than a picture of
 * gravel. Same rule, same reason: what is on screen has to be derivable
 * from the graph, or the graph is not the source of truth.
 *
 * Five habits, because that is what the catalog distinguishes and what
 * reads differently at a glance on a phone: a rounded deciduous shrub, a
 * denser evergreen, an upright clumping grass, a flowering perennial
 * mound, and a tree with a trunk.
 *
 * The colours are literals rather than tokens, and this is the second
 * place in the app where that is true — the first being the region tints
 * in regionColors.ts, for the same reason. These sit *on a photograph* of
 * a garden, where the job is to read as foliage against real grass and
 * mulch rather than to match the interface around them.
 */
import type { PlantGlyphKind } from "@/lib/catalog/plants";

type Palette = { deep: string; mid: string; light: string; accent: string };

const PALETTES: Record<PlantGlyphKind, Palette> = {
  // Deciduous shrubs: fresher, yellower green than the evergreens.
  shrub: { deep: "#2f5d2a", mid: "#4a8438", light: "#6faa4b", accent: "#c8dba0" },
  // Evergreens: darker, bluer, denser.
  evergreen: { deep: "#1f4433", mid: "#2f6448", light: "#43825d", accent: "#9dc0a8" },
  // Grasses: tan-green, because that is what an ornamental grass is most of the year.
  grass: { deep: "#6a6a34", mid: "#93924a", light: "#bdb668", accent: "#ded8a5" },
  // Perennials: foliage plus bloom.
  perennial: { deep: "#3a6136", mid: "#5b8c47", light: "#7fae5e", accent: "#e8b3d0" },
  tree: { deep: "#25502c", mid: "#3a7038", light: "#569150", accent: "#6b4f2a" },
};

/**
 * One plant, centred on (0,0) in a unit box: x and y run -1..1, so the
 * caller scales it to whatever ellipse the photo's plant occupies without
 * this needing to know anything about the picture.
 */
export function PlantGlyph({ kind }: { kind: PlantGlyphKind }) {
  const p = PALETTES[kind];

  if (kind === "grass") {
    // A fan of blades from a single crown, splayed by a fixed sequence —
    // deterministic, so the same plant draws the same way every render.
    const blades = [-0.85, -0.55, -0.28, 0, 0.28, 0.55, 0.85];
    return (
      <g>
        {blades.map((lean, i) => (
          <path
            key={i}
            d={`M 0 1 Q ${lean * 0.55} 0 ${lean} ${-0.85 + Math.abs(lean) * 0.5}`}
            fill="none"
            stroke={i % 2 === 0 ? p.mid : p.light}
            strokeWidth={0.13}
            strokeLinecap="round"
          />
        ))}
        <ellipse cx={0} cy={0.85} rx={0.5} ry={0.18} fill={p.deep} opacity={0.55} />
      </g>
    );
  }

  if (kind === "tree") {
    return (
      <g>
        <rect x={-0.09} y={0.1} width={0.18} height={0.95} rx={0.06} fill={p.accent} />
        <circle cx={0} cy={-0.15} r={0.92} fill={p.mid} />
        <circle cx={-0.36} cy={0.12} r={0.5} fill={p.deep} opacity={0.75} />
        <circle cx={0.34} cy={-0.02} r={0.46} fill={p.light} opacity={0.8} />
      </g>
    );
  }

  if (kind === "perennial") {
    const blooms = [
      [-0.45, -0.3],
      [0.12, -0.55],
      [0.5, -0.18],
      [-0.12, -0.08],
    ];
    return (
      <g>
        <ellipse cx={0} cy={0.18} rx={0.95} ry={0.8} fill={p.mid} />
        <ellipse cx={-0.3} cy={0.4} rx={0.5} ry={0.42} fill={p.deep} opacity={0.6} />
        {blooms.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.16} fill={p.accent} />
        ))}
      </g>
    );
  }

  // Shrub and evergreen: one mound, the evergreen tighter and scalloped.
  const scallops = kind === "evergreen" ? 9 : 6;
  return (
    <g>
      <ellipse cx={0} cy={0.05} rx={0.95} ry={0.9} fill={p.mid} />
      <ellipse cx={-0.28} cy={0.3} rx={0.6} ry={0.55} fill={p.deep} opacity={0.7} />
      <ellipse cx={0.3} cy={-0.2} rx={0.45} ry={0.42} fill={p.light} opacity={0.75} />
      {Array.from({ length: scallops }, (_, i) => {
        const angle = (i / scallops) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={Math.cos(angle) * 0.78}
            cy={Math.sin(angle) * 0.72 + 0.05}
            r={kind === "evergreen" ? 0.2 : 0.26}
            fill={i % 2 === 0 ? p.deep : p.light}
            opacity={0.55}
          />
        );
      })}
    </g>
  );
}

/** The glyph as a standalone swatch, for a catalog row or a hover card. */
export function PlantSwatch({
  kind,
  className = "size-9",
}: {
  kind: PlantGlyphKind;
  className?: string;
}) {
  return (
    <svg viewBox="-1.2 -1.2 2.4 2.4" className={className} aria-hidden>
      <PlantGlyph kind={kind} />
    </svg>
  );
}
