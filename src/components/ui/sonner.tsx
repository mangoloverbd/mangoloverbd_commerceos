import { Toaster as Sonner } from "sonner";

export { toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-right"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: [
            // Base card — macOS widget feel
            "group flex w-full items-start gap-3",
            "rounded-2xl bg-white px-4 py-3.5",
            // Layered shadow: outer grey rim + inner glow
            "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_24px_-4px_rgba(0,0,0,0.10),0_1px_0_rgba(255,255,255,0.9)_inset]",
            "min-w-[280px] max-w-[360px]",
            "font-[system-ui,-apple-system,'SF Pro Text','Inter',sans-serif]",
          ].join(" "),
          title: "text-[13px] font-semibold leading-snug text-[#1d1d1f] tracking-[-0.01em]",
          description: "text-[12px] font-normal leading-relaxed text-[#86868b] mt-0.5",
          success: [
            "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_24px_-4px_rgba(0,0,0,0.10),0_1px_0_rgba(255,255,255,0.9)_inset]",
          ].join(" "),
          error: [
            "shadow-[0_0_0_1px_rgba(255,59,48,0.12),0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_24px_-4px_rgba(0,0,0,0.10),0_1px_0_rgba(255,255,255,0.9)_inset]",
          ].join(" "),
          warning: [
            "shadow-[0_0_0_1px_rgba(255,149,0,0.15),0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_24px_-4px_rgba(0,0,0,0.10),0_1px_0_rgba(255,255,255,0.9)_inset]",
          ].join(" "),
          icon: "mt-0.5 shrink-0",
          actionButton: "mt-3 flex h-7 items-center rounded-lg bg-[#1d1d1f] px-3 text-[11px] font-semibold text-white transition-opacity hover:opacity-80",
          cancelButton: "mt-3 flex h-7 items-center rounded-lg border border-black/[0.08] bg-black/[0.04] px-3 text-[11px] font-medium text-[#86868b] transition-colors hover:text-[#1d1d1f]",
          closeButton: "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-black/[0.05] text-[#86868b] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/[0.09]",
        },
      }}
      icons={{
        success: (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#34C759]/[0.12]">
            <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
              <path d="M2 5.5L4 7.5L8 3" stroke="#34C759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        ),
        error: (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FF3B30]/[0.10]">
            <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
              <path d="M5 3V5.5M5 7H5.01" stroke="#FF3B30" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
        ),
        warning: (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FF9500]/[0.10]">
            <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
              <path d="M5 3V5.5M5 7H5.01" stroke="#FF9500" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
        ),
        info: (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0071E3]/[0.10]">
            <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
              <path d="M5 4.5V7M5 3H5.01" stroke="#0071E3" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
        ),
        loading: (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <svg className="h-4 w-4 animate-spin text-[#86868b]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"/>
              <path className="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </span>
        ),
      }}
      {...props}
    />
  );
};

export { Toaster };
