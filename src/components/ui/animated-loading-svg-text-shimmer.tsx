import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoaderProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

const Loader = React.forwardRef<SVGSVGElement, LoaderProps>(
  ({ className, size = 64, strokeWidth = 2, ...props }, ref) => {
    const pathRef = useRef<SVGPathElement>(null);
    const [pathLength, setPathLength] = useState<number>(0);

    useEffect(() => {
      if (pathRef.current) {
        setPathLength(pathRef.current.getTotalLength());
      }
    }, []);

    return (
      <>
        <style>{`
          @keyframes drawStrokeSlow {
            0%   { stroke-dashoffset: var(--pl); }
            50%  { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: calc(var(--pl) * -1); }
          }
        `}</style>
        <svg
          ref={ref}
          role="status"
          aria-label="Loading..."
          viewBox="0 0 19 19"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          className={cn("text-current", className)}
          {...props}
        >
          <path
            ref={pathRef}
            d="M4.43431 2.42415C-0.789139 6.90104 1.21472 15.2022 8.434 15.9242C15.5762 16.6384 18.8649 9.23035 15.9332 4.5183C14.1316 1.62255 8.43695 0.0528911 7.51841 3.33733C6.48107 7.04659 15.2699 15.0195 17.4343 16.9241"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={pathLength > 0 ? {
              strokeDasharray: pathLength,
              '--pl': pathLength,
              animation: 'drawStrokeSlow 3s ease-in-out infinite',
            } as React.CSSProperties : { opacity: 0 }}
          />
        </svg>
      </>
    );
  }
);

Loader.displayName = "Loader";

interface LoadingBreadcrumbProps {
  text?: string;
  className?: string;
}

export function LoadingBreadcrumb({
  text = "Thinking",
  className,
}: LoadingBreadcrumbProps) {
  return (
    <>
      <style>{`
        @keyframes textShimmerSlow {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .shimmer-text-slow {
          background-image: linear-gradient(
            90deg,
            rgb(161 161 170) 0%,
            rgb(161 161 170) 35%,
            rgb(24 24 27) 50%,
            rgb(161 161 170) 65%,
            rgb(161 161 170) 100%
          );
          background-size: 300% auto;
          animation: textShimmerSlow 3s ease-in-out infinite;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
      `}</style>

      <div className={cn(
        "flex items-center gap-2 text-[14px] font-medium tracking-wide",
        className
      )}>
        <Loader
          size={18}
          strokeWidth={2.5}
          className="text-zinc-500"
        />
        <span className="shimmer-text-slow">{text}</span>
        <ChevronRight size={14} className="text-zinc-400" />
      </div>
    </>
  );
}
