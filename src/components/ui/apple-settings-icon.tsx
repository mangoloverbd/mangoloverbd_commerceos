import { cn } from "@/lib/utils";

export function AppleSettingsIcon({ size = 14, className }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("shrink-0", className)}
        >
            {/* Rounded square background */}
            <rect width="24" height="24" rx="5.5" fill="#8E8E93" />
            {/* Gear shape */}
            <path
                d="M13.85 4.31a.5.5 0 0 0-.49-.4h-2.72a.5.5 0 0 0-.49.4l-.3 1.44a5.6 5.6 0 0 0-1.18.68l-1.38-.47a.5.5 0 0 0-.59.23L5.34 8.31a.5.5 0 0 0 .1.63l1.11.96a5.66 5.66 0 0 0 0 1.36l-1.11.96a.5.5 0 0 0-.1.63l1.36 2.32c.12.2.36.28.59.23l1.38-.47c.37.27.76.49 1.18.68l.3 1.44c.05.23.26.4.49.4h2.72c.23 0 .44-.17.49-.4l.3-1.44a5.6 5.6 0 0 0 1.18-.68l1.38.47c.23.08.47 0 .59-.23l1.36-2.32a.5.5 0 0 0-.1-.63l-1.11-.96c.04-.22.06-.45.06-.68s-.02-.46-.06-.68l1.11-.96a.5.5 0 0 0 .1-.63l-1.36-2.32a.5.5 0 0 0-.59-.23l-1.38.47a5.6 5.6 0 0 0-1.18-.68l-.3-1.44Z"
                fill="white"
            />
            {/* Center hole */}
            <circle cx="12" cy="12" r="2.1" fill="#8E8E93" />
        </svg>
    );
}
