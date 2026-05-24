import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";

export function ASMRStaticBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animationFrameId = 0;
    let particles: Particle[] = [];
    const mouse = { x: -1000, y: -1000 };

    const particleCount = 1000;
    const magneticRadius = 280;
    const vortexStrength = 0.07;
    const pullStrength = 0.12;

    class Particle {
      x = 0;
      y = 0;
      vx = 0;
      vy = 0;
      size = 0;
      alpha = 0;
      color = "";
      rotation = 0;
      rotationSpeed = 0;
      frictionGlow = 0;

      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 1.5 + 0.5;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.2;
        this.color = Math.random() > 0.7 ? "240, 245, 255" : "80, 80, 85";
        this.alpha = Math.random() * 0.4 + 0.1;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.05;
      }

      update() {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0 && dist < magneticRadius) {
          const force = (magneticRadius - dist) / magneticRadius;

          this.vx += (dx / dist) * force * pullStrength;
          this.vy += (dy / dist) * force * pullStrength;
          this.vx += (dy / dist) * force * vortexStrength * 10;
          this.vy -= (dx / dist) * force * vortexStrength * 10;
          this.frictionGlow = force * 0.7;
        } else {
          this.frictionGlow *= 0.92;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.vx += (Math.random() - 0.5) * 0.04;
        this.vy += (Math.random() - 0.5) * 0.04;
        this.rotation += this.rotationSpeed + (Math.abs(this.vx) + Math.abs(this.vy)) * 0.05;

        if (this.x < -20) this.x = width + 20;
        if (this.x > width + 20) this.x = -20;
        if (this.y < -20) this.y = height + 20;
        if (this.y > height + 20) this.y = -20;
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        const finalAlpha = Math.min(this.alpha + this.frictionGlow, 0.9);
        ctx.fillStyle = `rgba(${this.color}, ${finalAlpha})`;

        if (this.frictionGlow > 0.3) {
          ctx.shadowBlur = 8 * this.frictionGlow;
          ctx.shadowColor = `rgba(180, 220, 255, ${this.frictionGlow})`;
        }

        ctx.beginPath();
        ctx.moveTo(0, -this.size * 2.5);
        ctx.lineTo(this.size, 0);
        ctx.lineTo(0, this.size * 2.5);
        ctx.lineTo(-this.size, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    const init = () => {
      const rect = root.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles = Array.from({ length: particleCount }, () => new Particle());
    };

    const render = () => {
      ctx.fillStyle = "rgba(10, 10, 12, 0.18)";
      ctx.fillRect(0, 0, width, height);

      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      root.style.setProperty("--mouse-x", `${mouse.x}px`);
      root.style.setProperty("--mouse-y", `${mouse.y}px`);
    };

    const handlePointerLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
      root.style.setProperty("--mouse-x", "-100px");
      root.style.setProperty("--mouse-y", "-100px");
    };

    const resizeObserver = new ResizeObserver(init);
    resizeObserver.observe(root);
    root.addEventListener("pointermove", handlePointerMove);
    root.addEventListener("pointerleave", handlePointerLeave);

    init();
    render();

    return () => {
      resizeObserver.disconnect();
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerleave", handlePointerLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn("relative h-full w-full cursor-none overflow-hidden bg-[#0a0a0c]", className)}
      style={
        {
          "--mouse-x": "-100px",
          "--mouse-y": "-100px",
        } as CSSProperties
      }
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      <div className="relative z-10 flex h-full flex-col items-center justify-center pointer-events-none">
        <div className="max-w-md border border-white/5 bg-white/[0.02] px-8 py-5 text-center backdrop-blur-sm">
          <h2 className="text-sm font-light uppercase tracking-[0.45em] text-white/35 md:text-xl">
            Arc Technology Corporation
          </h2>
          <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="text-[10px] uppercase leading-5 tracking-[0.24em] text-white/15">
            We build intelligent commerce systems for order management, courier dispatch, fraud detection, and customer operations.
          </p>
        </div>
      </div>

      <div
        className="absolute left-0 top-0 z-50 h-4 w-4 rounded-full border border-white/20 pointer-events-none transition-transform duration-75 ease-out"
        style={{
          transform: "translate(calc(var(--mouse-x) - 50%), calc(var(--mouse-y) - 50%))",
        }}
      />
    </div>
  );
}

export default ASMRStaticBackground;
