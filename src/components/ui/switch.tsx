import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & { thumbClassName?: string }
>(({ className, thumbClassName, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "group peer relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full border-0 p-0 transition-colors duration-200 ease",
      "data-[state=unchecked]:bg-black/[0.12]",
      "data-[state=checked]:bg-linear-to-b data-[state=checked]:from-blue-500 data-[state=checked]:to-blue-600",
      "data-[state=checked]:shadow-[inset_0_1.5px_0_0_rgba(255,255,255,0.25),inset_0_0_0_0.75px_#3b82f6]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <span
      className={cn(
        "pointer-events-none absolute left-[3px] top-[3px] flex size-[18px] items-center justify-center rounded-full",
        "bg-linear-to-b from-white to-white/90 shadow-[0_3px_3px_rgba(0,0,0,0.03),0_0.75px_0_rgba(0,0,0,0.05)]",
        "transition-transform duration-200 ease",
        "group-data-[state=checked]:translate-x-[18px] group-data-[state=unchecked]:translate-x-0",
        thumbClassName,
      )}
    >
      <span
        className={cn(
          "size-[7.5px] rounded-full border-[0.375px] border-solid",
          "group-data-[state=unchecked]:border-black/15 group-data-[state=unchecked]:bg-linear-to-t group-data-[state=unchecked]:from-[#f0f0f0] group-data-[state=unchecked]:to-[#dcdcdc]",
          "group-data-[state=checked]:border-blue-600 group-data-[state=checked]:bg-linear-to-t group-data-[state=checked]:from-[#2473fe] group-data-[state=checked]:to-[#0450e2]",
        )}
      />
    </span>
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
