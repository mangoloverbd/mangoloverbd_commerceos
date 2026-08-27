import { useCallback, useEffect, useRef } from "react";

/* -----------------------------------------------------------------------------
 * Pixel ripple (looping + mouse-reactive)
 * A grid of dots that expand in from the center — each dot waits a delay
 * proportional to its distance from the middle, then grows from nothing to full
 * size — exactly the page-load reveal, replayed on a loop: expand → hold →
 * fade out → expand again.
 * Cursor reactivity rides on top: dots near the pointer brighten, grow, and
 * scatter outward, easing back to rest as the cursor moves away.
 * Base opacity follows a diagonal gradient (faint top-left → dense bottom-right)
 * for the fading dot-field look. Honors prefers-reduced-motion (static field).
 * -------------------------------------------------------------------------- */

type Pixel = {
  x: number;
  y: number;
  color: string;
  ctx: CanvasRenderingContext2D;
  baseAlpha: number;
  maxSize: number;
  /** Reveal size, 0 → maxSize. Driven by the expand sweep. */
  size: number;
  sizeStep: number;
  /** Ripple timing — counter climbs until it clears `delay`, then the dot grows. */
  counter: number;
  counterStep: number;
  delay: number;
  isIdle: boolean;
  // cursor-driven extras, lerped so they ease
  extraSize: number;
  offsetX: number;
  offsetY: number;
  alpha: number;
  appear: () => void;
  react: (mx: number, my: number) => void;
  reset: () => void;
  draw: (fade: number) => void;
};

const INFLUENCE_RADIUS = 100; // px — how far the cursor's pull reaches
const MAX_PUSH = 7; // px — how far a dot scatters at the cursor
const EXTRA_SIZE = 3; // px — added to size at the cursor
const EASE = 0.14; // lerp factor toward the cursor target each frame

const HOLD_MS = 1500; // pause at full field before fading out
const FADE_MS = 550; // global fade-out before the next expand

// Warm iridescent gradient (fuchsia → rose → amber) sampled across the field so
// the dots shift hue by position — energetic and modern against the warm
// off-white background.
const DEFAULT_COLORS = ["#e879f9", "#fb7185", "#fbbf24"];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Sample a color from an evenly-spaced gradient of hex stops at t ∈ [0,1]. */
function colorAt(stops: [number, number, number][], t: number): string {
  if (stops.length === 1) {
    const [r, g, b] = stops[0];
    return `rgb(${r},${g},${b})`;
  }
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const [r1, g1, b1] = stops[i];
  const [r2, g2, b2] = stops[i + 1];
  const r = Math.round(lerp(r1, r2, f));
  const g = Math.round(lerp(g1, g2, f));
  const b = Math.round(lerp(b1, b2, f));
  return `rgb(${r},${g},${b})`;
}

function createPixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  baseAlpha: number,
  maxSize: number,
  delay: number,
  counterStep: number,
  peakAlpha: number,
): Pixel {
  const p: Pixel = {
    x,
    y,
    color,
    ctx,
    baseAlpha,
    maxSize,
    size: 0,
    sizeStep: Math.random() * 0.3 + 0.15,
    counter: 0,
    counterStep,
    delay,
    isIdle: false,
    extraSize: 0,
    offsetX: 0,
    offsetY: 0,
    alpha: baseAlpha,
    // The original page-load expand, verbatim: hold until the ripple front
    // arrives, then grow from nothing to full size.
    appear() {
      if (p.counter <= p.delay) {
        p.counter += p.counterStep;
        return;
      }
      if (p.size >= p.maxSize) {
        p.size = p.maxSize;
        p.isIdle = true;
      } else {
        p.size += p.sizeStep;
      }
    },
    react(mx, my) {
      const dx = p.x - mx;
      const dy = p.y - my;
      let f = 0;
      let dist = 0;
      // Cheap bounding-box reject so we skip the sqrt for the vast majority of
      // dots (and entirely when the pointer is off the field).
      if (Math.abs(dx) < INFLUENCE_RADIUS && Math.abs(dy) < INFLUENCE_RADIUS) {
        dist = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - dist / INFLUENCE_RADIUS);
        // squared for a tighter, snappier falloff near the cursor
        f = influence * influence;
      }

      // Scale the cursor effect by how far this dot has revealed, so dots the
      // expand hasn't reached yet don't get dragged into existence early.
      const revealed = p.maxSize > 0 ? p.size / p.maxSize : 0;
      const g = f * revealed;

      const dir = dist > 0.01 ? (g * MAX_PUSH) / dist : 0;
      p.extraSize = lerp(p.extraSize, EXTRA_SIZE * g, EASE);
      p.offsetX = lerp(p.offsetX, dx * dir, EASE);
      p.offsetY = lerp(p.offsetY, dy * dir, EASE);
      p.alpha = lerp(
        p.alpha,
        p.baseAlpha + (peakAlpha - p.baseAlpha) * g,
        EASE,
      );
    },
    reset() {
      p.counter = 0;
      p.size = 0;
      p.isIdle = false;
      p.extraSize = 0;
      p.offsetX = 0;
      p.offsetY = 0;
      p.alpha = p.baseAlpha;
    },
    draw(fade) {
      const r = (p.size + p.extraSize) / 2;
      if (r <= 0.05) return;
      ctx.globalAlpha = p.alpha * fade;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x + p.offsetX, p.y + p.offsetY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  };
  return p;
}

type PixelRippleProps = {
  /** Single flat color. Ignored when `colors` (a gradient) is provided. */
  color?: string;
  /** Gradient stops sampled across the field by position. */
  colors?: string[];
  gap?: number;
  /** Resting diameter of each dot, in px. */
  dotSize?: number;
  /** Peak dot opacity in the dense corner (resting state). */
  maxOpacity?: number;
  /** Pause at the full field before fading out and replaying, in ms. */
  holdMs?: number;
  className?: string;
};

export default function PixelRipple({
  color,
  colors = DEFAULT_COLORS,
  gap = 12,
  dotSize = 3,
  maxOpacity = 0.55,
  holdMs = HOLD_MS,
  className,
}: PixelRippleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pixelsRef = useRef<Pixel[]>([]);
  const animationRef = useRef<number>(0);
  const lastFrameRef = useRef(performance.now());
  const reducedMotionRef = useRef(false);
  // Loop state: "expand" → "hold" → "fade" → reset → "expand"
  const phaseRef = useRef<"expand" | "hold" | "fade">("expand");
  const phaseStartRef = useRef(performance.now());
  // cursor in canvas-local coords; offscreen when the pointer isn't over us
  const mouseRef = useRef({ x: -9999, y: -9999 });

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = wrap.getBoundingClientRect();
    const w = Math.floor(width);
    const h = Math.floor(height);
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // Peak (cursor) opacity is boosted well above the resting gradient so the
    // pointer clearly lights up its neighborhood.
    const peakAlpha = Math.min(0.95, maxOpacity * 2 + 0.25);

    // Resolve the gradient stops once. A single `color` (if passed) wins as a
    // one-stop gradient; otherwise sample across `colors` by position.
    const stops = (color ? [color] : colors).map(hexToRgb);

    // Original ripple speed — scaled to the canvas so the sweep takes about the
    // same time regardless of size.
    const counterBase = (w + h) * 0.01;

    const pixels: Pixel[] = [];
    for (let x = 0; x < w; x += gap) {
      for (let y = 0; y < h; y += gap) {
        const dx = x - w / 2;
        const dy = y - h / 2;
        const delay = reducedMotionRef.current
          ? 0
          : Math.sqrt(dx * dx + dy * dy);
        const t = (x / w + y / h) / 2;
        const grad = Math.pow(t, 1.4);
        const baseAlpha = maxOpacity * grad;
        const dotColor = colorAt(stops, t);
        pixels.push(
          createPixel(
            ctx,
            x,
            y,
            dotColor,
            baseAlpha,
            dotSize,
            delay,
            Math.random() * 4 + counterBase,
            peakAlpha,
          ),
        );
      }
    }
    pixelsRef.current = pixels;
    phaseRef.current = "expand";
    phaseStartRef.current = performance.now();
  }, [color, colors, gap, dotSize, maxOpacity]);

  const animate = useCallback(() => {
    cancelAnimationFrame(animationRef.current);

    // Reduced motion: draw the resting field once, no loop, no reactivity.
    if (reducedMotionRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pixelsRef.current) {
        p.size = p.maxSize;
        p.draw(1);
      }
      return;
    }

    const frameInterval = 1000 / 60;
    const loop = () => {
      animationRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const elapsed = now - lastFrameRef.current;
      if (elapsed < frameInterval) return;
      lastFrameRef.current = now - (elapsed % frameInterval);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pixels = pixelsRef.current;
      if (!pixels.length) return;

      // ── Advance the loop phase ──────────────────────────────────────────
      const inPhase = now - phaseStartRef.current;
      let fade = 1;
      if (phaseRef.current === "expand") {
        if (pixels.every((p) => p.isIdle)) {
          phaseRef.current = "hold";
          phaseStartRef.current = now;
        }
      } else if (phaseRef.current === "hold") {
        if (inPhase >= holdMs) {
          phaseRef.current = "fade";
          phaseStartRef.current = now;
        }
      } else {
        fade = Math.max(0, 1 - inPhase / FADE_MS);
        if (inPhase >= FADE_MS) {
          for (const p of pixels) p.reset();
          phaseRef.current = "expand";
          phaseStartRef.current = now;
          fade = 0;
        }
      }

      const { x: mx, y: my } = mouseRef.current;
      for (const p of pixels) {
        if (!p.isIdle) p.appear();
        p.react(mx, my);
        p.draw(fade);
      }
    };
    animationRef.current = requestAnimationFrame(loop);
  }, [holdMs]);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    init();
    animate();

    // Track the cursor globally so the wrapper can stay pointer-events-none
    // (keeps the greeting text/links interactive). Convert to canvas-local.
    const onMove = (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    const resizeObserver = new ResizeObserver(() => {
      init();
      animate();
    });
    if (wrapRef.current) resizeObserver.observe(wrapRef.current);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [init, animate]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        // Fog all four edges so the dot field blends into the background
        // instead of ending on a hard line.
        maskImage:
          "linear-gradient(to right, transparent 0%, black 18%, black 82%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 18%, black 82%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
