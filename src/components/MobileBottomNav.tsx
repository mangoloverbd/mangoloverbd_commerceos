import { NavLink } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import { House, ClipboardText, ChatCircle, Package, DotsThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const destinations = [
  { label: "Home", to: "/overview", icon: House },
  { label: "Orders", to: "/", icon: ClipboardText },
  { label: "Inbox", to: "/inbox/facebook", icon: ChatCircle },
  { label: "Products", to: "/products", icon: Package },
] as const;

export function MobileBottomNav() {
  const { toggleSidebar } = useSidebar();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-[#dedede]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex h-14 max-w-md items-stretch justify-around">
        {destinations.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={label}
            to={to}
            end={to === "/"}
            className={({ isActive }) => cn(
              "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium transition-colors",
              isActive ? "text-black" : "text-black/45 hover:text-black/75",
            )}
          >
            {({ isActive }) => (
              <>
                <Icon weight="light" size={21} aria-hidden="true" />
                <span>{label}</span>
                {isActive && <span className="h-0.5 w-4 rounded-full bg-black" aria-hidden="true" />}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          aria-label="More"
          onClick={toggleSidebar}
          className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium text-black/45 transition-colors hover:text-black/75"
        >
          <DotsThree weight="light" size={22} aria-hidden="true" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
