import type { ReactNode } from "react";

type CartoonSize = "sm" | "md" | "lg";

interface CartoonButtonProps {
  label: string;
  icon?: ReactNode;
  color?: string;
  hasHighlight?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  size?: CartoonSize;
}

const sizeMap: Record<CartoonSize, string> = {
  sm: "h-8 px-4 text-sm",
  md: "h-10 px-5 text-lg",
  lg: "h-12 px-6 text-xl",
};

export function CartoonButton({
  label,
  icon,
  color = 'bg-orange-400',
  hasHighlight = true,
  disabled = false,
  onClick,
  className,
  size = "md",
}: CartoonButtonProps) {
  const handleClick = () => {
    if (disabled) return;
    onClick?.();
  };

  return (
    <div
      className={`${className || 'inline-block'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <button
        disabled={disabled}
        onClick={handleClick}
        className={`relative w-full ${sizeMap[size]} rounded-lg font-bold text-neutral-800 border-2 border-neutral-800 transition-all duration-150 overflow-hidden group
        ${color} hover:shadow-[0_4px_0_0_#262626]
        ${disabled ? 'opacity-50 pointer-events-none' : 'hover:-translate-y-1 active:translate-y-0 active:shadow-none'}`}
      >
        <span className="relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap">
          {icon && <span className="shrink-0">{icon}</span>}
          {label}
        </span>
        {hasHighlight && !disabled && (
          <div className="absolute top-1/2 left-[-100%] w-16 h-24 bg-white/50 -translate-y-1/2 rotate-12 transition-all duration-500 ease-in-out group-hover:left-[200%]"></div>
        )}
      </button>
    </div>
  );
}
