import * as React from "react";
import { cn } from "@/lib/utils";

interface TextureButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "accent" | "icon";
}

const TextureButton = React.forwardRef<HTMLButtonElement, TextureButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          variant === "default" &&
            "border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-750",
          variant === "accent" &&
            "bg-black text-white px-4 py-2.5 hover:bg-neutral-800",
          variant === "icon" &&
            "border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-750 flex-1",
          className
        )}
        {...props}
      />
    );
  }
);
TextureButton.displayName = "TextureButton";

export { TextureButton };
