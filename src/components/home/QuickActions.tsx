import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { HomeQuickAction } from "./types";

export function QuickActions({ actions }: { actions: HomeQuickAction[] }) {
  if (!actions.length) return null;
  return (
    <nav aria-label="Quick actions" className="relative z-[2] mt-[26px] flex flex-wrap justify-center gap-2.5">
      {actions.map((action) => (
        <Link
          key={action.key}
          to={action.to}
          state={action.state}
          className="flex items-center gap-3 rounded-full border border-[#ECEAE4] bg-white py-2 pl-5 pr-2.5 text-[16px] font-medium text-[#111110] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(17,17,16,0.04),0_8px_24px_rgba(17,17,16,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
        >
          {action.label}
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[14px] font-medium tabular-nums",
              action.tone === "warn" && (action.count ?? 0) > 0 ? "bg-[#FDEFD9] text-[#E0861B]" : "bg-[#F2F1EC] text-[#55534E]",
            )}
          >
            {action.count ?? "—"}
          </span>
        </Link>
      ))}
    </nav>
  );
}
