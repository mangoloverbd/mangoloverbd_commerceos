"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";

interface TextScrambleProps {
  text: string;
  className?: string;
  textClassName?: string;
  charClassName?: string;
  scrambledClassName?: string;
  underline?: boolean;
  glow?: boolean;
  passive?: boolean;
  animateSignal?: number;
}

export function TextScramble({
  text,
  className = "",
  textClassName,
  charClassName,
  scrambledClassName,
  underline = true,
  glow = true,
  passive = false,
  animateSignal,
}: TextScrambleProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);
  const [isScrambling, setIsScrambling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef = useRef(0);

  const scramble = useCallback(() => {
    setIsScrambling(true);
    frameRef.current = 0;
    const duration = text.length * 3;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      frameRef.current++;

      const progress = frameRef.current / duration;
      const revealedLength = Math.floor(progress * text.length);

      const newText = text
        .split("")
        .map((char, i) => {
          if (char === " ") return " ";
          if (i < revealedLength) return text[i];
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join("");

      setDisplayText(newText);

      if (frameRef.current >= duration) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplayText(text);
        setIsScrambling(false);
      }
    }, 30);
  }, [text]);

  const handleMouseEnter = () => {
    setIsHovering(true);
    if (!passive) scramble();
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  useEffect(() => {
    setDisplayText(text);
  }, [text]);

  useEffect(() => {
    if (animateSignal === undefined) return;
    scramble();
  }, [animateSignal, scramble]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div
      className={cn(
        "group relative inline-flex flex-col cursor-pointer select-none",
        passive && "pointer-events-none",
        className
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={cn("relative font-mono text-lg tracking-widest uppercase", textClassName)}>
        {displayText.split("").map((char, i) => (
          <span
            key={`${char}-${i}`}
            className={cn(
              "inline-block transition-all duration-150",
              isScrambling && char !== text[i]
                ? scrambledClassName || "scale-110 text-primary"
                : charClassName || "text-foreground"
            )}
            style={{
              transitionDelay: `${i * 10}ms`,
            }}
          >
            {char}
          </span>
        ))}
      </span>

      {underline && (
        <span className="relative mt-2 h-px w-full overflow-hidden">
          <span
            className={cn(
              "absolute inset-0 origin-left bg-foreground transition-transform duration-500 ease-out",
              isHovering ? "scale-x-100" : "scale-x-0"
            )}
          />
          <span className="absolute inset-0 bg-border" />
        </span>
      )}

      {glow && (
        <span
          className={cn(
            "absolute -inset-4 -z-10 rounded-lg bg-primary/5 transition-opacity duration-300",
            isHovering ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  );
}
