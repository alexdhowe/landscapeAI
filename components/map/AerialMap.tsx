"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";

import type { AerialRegion } from "@/lib/design/types";
import type { LngLat } from "@/lib/measure/area";
import type { RegionKind } from "@/lib/vision/types";

/**
 * Satellite raster for the MVP. Esri World Imagery is keyless for dev/demo;
 * production must move to a provider whose license covers deriving and
 * selling measurements (Nearmap/Vexcel — see project-map.md §3, "Decisions
 * to make before Phase 2"). Swap via env without touching code.
 */
const TILE_URL =
  process.env.NEXT_PUBLIC_SATELLITE_TILE_URL ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ??
  "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community";

const KIND_COLORS: Record<RegionKind, string> = {
  turf: "#4ade80",
  bed: "#f59e0b",
  hardscape: "#94a3b8",
  foundation_planting: "#34d399",
};

export type EditSession = {
  /** Bump to start a fresh session even for the same region. */
  key: number;
  /** Preload an editable suggestion/previous ring; null = draw from scratch. */
  seedRing: LngLat[] | null;
};

type CommittedRegion = AerialRegion & { kind: RegionKind; label: string };

function closeRing(ring: LngLat[]): LngLat[] {
  return [...ring, ring[0]];
}

export function AerialMap({
  center,
  committed,
  hiddenPhotoRegionId,
  editSession,
  onRingChanged,
}: {
  center: { lat: number; lng: number };
  /** Saved aerial regions, rendered as a read-only overlay. */
  committed: CommittedRegion[];
  /** Committed region hidden while it is being re-drawn. */
  hiddenPhotoRegionId: string | null;
  /** Non-null while the customer is drawing/adjusting one ring. */
  editSession: EditSession | null;
  /** The in-progress ring after each draw/adjust step; null when cleared. */
  onRingChanged: (ring: LngLat[] | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const onRingChangedRef = useRef(onRingChanged);
  onRingChangedRef.current = onRingChanged;
  const sessionRef = useRef<EditSession | null>(editSession);

  // Map + Terra Draw are created once; everything else is prop-driven.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [TILE_URL],
            tileSize: 256,
            maxzoom: 19,
            attribution: TILE_ATTRIBUTION,
          },
        },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      center: [center.lng, center.lat],
      zoom: 18.5,
      maxZoom: 21,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    new maplibregl.Marker({ color: "#0ea5e9" })
      .setLngLat([center.lng, center.lat])
      .addTo(map);
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("committed", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "committed-fill",
        type: "fill",
        source: "committed",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "committed-line",
        type: "line",
        source: "committed",
        paint: { "line-color": ["get", "color"], "line-width": 2 },
      });

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode(),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
          }),
        ],
      });
      draw.start();
      draw.on("finish", (id, context) => {
        const feature = draw.getSnapshotFeature(id);
        if (!feature || feature.geometry.type !== "Polygon") return;
        const coords = feature.geometry.coordinates[0] as LngLat[];
        onRingChangedRef.current(coords.slice(0, -1));
        // A freshly closed polygon becomes adjustable right away.
        if (context.action === "draw") draw.setMode("select");
      });
      drawRef.current = draw;
      applySession(draw, sessionRef.current);
    });

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is created for the initial center; later center changes fly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom: 18.5 });
  }, [center.lat, center.lng]);

  // Committed overlay follows props.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource("committed") as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: committed
          .filter((r) => r.photoRegionId !== hiddenPhotoRegionId)
          .map((r) => ({
            type: "Feature" as const,
            properties: { color: KIND_COLORS[r.kind], label: r.label },
            geometry: { type: "Polygon" as const, coordinates: [closeRing(r.ring)] },
          })),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [committed, hiddenPhotoRegionId]);

  // Edit sessions: load the seed (or arm polygon mode) when one starts,
  // clear the scratch layer when it ends.
  useEffect(() => {
    sessionRef.current = editSession;
    const draw = drawRef.current;
    if (draw) applySession(draw, editSession);
  }, [editSession]);

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full overflow-hidden rounded-xl border border-neutral-200 sm:h-[520px]"
    />
  );
}

function applySession(draw: TerraDraw, session: EditSession | null) {
  draw.clear();
  if (!session) {
    draw.setMode("select");
    return;
  }
  if (session.seedRing && session.seedRing.length >= 3) {
    draw.addFeatures([
      {
        type: "Feature",
        properties: { mode: "polygon" },
        geometry: {
          type: "Polygon",
          coordinates: [closeRing(session.seedRing)],
        },
      },
    ]);
    draw.setMode("select");
  } else {
    draw.setMode("polygon");
  }
}
