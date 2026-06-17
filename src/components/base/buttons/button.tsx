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
  | "link-destructive"
  | "skeuomorphic";

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
  xs: "gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold data-icon-only:p-2",
  sm: "gap-1 rounded-md px-3 py-2 text-sm font-semibold data-icon-only:p-2",
  md: "gap-1 rounded-lg px-3.5 py-2.5 text-sm font-semibold data-icon-only:p-2.5",
  lg: "gap-1.5 rounded-lg px-4 py-2.5 text-base font-semibold data-icon-only:p-3",
  xl: "gap-1.5 rounded-lg px-5 py-3 text-base font-semibold data-icon-only:p-3.5",
};

const iconSizeMap: Record<ButtonSize, string> = {
  xs: "h-3.5 w-3.5 stroke-[2.25px]",
  sm: "h-4 w-4",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  xl: "h-5 w-5",
};

const colorClasses: Record<ButtonColor, string> = {
  primary: [
    "bg-neutral-900 text-white ring-1 ring-inset ring-transparent shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
    "before:pointer-events-none before:absolute before:inset-px before:rounded-[inherit] before:border before:border-white/10",
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
    "before:pointer-events-none before:absolute before:inset-px before:rounded-[inherit] before:border before:border-white/10",
    "hover:bg-red-500 data-[loading=true]:bg-red-500",
  ].join(" "),
  "secondary-destructive":
    "bg-white text-red-700 ring-1 ring-inset ring-red-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-red-50 hover:text-red-700 data-[loading=true]:bg-red-50",
  "tertiary-destructive": "bg-transparent text-red-700 hover:bg-red-50 hover:text-red-700 data-[loading=true]:bg-red-50",
  "link-gray": "h-auto p-0 text-neutral-600 hover:text-neutral-900 [&_[data-text]]:underline [&_[data-text]]:decoration-transparent hover:[&_[data-text]]:decoration-neutral-400",
  "link-color": "h-auto p-0 text-neutral-900 hover:text-neutral-700 [&_[data-text]]:underline [&_[data-text]]:decoration-transparent hover:[&_[data-text]]:decoration-neutral-900",
  "link-destructive":
    "h-auto p-0 text-red-700 hover:text-red-800 [&_[data-text]]:underline [&_[data-text]]:decoration-transparent hover:[&_[data-text]]:decoration-current",
  skeuomorphic: [
    "rounded-2xl border-0 p-0 text-transparent shadow-[0_1px_2px_rgba(0,0,0,0.28),0_6px_18px_rgba(0,0,0,0.12)]",
    "bg-[rgba(0,0,0,0.78)] [-webkit-tap-highlight-color:transparent]",
    "after:pointer-events-none after:absolute after:inset-[-2px] after:rounded-[inherit] after:opacity-65 after:content-['']",
    "after:bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_36%)]",
  ].join(" "),
};

function Spinner({ size }: { size: ButtonSize }) {
  return (
    <svg
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

const skeuomorphicOuter = "block w-full rounded-[inherit] transition-all duration-300 ease-linear shadow-[0_1px_2px_rgba(0,0,0,0.22),0_8px_18px_rgba(0,0,0,0.12)] group-hover/button:translate-y-px group-hover/button:shadow-[0_1px_2px_rgba(0,0,0,0.18),0_4px_10px_rgba(0,0,0,0.09)]";

const skeuomorphicInner = "relative overflow-hidden rounded-[inherit] bg-[linear-gradient(180deg,#fbfbfb_0%,#eeeeee_45%,#d8d8d8_100%)] transition-[transform,box-shadow,background] duration-200 ease-linear shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_2px_rgba(0,0,0,0.08),inset_0_8px_14px_rgba(255,255,255,0.22),inset_0_-8px_14px_rgba(0,0,0,0.04)] before:pointer-events-none before:absolute before:inset-x-px before:top-px before:h-[48%] before:rounded-[inherit] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.55),transparent)] before:content-[''] group-hover/button:bg-[linear-gradient(180deg,#f6f6f6_0%,#e8e8e8_55%,#d4d4d4_100%)] group-hover/button:shadow-[inset_0_2px_4px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.72),inset_0_-6px_12px_rgba(0,0,0,0.05)] group-active/button:scale-[0.98]";

const skeuomorphicText =
  "relative z-[2] block bg-[linear-gradient(180deg,#171717,#555555)] bg-clip-text [-webkit-background-clip:text] text-transparent text-[15px] font-semibold tracking-[-0.03em] [text-shadow:0_1px_1px_rgba(255,255,255,0.35)] transition-transform duration-200 ease-linear select-none group-hover/button:scale-[0.985]";

const skeuomorphicPaddingMap: Record<ButtonSize, string> = {
  xs: "px-2.5 py-1",
  sm: "px-3 py-1.5",
  md: "px-3.5 py-2",
  lg: "px-4 py-2.5",
  xl: "px-5 py-3",
};

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
  const isSkeuomorphic = effectiveColor === "skeuomorphic";

  const showLeadingIcon = !pending && iconLeading != null;
  const showTrailingIcon = !pending && iconTrailing != null;
  const showSpinner = pending;

  const innerContent = (
    <>
      {showSpinner && (
        <span
          data-icon="loading"
          className={cn(
            "inline-flex items-center justify-center text-neutral-700",
            !showTextWhileLoading && "absolute inset-0",
          )}
          aria-hidden="true"
        >
          <Spinner size={size} />
        </span>
      )}
      {showLeadingIcon && !isSkeuomorphic && (
        <span data-icon="leading" className={cn("inline-flex shrink-0 items-center justify-center", iconSizeMap[size])} aria-hidden="true">
          {iconLeading}
        </span>
      )}
      {hasText && (
        <span data-text className={cn(!effectiveNoTextPadding && "px-0.5")}>
          {children}
        </span>
      )}
      {showTrailingIcon && !isSkeuomorphic && (
        <span data-icon="trailing" className={cn("inline-flex shrink-0 items-center justify-center", iconSizeMap[size])} aria-hidden="true">
          {iconTrailing}
        </span>
      )}
    </>
  );

  if (isSkeuomorphic) {
    return (
      <button
        type={type}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        data-loading={pending ? true : undefined}
        data-icon-only={isIconOnly ? true : undefined}
        className={cn(baseClasses, "flex", sizeClasses[size], colorClasses[effectiveColor], pending && "pointer-events-none", className)}
        {...props}
      >
        <span className={skeuomorphicOuter}>
          <span className={cn(skeuomorphicInner, skeuomorphicPaddingMap[size], "flex w-full items-center justify-center gap-1.5")}>
            {showLeadingIcon && (
              <span data-icon="leading" className={cn("inline-flex shrink-0 items-center justify-center text-neutral-700", iconSizeMap[size])} aria-hidden="true">
                {iconLeading}
              </span>
            )}
            {hasText && <span data-text className={skeuomorphicText}>{children}</span>}
            {showTrailingIcon && (
              <span data-icon="trailing" className={cn("inline-flex shrink-0 items-center justify-center text-neutral-700", iconSizeMap[size])} aria-hidden="true">
                {iconTrailing}
              </span>
            )}
          </span>
        </span>
      </button>
    );
  }

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
        pending && showTextWhileLoading && "[&>*:not([data-icon=loading]):not([data-text])]:hidden",
        className,
      )}
      {...props}
    >
      {innerContent}
    </button>
  );
}

export type { ButtonColor, ButtonSize, ButtonProps };