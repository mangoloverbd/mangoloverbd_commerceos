import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { HeaderAlerts } from "./HeaderAlerts";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useOrgName } from "@/hooks/useOrgName";
import { useAuth } from "@/hooks/useAuth";
import { DotsThree, Plus, Sparkle } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";

const accountMenuPanelClass =
    "w-56 overflow-hidden rounded-[14px] border-[1.5px] border-black/[0.07] bg-[#E9E8E5] p-1 text-[#202020] shadow-[0_2px_6px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.7)]";

const accountMenuInnerClass =
    "rounded-[10px] border border-black/[0.05] bg-[#F7F7F6] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)]";

const accountMenuItemClass =
    "flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-black/[0.05] bg-[#FBFBFA] px-2.5 py-2 text-[12px] font-medium text-[#202020]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-colors hover:bg-white hover:text-[#202020] focus:bg-white focus:text-[#202020]";

const routeTitles: Record<string, string> = {
    "/": "Home",
    "/order-extraction": "Extraction",
    "/order-chat": "AI Chat",
    "/products": "Products",
    "/order-analysis": "AI Analysis",
    "/inbox/facebook": "Facebook",
    "/inbox/instagram": "Instagram",
    "/inbox/whatsapp": "WhatsApp",
    "/inbox/orders": "Inbox Orders",
    "/settings": "System Settings",
};

function getRouteTitle(pathname: string) {
    return routeTitles[pathname] ?? "Arc Lab Suite";
}

export function DashboardLayout() {
    const { orgName, isLoading } = useOrgName();
    const { signOut, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const displayName = orgName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account";
    const initials = displayName
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    useEffect(() => {
        if (isLoading) return;
        // Don't redirect if we just completed onboarding (flag set in Onboarding.tsx)
        const justDone = sessionStorage.getItem("onboarding_done");
        const skipped = sessionStorage.getItem("onboarding_skipped");
        if (justDone || skipped) return;
        if (orgName === "") {
            navigate("/onboarding", { replace: true });
        }
    }, [isLoading, orgName, navigate]);

    const needsOnboarding =
        !isLoading &&
        orgName === "" &&
        !sessionStorage.getItem("onboarding_done") &&
        !sessionStorage.getItem("onboarding_skipped");

    if (isLoading || needsOnboarding) {
        return <div className="min-h-screen w-full bg-[#FAFAF8]" />;
    }

    return (
        <SidebarProvider defaultOpen={true}>
            <div className="flex min-h-screen w-full bg-[#DEDEDE] text-[#202020]">
                <AppSidebar />
                <SidebarInset className="flex min-w-0 flex-col bg-transparent">
                    <header className="flex h-[58px] shrink-0 items-center justify-between px-5 text-[#202020]">
                        <h1 className="font-sf-display text-[20px] font-semibold leading-none tracking-normal">
                            {getRouteTitle(location.pathname)}
                        </h1>
                        <div className="flex items-center gap-1.5 text-[#6f6f6f]">
                            <button
                                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 hover:text-black"
                                title="Add"
                                type="button"
                            >
                                <Plus size={24} weight="light" />
                            </button>
                            <button
                                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 hover:text-black"
                                title="Assistant"
                                type="button"
                            >
                                <Sparkle size={24} weight="light" />
                            </button>
                            <button
                                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 hover:text-black"
                                title="More"
                                type="button"
                            >
                                <DotsThree size={24} weight="bold" />
                            </button>

                            <HeaderAlerts />

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="ml-1 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 outline-none" title="Account">
                                        <Avatar className="h-6 w-6 rounded-full">
                                            <AvatarFallback className="rounded-full bg-black text-white text-[10px] font-semibold">
                                                {initials}
                                            </AvatarFallback>
                                        </Avatar>
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    side="bottom"
                                    align="end"
                                    sideOffset={8}
                                    className={accountMenuPanelClass}
                                >
                                    <div className={`${accountMenuInnerClass} px-4 py-3`}>
                                        <p className="truncate text-[10px] font-medium uppercase leading-tight tracking-[0.18em] text-[#7F7F7D]">Account</p>
                                        <p className="mt-1 truncate text-[12px] font-light leading-tight text-[#202020]">{displayName}</p>
                                        <p className="mt-0.5 truncate text-[10px] font-normal leading-tight text-black/45">{user?.email ?? ""}</p>
                                    </div>
                                    <div className="mt-1 space-y-1">
                                        <DropdownMenuItem asChild>
                                            <Link to="/settings" className={accountMenuItemClass}>
                                                <img src="https://img.icons8.com/color/50/apple-settings.png" alt="settings" className="h-4 w-4 shrink-0" />
                                                System Settings
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => signOut()}
                                            className={`${accountMenuItemClass} text-[#9B3D3D] hover:text-[#8E2F2F] focus:text-[#8E2F2F]`}
                                        >
                                            <LogOut size={15} className="shrink-0" />
                                            Sign Out
                                        </DropdownMenuItem>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>
                    <main className="mx-3 mb-3 min-w-0 flex-1 overflow-auto rounded-[18px] border border-black/10 bg-[#DEDEDE] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        <Outlet />
                    </main>
                </SidebarInset>
            </div>
        </SidebarProvider>
    );
}
