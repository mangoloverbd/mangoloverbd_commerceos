import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HomeLiveVisitor } from "./types";

const SIZE = 780;
const RADIUS = SIZE * 0.46;
const DEG = Math.PI / 180;
// Bangladesh sits right of centre, as in the mockup.
const HOME = { longitude: 90.4, latitude: 23.8 };
const CENTER = { longitude: HOME.longitude - 22, latitude: HOME.latitude - 8 };
const PIN_INTERVAL_MS = 4000;

/**
 * Orthographic projection onto a SIZE×SIZE canvas. Returns null for points on
 * the far side; `depth` is 1 at the centre and 0 at the rim.
 */
export function projectPoint(longitude: number, latitude: number, centerLongitude: number, centerLatitude: number) {
  const lambda = (longitude - centerLongitude) * DEG;
  const phi = latitude * DEG;
  const phi0 = centerLatitude * DEG;
  const depth = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
  if (depth <= 0) return null;
  const x = RADIUS * Math.cos(phi) * Math.sin(lambda);
  const y = RADIUS * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda));
  return { x: SIZE / 2 + x, y: SIZE / 2 - y, depth };
}

// Puts the dot's centre on the point: the label sits left of the dot, both centred vertically.
export function pinTransform(x: number, y: number) {
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(calc(-100% + 7px), -50%)`;
}

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });

function pinLabel(visitor: HomeLiveVisitor) {
  const place = [visitor.city, visitor.country].filter(Boolean).join(", ") || "Somewhere nearby";
  const when = timeFormat.format(new Date(visitor.last_seen_at));
  return { place, detail: `Page view · ${when}` };
}

export function DottedGlobe({ visitors }: { visitors: HomeLiveVisitor[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [dots, setDots] = useState<number[] | null>(null);
  const [pinIndex, setPinIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  // The dot map is code-split so it never weighs on the first paint.
  useEffect(() => {
    let active = true;
    import("@/assets/world-dots.json").then((module) => {
      if (active) setDots(module.default as number[]);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // One pin per place: visitors from the same city share it (newest wins), so the
  // pin only moves when there is somewhere else to show.
  const places = useMemo(() => {
    const byPlace = new Map<string, HomeLiveVisitor>();
    for (const visitor of visitors) {
      const key = `${visitor.latitude.toFixed(2)},${visitor.longitude.toFixed(2)}`;
      if (!byPlace.has(key)) byPlace.set(key, visitor);
    }
    return [...byPlace].map(([key, visitor]) => ({ key, visitor }));
  }, [visitors]);

  useEffect(() => {
    if (places.length < 2) return;
    const timer = window.setInterval(() => setPinIndex((index) => index + 1), PIN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [places.length]);

  const place = places.length ? places[pinIndex % places.length] : null;
  const visitor = place?.visitor ?? null;
  // The draw loop reads these, so a new pin or data refresh never restarts the drift.
  const visitorRef = useRef(visitor);
  visitorRef.current = visitor;
  const tickRef = useRef(0);
  // With reduced motion there is no loop: redraw once per pin instead.
  const staticKey = reduceMotion && place ? place.key : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !dots) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    let frame = 0;
    const draw = () => {
      const longitude = CENTER.longitude + (reduceMotion ? 0 : Math.sin(tickRef.current) * 6);
      const visitor = visitorRef.current;
      context.clearRect(0, 0, SIZE, SIZE);
      context.fillStyle = "#111110";
      for (let i = 0; i < dots.length; i += 2) {
        const point = projectPoint(dots[i] / 10, dots[i + 1] / 10, longitude, CENTER.latitude);
        if (!point) continue;
        context.globalAlpha = 0.06 + point.depth * 0.17;
        context.beginPath();
        context.arc(point.x, point.y, 1.15, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      // Moved by style, not state, so the drift never re-renders React.
      const pinElement = pinRef.current;
      if (pinElement && visitor) {
        const pin = projectPoint(visitor.longitude, visitor.latitude, longitude, CENTER.latitude);
        pinElement.style.visibility = pin ? "visible" : "hidden";
        // A transform glides by fractions of a pixel; left/top snapped to whole
        // pixels as the globe drifted, which made the pin flicker.
        if (pin) pinElement.style.transform = pinTransform(pin.x, pin.y);
      }
      if (!reduceMotion) {
        tickRef.current += 0.004;
        frame = requestAnimationFrame(draw);
      }
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [dots, reduceMotion, staticKey]);

  const label = visitor ? pinLabel(visitor) : null;

  return (
    // Cropped by the top and right of the page like Shopify's, but placed high enough
    // that the whole bottom curve sits above the cards instead of behind them.
    <div aria-hidden="true" className="pointer-events-none absolute -right-[170px] -top-[150px] z-0 h-[780px] w-[780px] max-md:opacity-35">
      {/* The sphere (same radius as the projection): a white glow that fades into the
          page at its rim, with only a soft shadow hinting at the lower edge. */}
      <div
        className="absolute rounded-full bg-[radial-gradient(closest-side,#fff_0%,rgba(255,255,255,0.9)_55%,rgba(255,255,255,0)_100%)] shadow-[0_70px_90px_-70px_rgba(17,17,16,0.07)]"
        style={{ inset: SIZE / 2 - RADIUS }}
      />
      {/* Fades in once the map has loaded, instead of popping in. */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ease-out motion-reduce:transition-none ${dots ? "opacity-100" : "opacity-0"}`}
      />
      {label && place && (
        // Positioned only by the draw loop. React never rewrites its style after
        // mount (the value never changes), so re-renders can't hide it.
        <div
          ref={pinRef}
          className="absolute left-0 top-0 z-[2] will-change-transform"
          style={{ visibility: "hidden" }}
        >
          <motion.div
            key={place.key}
            className="flex items-center gap-3.5"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="rounded-[14px] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(17,17,16,0.04),0_8px_24px_rgba(17,17,16,0.05)]">
              <strong className="block whitespace-nowrap text-[15px] font-semibold text-[#111110]">{label.place}</strong>
              <span className="whitespace-nowrap text-[13px] text-[#55534E]">{label.detail}</span>
            </div>
            <span className="relative h-3.5 w-3.5 rounded-full bg-[#F2A93B]">
              {!reduceMotion && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-[#F2A93B]"
                  animate={{ scale: [1, 2.6], opacity: [0.5, 0] }}
                  transition={{ duration: 2, ease: "easeOut", repeat: Infinity }}
                />
              )}
            </span>
          </motion.div>
        </div>
      )}
    </div>
  );
}
