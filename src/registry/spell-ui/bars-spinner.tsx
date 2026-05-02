import * as React from "react";
import { cn } from "@/lib/utils";

interface BarsSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  color?: string;
}

const ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const DELAYS = ["-1.2s", "-1.1s", "-1s", "-0.9s", "-0.8s", "-0.7s",
                "-0.6s", "-0.5s", "-0.4s", "-0.3s", "-0.2s", "-0.1s"];

export const BarsSpinner = React.forwardRef<HTMLDivElement, BarsSpinnerProps>(
  ({ className, size = 20, color = "currentColor", style, ...props }, ref) => {
    const uid = React.useId().replace(/:/g, "s");
    const barW = Math.round(size * 0.22);
    const barH = Math.max(Math.round(size * 0.07), 1);
    const radius = size * 0.32;

    return (
      <div
        ref={ref}
        className={cn(className)}
        style={{ position: "relative", width: size, height: size, ...style }}
        {...props}
      >
        {/* Scoped keyframe — unique per instance to avoid collisions */}
        <style>{`@keyframes bsp-${uid}{0%{opacity:1}100%{opacity:.15}}`}</style>

        {ANGLES.map((deg, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: barW,
              height: barH,
              marginLeft: -barW / 2,
              marginTop: -barH / 2,
              borderRadius: barH / 2,
              backgroundColor: color,
              transformOrigin: "center center",
              transform: `rotate(${deg}deg) translateY(-${radius}px)`,
              animation: `bsp-${uid} 1.2s linear infinite`,
              animationDelay: DELAYS[i],
            }}
          />
        ))}
      </div>
    );
  }
);

BarsSpinner.displayName = "BarsSpinner";
export type { BarsSpinnerProps };
