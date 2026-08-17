"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import createGlobe from "cobe";
import { Pause, Play } from "@phosphor-icons/react";

interface AnalyticsMarker {
  id: string;
  location: [number, number];
  visitors: number;
  trend: number;
}

interface GlobeAnalyticsProps {
  markers?: AnalyticsMarker[];
  className?: string;
  speed?: number;
}

// Decorative markers — the live-visitor API provides no geography, so
// locations are illustrative. The real total is shown in the caption
// rendered by the consumer (Dashboard).
const defaultMarkers: AnalyticsMarker[] = [
  { id: "vis-1", location: [40.71, -74.01], visitors: 847, trend: 12 },
  { id: "vis-2", location: [51.51, -0.13], visitors: 623, trend: -3 },
  { id: "vis-3", location: [35.68, 139.65], visitors: 412, trend: 8 },
  { id: "vis-4", location: [48.86, 2.35], visitors: 385, trend: 5 },
  { id: "vis-5", location: [-33.87, 151.21], visitors: 201, trend: 15 },
  { id: "vis-6", location: [52.52, 13.41], visitors: 178, trend: -1 },
];

// The "active visitor" the Shopify-style callout points at. Illustrative,
// like the markers above — the live-visitor API returns no geography.
const ACTIVE_LOCATION: [number, number] = [23.81, 90.41]; // Dhaka
const PHI0 = 0.57; // start with the active location on the visible (left) limb

// cobe's own lat/lon → unit-vector mapping (from its dist source), so the
// HTML callout tracks the rotating marker exactly.
function latLonToVec([lat, lon]: [number, number]): [number, number, number] {
  const r = (lat * Math.PI) / 180;
  const a = (lon * Math.PI) / 180 - Math.PI;
  const o = Math.cos(r);
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)];
}

// cobe's projection for a square canvas, scale 1, no offset (from its dist
// source). Input pre-scaled to the globe radius (0.8).
function project(v: [number, number, number], phi: number, theta: number) {
  const [x, y, z] = v;
  const cp = Math.cos(phi), sp = Math.sin(phi), ct = Math.cos(theta), st = Math.sin(theta);
  const c = cp * x + sp * z;
  const s = sp * st * x + ct * y - cp * st * z;
  const depth = -sp * ct * x + st * y + cp * ct * z;
  return { x: (c + 1) / 2, y: (1 - s) / 2, depth };
}

const ACTIVE_VEC = latLonToVec(ACTIVE_LOCATION).map((n) => n * 0.8) as [number, number, number];

// Dot-matrix patch for the active visitor (mirrors the reference design).
const CLUSTER_DOTS: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let y = 2; y <= 54; y += 4.6) {
    for (let x = 2; x <= 54; x += 4.6) {
      if (Math.hypot(x - 28, y - 28) <= 26) pts.push([x, y]);
    }
  }
  return pts;
})();

function dhakaTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  }).format(new Date());
}

export function GlobeAnalytics({
  markers: initialMarkers = defaultMarkers,
  className = "",
  speed = 0.0015,
}: GlobeAnalyticsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiOffsetRef = useRef(0);
  const thetaOffsetRef = useRef(0);
  const isPausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [time, setTime] = useState(dhakaTime);

  useEffect(() => {
    const id = window.setInterval(() => setTime(dhakaTime()), 10000);
    return () => window.clearInterval(id);
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((p) => {
      isPausedRef.current = !p;
      return !p;
    });
  }, []);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY };
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    isPausedRef.current = true;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi;
      thetaOffsetRef.current += dragOffset.current.theta;
      dragOffset.current = { phi: 0, theta: 0 };
    }
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    if (!paused) isPausedRef.current = false;
  }, [paused]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        };
      }
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerUp]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let globe: ReturnType<typeof createGlobe> | null = null;
    let animationId: number;
    let phi = PHI0;

    function init() {
      const width = canvas.offsetWidth;
      if (width === 0 || globe) return;

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width,
        height: width,
        phi: PHI0,
        theta: 0.2,
        dark: 0,
        diffuse: 1.5,
        mapSamples: 16000,
        mapBrightness: 10,
        baseColor: [1, 1, 1],
        markerColor: [0.3, 0.85, 0.45],
        glowColor: [0.78, 0.77, 0.75],
        markerElevation: 0,
        markers: initialMarkers.map((m) => ({ location: m.location, size: 0.04, id: m.id })),
        arcs: [],
        arcColor: [0.25, 0.9, 0.5],
        arcWidth: 0.5,
        arcHeight: 0.25,
        opacity: 0.7,
      });

      function animate() {
        if (!isPausedRef.current) phi += speed;
        const theta = 0.2 + thetaOffsetRef.current + dragOffset.current.theta;
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta,
        });
        // Track the HTML callout over the active location.
        if (calloutRef.current) {
          const p = project(
            ACTIVE_VEC,
            phi + phiOffsetRef.current + dragOffset.current.phi,
            theta,
          );
          calloutRef.current.style.left = `${p.x * 100}%`;
          calloutRef.current.style.top = `${p.y * 100}%`;
          calloutRef.current.style.opacity = String(
            Math.max(0, Math.min(1, p.depth / 0.18)),
          );
        }
        animationId = requestAnimationFrame(animate);
      }
      animate();
      setTimeout(() => {
        canvas.style.opacity = "0.35";
      });
    }

    if (canvas.offsetWidth > 0) {
      init();
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro.disconnect();
          init();
        }
      });
      ro.observe(canvas);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (globe) globe.destroy();
    };
  }, [initialMarkers, speed]);

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 1.2s ease",
          borderRadius: "50%",
          touchAction: "none",
        }}
      />

      {/* Shopify-style active-visitor callout, projection-tracked */}
      <div ref={calloutRef} className="pointer-events-none absolute z-10" style={{ opacity: 0 }}>
        <div
          className="absolute rounded-full"
          style={{
            left: -38,
            top: -38,
            width: 76,
            height: 76,
            border: "1px solid rgba(22, 163, 74, 0.28)",
          }}
        />
        <svg className="absolute" style={{ left: -28, top: -28 }} width="56" height="56">
          {CLUSTER_DOTS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.7} fill="#16a34a" opacity={0.8} />
          ))}
          <circle cx={28} cy={28} r={5} fill="#15803d" />
        </svg>
        <div
          className="absolute whitespace-nowrap rounded-xl bg-white"
          style={{
            right: 50,
            top: 0,
            transform: "translateY(-50%)",
            padding: "10px 16px",
            boxShadow: "0 6px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)",
          }}
        >
          <p className="m-0 text-[14px] font-semibold text-[#171717]">Dhaka, BD</p>
          <p className="m-0 mt-0.5 text-[12px] text-[#737373]">Page view · {time}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={togglePaused}
        title={paused ? "Resume rotation" : "Pause rotation"}
        className="pointer-events-auto absolute bottom-1 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-md text-black/35 transition-colors hover:bg-black/5 hover:text-black/70"
      >
        {paused ? <Play weight="light" size={14} /> : <Pause weight="light" size={14} />}
      </button>
    </div>
  );
}
