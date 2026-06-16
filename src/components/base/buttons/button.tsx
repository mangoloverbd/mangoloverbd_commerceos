import { cn } from "@/lib/utils";

type ButtonColor = "primary" | "secondary" | "primary-destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: ButtonColor;
  size?: ButtonSize;
  iconLeading?: React.ReactNode;
  children: React.ReactNode;
}

const colorClasses: Record<ButtonColor, string> = {
  primary:
    "bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 active:bg-neutral-950",
  secondary:
    "bg-white text-neutral-900 border-neutral-200 hover:bg-neutral-50 active:bg-neutral-100",
  "primary-destructive":
    "bg-red-600 text-white border-red-600 hover:bg-red-500 active:bg-red-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2.5",
};

export function Button({
  color = "primary",
  size = "md",
  iconLeading,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-all duration-150",
        "border shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-40",
        colorClasses[color],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {iconLeading && (
        <span className="shrink-0">{iconLeading}</span>
      )}
      {children}
    </button>
  );
}
