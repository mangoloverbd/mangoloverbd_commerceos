import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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

  useEffect(() => {
    if (visitors.length < 2) return;
    const timer = window.setInterval(() => setPinIndex((index) => index + 1), PIN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [visitors.length]);

  const visitor = visitors.length ? visitors[pinIndex % visitors.length] : null;
  // The draw loop reads these, so a new pin or data refresh never restarts the drift.
  const visitorRef = useRef(visitor);
  visitorRef.current = visitor;
  const tickRef = useRef(0);
  // With reduced motion there is no loop: redraw once per pin instead.
  const staticKey = reduceMotion && visitor ? `${visitor.latitude},${visitor.longitude},${pinIndex}` : null;

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
        if (pin) {
          pinElement.style.left = `${pin.x}px`;
          pinElement.style.top = `${pin.y}px`;
        }
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
    <div aria-hidden="true" className="pointer-events-none absolute -right-[200px] -top-10 z-0 h-[780px] w-[780px] max-md:opacity-35">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_45%_45%,#fff_0%,rgba(255,255,255,0.6)_45%,rgba(250,250,248,0)_70%)]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <AnimatePresence>
        {label && (
          <motion.div
            ref={pinRef}
            key={`${visitor?.city}-${pinIndex}`}
            className="absolute z-[2] flex items-center gap-3.5"
            style={{ visibility: "hidden", translateX: "calc(-100% + 7px)", translateY: "-50%" }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
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
        )}
      </AnimatePresence>
    </div>
  );
}
