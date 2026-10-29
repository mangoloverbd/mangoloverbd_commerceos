import * as React from "react";
import { cn } from "@/lib/utils";

type GlossColor = "blue" | "mango";

export interface GlossButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: GlossColor;
}

// Glossy toolbar button: solid fill, soft white inner glow, a 1px light top
// edge and a matching outer ring. The look lives in `.gloss-button` (index.css).
const GlossButton = React.forwardRef<HTMLButtonElement, GlossButtonProps>(
  ({ className, color = "blue", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-color={color}
      className={cn(
        "gloss-button inline-flex h-9 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-[12px] font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  ),
);

GlossButton.displayName = "GlossButton";

export { GlossButton };
