import * as React from "react";
import { flushSync } from "react-dom";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type SizeVariant = "sm" | "default" | "lg";

interface CopyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value?: string;
  size?: SizeVariant;
}

const sizeMap: Record<SizeVariant, { button: string; icon: number }> = {
  sm: { button: "h-8 w-8", icon: 14 },
  default: { button: "h-9 w-9", icon: 16 },
  lg: { button: "h-12 w-12", icon: 20 },
};

const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      value,
      size = "default",
      className,
      onClick,
      ...props
    },
    ref,
  ) => {
    const [copied, setCopied] = React.useState<boolean>(false);
    const timeoutRef = React.useRef<number | null>(null);

    React.useEffect(() => {
      return () => {
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
      // Prevent parent row navigation when nested inside clickable order rows.
      event.stopPropagation();
      if (value) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(value).catch(() => {});
        } else {
          const area = document.createElement("textarea");
          area.value = value;
          document.body.appendChild(area);
          area.select();
          try {
            document.execCommand("copy");
          } catch {
            // no-op: clipboard unavailable, still show feedback
          }
          document.body.removeChild(area);
        }
      }
      // Commit the check before expensive table/row click work can hold up the paint.
      flushSync(() => setCopied(true));
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
      onClick?.(event);
    };

    const { button: buttonSize, icon: iconSize } = sizeMap[size];

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        disabled={copied}
        className={cn(
          "relative inline-flex cursor-pointer items-center justify-center rounded-md text-neutral-900 transition duration-100 ease-out active:scale-[0.97] disabled:opacity-100 disabled:text-black dark:text-neutral-50",
          buttonSize,
          className,
        )}
        {...props}
      >
        {/* Tick enters under a keyframe animation (not a transition) so it is at
            full opacity on the first painted frame — only the scale animates. A
            fading/blurred enter is what made the tick read as "late". The
            transition is kept in both states so the reset cross-fades smoothly
            without flashing the tick on mount. */}
        <div
          className={cn(
            "pointer-events-none transition-[transform,opacity] duration-100",
            copied
              ? "scale-100 opacity-100 animate-[copy-tick-pop_140ms_ease-out]"
              : "scale-50 opacity-0",
          )}
        >
          <CheckIcon
            size={iconSize}
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </div>
        <div
          className={cn(
            "pointer-events-none absolute transition-[transform,opacity] duration-100 ease-in",
            copied ? "scale-60 opacity-0" : "scale-100 opacity-100",
          )}
        >
          <CopyIcon size={iconSize} strokeWidth={2} aria-hidden="true" />
        </div>
      </button>
    );
  },
);

CopyButton.displayName = "CopyButton";

export { CopyButton };
export type { CopyButtonProps };
