import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"article">) {
  return (
    <article
      className={cn(
        "relative w-full rounded-[22px] border border-black/[0.08] bg-white/75 p-1.5",
        "shadow-[0_24px_70px_rgba(29,29,31,0.10)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}

function Header({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative mb-1 overflow-hidden rounded-[17px] border border-black/[0.055] bg-black/[0.025] p-6",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-[inherit] bg-gradient-to-b from-white/80 via-white/20 to-transparent"
      />
      {children}
    </div>
  );
}

function Plan({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative z-10 mb-9 flex items-center justify-between gap-3", className)}
      {...props}
    />
  );
}

function Description({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-xs text-black/45", className)} {...props} />;
}

function PlanName({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-[13px] font-medium text-black/55 [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "rounded-full border border-black/15 bg-white/55 px-2.5 py-1 text-[9px] font-medium text-black/60",
        className,
      )}
      {...props}
    />
  );
}

function Price({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative z-10 mb-5 flex items-end gap-1.5", className)}
      {...props}
    />
  );
}

function MainPrice({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("text-[38px] font-semibold tracking-[-0.055em] text-black", className)}
      {...props}
    />
  );
}

function Period({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("pb-1.5 text-[11px] text-black/45", className)} {...props} />;
}

function OriginalPrice({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("ml-auto mr-1 text-lg text-black/35 line-through", className)}
      {...props}
    />
  );
}

function Body({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("space-y-3", className)} {...props} />;
}

function ListItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("flex items-start gap-2.5 text-[11px] leading-relaxed text-black/55", className)}
      {...props}
    />
  );
}

function Separator({
  children = "Upgrade to Growth",
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("my-5 flex items-center gap-2.5 text-[9px] text-black/40", className)}
      {...props}
    >
      <span className="h-px flex-1 bg-black/10" />
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-black/10" />
    </div>
  );
}

export {
  Badge,
  Body,
  Card,
  Description,
  Header,
  List,
  ListItem,
  MainPrice,
  OriginalPrice,
  Period,
  Plan,
  PlanName,
  Price,
  Separator,
};
