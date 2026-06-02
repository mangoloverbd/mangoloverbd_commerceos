import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
    return (
        <img
            src="/logo.png"
            alt="Seraphine"
            className={cn("shrink-0", className)}
        />
    );
}
