import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ButtonColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "primary-destructive"
  | "secondary-destructive"
  | "tertiary-destructive"
  | "link-gray"
  | "link-color"
  | "link-destructive";

type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ButtonColor;
  size?: ButtonSize;
  iconLeading?: ReactNode;
  iconTrailing?: ReactNode;
  isLoading?: boolean;
  showTextWhileLoading?: boolean;
  isDisabled?: boolean;
  children?: ReactNode;
}

const baseClasses =
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold transition duration-150 ease-out border outline-none " +
  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500 " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-50";

const colorClasses: Record<ButtonColor, string> = {
  primary:
    "bg-neutral-900 text-white border-neutral-900 shadow-sm hover:bg-neutral-800 active:bg-neutral-950",
  secondary:
    "bg-white text-neutral-900 border-neutral-200 shadow-sm hover:bg-neutral-50 active:bg-neutral-100",
  tertiary:
    "bg-transparent text-neutral-700 border-transparent hover:bg-neutral-100 active:bg-neutral-200",
  "primary-destructive":
    "bg-red-600 text-white border-red-600 shadow-sm hover:bg-red-500 active:bg-red-700",
  "secondary-destructive":
    "bg-white text-red-700 border-red-200 shadow-sm hover:bg-red-50 active:bg-red-100",
  "tertiary-destructive":
    "bg-transparent text-red-700 border-transparent hover:bg-red-50 active:bg-red-100",
  "link-gray":
    "bg-transparent text-neutral-600 border-transparent underline-offset-4 hover:text-neutral-900 hover:underline",
  "link-color":
    "bg-transparent text-brand-700 border-transparent underline-offset-4 hover:text-brand-800 hover:underline",
  "link-destructive":
    "bg-transparent text-red-700 border-transparent underline-offset-4 hover:text-red-800 hover:underline",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2.5",
  xl: "h-12 px-6 text-base gap-2.5",
};

const iconSizeMap: Record<ButtonSize, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-5 w-5",
  xl: "h-5 w-5",
};

function Spinner({ size }: { size: ButtonSize }) {
  const dim = iconSizeMap[size];
  return (
    <span
      className={cn("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", dim)}
      aria-hidden="true"
    />
  );
}

export function Button({
  color = "primary",
  size = "md",
  iconLeading,
  iconTrailing,
  isLoading = false,
  showTextWhileLoading = false,
  isDisabled = false,
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const disabled = isDisabled || isLoading;
  const showLeading = isLoading && !showTextWhileLoading ? <Spinner size={size} /> : iconLeading;
  const showTrailing = !isLoading ? iconTrailing : null;

  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={cn(baseClasses, colorClasses[color], sizeClasses[size], className)}
      {...props}
    >
      {showLeading && (
        <span className={cn("inline-flex shrink-0 items-center justify-center", iconSizeMap[size])} aria-hidden="true">
          {showLeading}
        </span>
      )}
      {children != null && (
        <span className={cn(isLoading && !showTextWhileLoading && "sr-only")}>{children}</span>
      )}
      {showTrailing && (
        <span className={cn("inline-flex shrink-0 items-center justify-center", iconSizeMap[size])} aria-hidden="true">
          {showTrailing}
        </span>
      )}
    </button>
  );
}

export type { ButtonColor, ButtonSize, ButtonProps };