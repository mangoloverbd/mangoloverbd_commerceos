import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ButtonColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "quiet"
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
  variant?: ButtonColor;
  iconLeading?: ReactNode;
  iconTrailing?: ReactNode;
  isLoading?: boolean;
  showTextWhileLoading?: boolean;
  isDisabled?: boolean;
  isPending?: boolean;
  noTextPadding?: boolean;
  children?: ReactNode;
}

const baseClasses = [
  "group/button relative inline-flex h-max cursor-pointer items-center justify-center whitespace-nowrap",
  "outline-none outline-offset-2 transition duration-100 ease-linear",
  "focus-visible:outline-2 focus-visible:outline-brand-500",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

const sizeClasses: Record<ButtonSize, string> = {
  xs: "gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold data-icon-only:p-2",
  sm: "gap-1 rounded-lg px-3 py-2 text-sm font-semibold data-icon-only:p-2",
  md: "gap-1 rounded-lg px-3.5 py-2.5 text-sm font-semibold data-icon-only:p-2.5",
  lg: "gap-1.5 rounded-lg px-4 py-2.5 text-base font-semibold data-icon-only:p-3",
  xl: "gap-1.5 rounded-lg px-[18px] py-3 text-base font-semibold data-icon-only:p-3.5",
};

const iconSizeMap: Record<ButtonSize, string> = {
  xs: "h-4 w-4 stroke-[2.25px]",
  sm: "h-5 w-5",
  md: "h-5 w-5",
  lg: "h-5 w-5",
  xl: "h-5 w-5",
};

const colorClasses: Record<ButtonColor, string> = {
  primary: [
    "bg-neutral-900 text-white ring-1 ring-inset ring-transparent shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
    "before:pointer-events-none before:absolute before:inset-px before:rounded-[7px] before:border before:border-white/10",
    "hover:bg-neutral-800 data-[loading=true]:bg-neutral-800",
  ].join(" "),
  secondary: [
    "bg-white text-neutral-900 ring-1 ring-inset ring-neutral-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
    "hover:bg-neutral-50 hover:text-neutral-900 data-[loading=true]:bg-neutral-50",
    "[&_[data-icon]]:text-neutral-400 hover:[&_[data-icon]]:text-neutral-500",
  ].join(" "),
  quiet: "bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 data-[loading=true]:bg-neutral-100",
  tertiary: "bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 data-[loading=true]:bg-neutral-100",
  "primary-destructive": [
    "bg-red-600 text-white ring-1 ring-inset ring-transparent shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
    "before:pointer-events-none before:absolute before:inset-px before:rounded-[7px] before:border before:border-white/10",
    "hover:bg-red-500 data-[loading=true]:bg-red-500",
  ].join(" "),
  "secondary-destructive":
    "bg-white text-red-700 ring-1 ring-inset ring-red-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-red-50 hover:text-red-700 data-[loading=true]:bg-red-50",
  "tertiary-destructive": "bg-transparent text-red-700 hover:bg-red-50 hover:text-red-700 data-[loading=true]:bg-red-50",
  "link-gray": "h-auto p-0 text-neutral-600 hover:text-neutral-900 [&_[data-text]]:underline [&_[data-text]]:decoration-transparent hover:[&_[data-text]]:decoration-neutral-400",
  "link-color": "h-auto p-0 text-neutral-900 hover:text-neutral-700 [&_[data-text]]:underline [&_[data-text]]:decoration-transparent hover:[&_[data-text]]:decoration-neutral-900",
  "link-destructive":
    "h-auto p-0 text-red-700 hover:text-red-800 [&_[data-text]]:underline [&_[data-text]]:decoration-transparent hover:[&_[data-text]]:decoration-current",
};

function Spinner({ size }: { size: ButtonSize }) {
  return (
    <svg
      data-icon="loading"
      fill="none"
      viewBox="0 0 20 20"
      className={cn("animate-spin", iconSizeMap[size])}
      aria-hidden="true"
    >
      <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
      <circle
        className="origin-center stroke-current"
        cx="10"
        cy="10"
        r="8"
        fill="none"
        strokeWidth="2"
        strokeDasharray="12.5 50"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Button({
  color,
  variant,
  size = "sm",
  iconLeading,
  iconTrailing,
  isLoading = false,
  showTextWhileLoading = false,
  isDisabled = false,
  isPending = false,
  noTextPadding,
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const effectiveColor = (variant ?? color ?? "primary") as ButtonColor;
  const pending = isPending || isLoading;
  const disabled = isDisabled || pending;
  const hasText = children != null;
  const isIconOnly = !hasText && (iconLeading != null || iconTrailing != null) && !pending;
  const isLinkColor = ["link-gray", "link-color", "link-destructive"].includes(effectiveColor);
  const effectiveNoTextPadding = isLinkColor || noTextPadding;

  const showLeadingIcon = !pending && iconLeading != null;
  const showTrailingIcon = !pending && iconTrailing != null;
  const showSpinner = pending;

  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      data-loading={pending ? true : undefined}
      data-icon-only={isIconOnly ? true : undefined}
      className={cn(
        baseClasses,
        sizeClasses[size],
        colorClasses[effectiveColor],
        pending && "pointer-events-none",
        pending && !showTextWhileLoading && "[&>*:not([data-icon=loading])]:invisible",
        className,
      )}
      {...props}
    >
      {showSpinner && (
        <span className={cn(!showTextWhileLoading && "absolute inset-0 flex items-center justify-center")}>
          <Spinner size={size} />
        </span>
      )}
      {showLeadingIcon && (
        <span data-icon="leading" className={cn("inline-flex shrink-0 items-center justify-center", iconSizeMap[size])} aria-hidden="true">
          {iconLeading}
        </span>
      )}
      {hasText && (
        <span data-text className={cn("transition-[color,background-color] duration-100 ease-linear", !effectiveNoTextPadding && "px-0.5")}>
          {children}
        </span>
      )}
      {showTrailingIcon && (
        <span data-icon="trailing" className={cn("inline-flex shrink-0 items-center justify-center", iconSizeMap[size])} aria-hidden="true">
          {iconTrailing}
        </span>
      )}
    </button>
  );
}

export type { ButtonColor, ButtonSize, ButtonProps };