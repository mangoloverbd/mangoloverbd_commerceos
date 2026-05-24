import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";

interface PlasticButtonProps {
    text: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    loadingText?: string;
    className?: string;
    icon?: React.ElementType;
}

export function PlasticButton({ text, onClick, disabled, loading, loadingText, className, icon: Icon }: PlasticButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className={cn(
                "relative inline-block px-6 py-2.5 rounded-[6px] text-white font-semibold text-sm transition-all duration-200",
                "bg-gradient-to-b from-blue-500 to-blue-600",
                "active:scale-[0.98] flex justify-center items-center gap-2",
                "disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100",
                className
            )}
            style={{
                boxShadow: `0 2px 8px 0 rgba(0, 0, 0, 0.2), 0 1.5px 0 0 rgba(255,255,255,0.25) inset, 0 -2px 8px 0 rgba(0, 0, 0, 0.15) inset`,
            }}
        >
            {loading && <Spinner className="relative z-10" />}
            {!loading && Icon && <Icon className="h-4 w-4 relative z-10" />}
            <span className="relative z-10">{loading ? (loadingText || "Analyzing…") : text}</span>
            <span
                className="absolute left-1/2 top-0 z-20 w-[80%] h-2/5 -translate-x-1/2 rounded-t-[6px] pointer-events-none"
                style={{
                    background:
                        "linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 80%, transparent 100%)",
                    filter: "blur(1.5px)",
                }}
            />
            <span
                className="absolute inset-0 z-0 rounded-[6px] pointer-events-none"
                style={{
                    boxShadow:
                        "0 0 0 2px rgba(255,255,255,0.10) inset, 0 1.5px 0 0 rgba(255,255,255,0.18) inset, 0 -2px 8px 0 rgba(0, 0, 0, 0.1) inset",
                }}
            />
        </button>
    );
}
