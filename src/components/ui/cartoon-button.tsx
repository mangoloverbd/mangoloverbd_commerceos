interface CartoonButtonProps {
  label: string;
  color?: string;
  hasHighlight?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function CartoonButton({
  label,
  color = 'bg-orange-400',
  hasHighlight = true,
  disabled = false,
  onClick,
}: CartoonButtonProps) {
  const handleClick = () => {
    if (disabled) return;
    onClick?.();
  };

  return (
    <div className="relative inline-block">
      {/* Shadow layer */}
      <div className={`absolute inset-0 translate-y-[6px] rounded-2xl bg-black/20`} />
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`relative ${color} text-black font-extrabold text-base px-8 py-3 rounded-2xl border-[3px] border-black shadow-[inset_0_-4px_0_0_rgba(0,0,0,0.2)] active:translate-y-[2px] active:shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.2)] transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
      >
        {label}
        {hasHighlight && !disabled && (
          <span className="absolute top-[6px] left-[10px] right-[10px] h-[40%] rounded-t-xl bg-white/25 pointer-events-none" />
        )}
      </button>
    </div>
  );
}
