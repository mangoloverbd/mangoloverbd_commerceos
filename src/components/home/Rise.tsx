import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Home's entrance: a short fade and rise, staggered by `delay` (seconds).
export const RISE_EASE = [0.22, 1, 0.36, 1] as const;

export function Rise({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: RISE_EASE }}
    >
      {children}
    </motion.div>
  );
}
