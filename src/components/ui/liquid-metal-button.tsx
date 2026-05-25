import { liquidMetalFragmentShader, ShaderMount } from "@paper-design/shaders";
import { Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LiquidMetalButtonProps {
  label?: string;
  onClick?: () => void;
  viewMode?: "text" | "icon";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}

const HEIGHT = 46;
const INNER_HEIGHT = 42;

export function LiquidMetalButton({
  label = "Get Started",
  onClick,
  viewMode = "text",
  type = "button",
  disabled = false,
  fullWidth = false,
  className,
}: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const shaderRef = useRef<HTMLDivElement>(null);
  const shaderMount = useRef<ShaderMount | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleId = useRef(0);

  const defaultWidth = viewMode === "icon" ? 46 : 142;

  const initShader = (w: number) => {
    if (!shaderRef.current) return;
    shaderMount.current?.dispose();
    shaderRef.current.style.width = `${w}px`;
    shaderRef.current.style.height = `${HEIGHT}px`;
    try {
      shaderMount.current = new ShaderMount(
        shaderRef.current,
        liquidMetalFragmentShader,
        {
          u_repetition: 4,
          u_softness: 0.5,
          u_shiftRed: 0.3,
          u_shiftBlue: 0.3,
          u_distortion: 0,
          u_contour: 0,
          u_angle: 45,
          u_scale: 8,
          u_shape: 1,
          u_offsetX: 0.1,
          u_offsetY: -0.1,
        },
        undefined,
        0.6,
      );
    } catch (e) {
      console.error("[LiquidMetalButton] shader init failed:", e);
    }
  };

  useEffect(() => {
    // Inject global CSS once
    const styleId = "shader-canvas-style-exploded";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .shader-container-exploded canvas {
          display: block !important;
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 6px !important;
        }
        @keyframes ripple-animation {
          0%   { transform: translate(-50%, -50%) scale(0); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    // Measure actual rendered width, then init shader at that size
    const measure = () => {
      const w = containerRef.current?.offsetWidth ?? defaultWidth;
      initShader(w);
    };

    // Use rAF to let layout settle before measuring
    const raf = requestAnimationFrame(measure);

    // Re-init if container resizes (e.g. window resize)
    const ro = new ResizeObserver(() => {
      const w = containerRef.current?.offsetWidth ?? defaultWidth;
      initShader(w);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      shaderMount.current?.dispose();
      shaderMount.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseEnter = () => {
    if (disabled) return;
    setIsHovered(true);
    shaderMount.current?.setSpeed?.(1);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPressed(false);
    shaderMount.current?.setSpeed?.(0.6);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) { e.preventDefault(); return; }
    shaderMount.current?.setSpeed?.(2.4);
    setTimeout(() => {
      shaderMount.current?.setSpeed?.(isHovered ? 1 : 0.6);
    }, 300);

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const ripple = { x: e.clientX - rect.left, y: e.clientY - rect.top, id: rippleId.current++ };
      setRipples((prev) => [...prev, ripple]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== ripple.id)), 600);
    }
    onClick?.();
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", fullWidth && "w-full", disabled && "opacity-70", className)}
    >
      <div style={{ perspective: "1000px", perspectiveOrigin: "50% 50%", width: "100%" }}>
        <div
          style={{
            position: "relative",
            width: fullWidth ? "100%" : `${defaultWidth}px`,
            height: `${HEIGHT}px`,
            transformStyle: "preserve-3d",
            transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: "none",
          }}
        >
          {/* Label */}
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: `${HEIGHT}px`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              transformStyle: "preserve-3d",
              transform: "translateZ(20px)",
              zIndex: 30, pointerEvents: "none",
            }}
          >
            {viewMode === "icon" && (
              <Sparkles size={16} style={{ color: "#666", filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.5))" }} />
            )}
            {viewMode === "text" && (
              <span style={{ fontSize: "14px", color: "#666", fontWeight: 400, textShadow: "0px 1px 2px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
                {label}
              </span>
            )}
          </div>

          {/* Dark inner face */}
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: `${HEIGHT}px`,
              transformStyle: "preserve-3d",
              transform: `translateZ(10px) ${isPressed ? "translateY(1px) scale(0.98)" : "translateY(0) scale(1)"}`,
              transition: "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease",
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: "calc(100% - 4px)", height: `${INNER_HEIGHT}px`,
                margin: "2px", borderRadius: "6px",
                background: "linear-gradient(180deg, #202020 0%, #000000 100%)",
                boxShadow: isPressed ? "inset 0px 2px 4px rgba(0,0,0,0.4)" : "none",
              }}
            />
          </div>

          {/* Shader border */}
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: `${HEIGHT}px`,
              transformStyle: "preserve-3d",
              transform: `translateZ(0px) ${isPressed ? "translateY(1px) scale(0.98)" : "translateY(0) scale(1)"}`,
              transition: "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease",
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: "100%", height: `${HEIGHT}px`,
                borderRadius: "6px", background: "transparent",
                boxShadow: isPressed
                  ? "0px 0px 0px 1px rgba(0,0,0,0.5)"
                  : isHovered
                    ? "0px 0px 0px 1px rgba(0,0,0,0.4), 0px 8px 5px 0px rgba(0,0,0,0.1)"
                    : "0px 0px 0px 1px rgba(0,0,0,0.3), 0px 9px 9px 0px rgba(0,0,0,0.12)",
              }}
            >
              {/* Shader canvas container — sized by JS via initShader */}
              <div
                ref={shaderRef}
                className="shader-container-exploded"
                style={{ borderRadius: "6px", overflow: "hidden", position: "relative", height: `${HEIGHT}px` }}
              />
            </div>
          </div>

          {/* Invisible hit target */}
          <button
            ref={buttonRef}
            type={type}
            disabled={disabled}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={() => !disabled && setIsPressed(true)}
            onMouseUp={() => setIsPressed(false)}
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: `${HEIGHT}px`,
              background: "transparent", border: "none",
              cursor: disabled ? "not-allowed" : "pointer",
              outline: "none", zIndex: 40,
              transformStyle: "preserve-3d",
              transform: "translateZ(25px)",
              overflow: "hidden", borderRadius: "6px",
            }}
            aria-label={label}
          >
            {ripples.map((r) => (
              <span
                key={r.id}
                style={{
                  position: "absolute", left: `${r.x}px`, top: `${r.y}px`,
                  width: "20px", height: "20px", borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%)",
                  pointerEvents: "none", animation: "ripple-animation 0.6s ease-out",
                }}
              />
            ))}
          </button>
        </div>
      </div>
    </div>
  );
}
