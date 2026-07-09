import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
    return (
        <img
            src="/favicon.svg"
            alt="Merchant-Suite"
            className={cn("shrink-0 mix-blend-multiply", className)}
        />
    );
}
