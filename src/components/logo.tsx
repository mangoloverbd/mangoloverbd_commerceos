import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
    return (
        <img
            src="/logo.png"
            alt="Arc Lab Suite"
            className={cn("shrink-0", className)}
        />
    );
}
