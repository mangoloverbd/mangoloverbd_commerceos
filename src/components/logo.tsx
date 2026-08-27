import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
    return (
        <img
            src="/favicon.svg"
            alt="Mango Lover BD Suite"
            className={cn("shrink-0 mix-blend-multiply brightness-0", className)}
        />
    );
}
