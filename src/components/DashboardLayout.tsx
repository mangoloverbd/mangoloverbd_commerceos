import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { HeaderAlerts } from "./HeaderAlerts";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useOrgName } from "@/hooks/useOrgName";
import { useAuth } from "@/hooks/useAuth";
import { CaretRight, DotsThree, Gear, Plus, SignOut, Sparkle } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const accountMenuPanelClass =
    "w-56 overflow-hidden rounded-[16px] border-transparent bg-white/80 p-1.5 text-[#202020] shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] backdrop-blur-xl";

const accountMenuInnerClass =
    "rounded-[12px] border-b border-black/[0.06]";

const accountMenuItemClass =
    "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[12.5px] font-medium text-[#202020]/85 transition-colors hover:bg-black/[0.045] focus:bg-black/[0.045] focus:text-[#202020]";

const routeBreadcrumbLabels: Record<string, string> = {
    "/": "Overview",
    "/overview": "Overview",
    "/returns": "Returns",
    "/products": "Products",
    "/customers": "Customers",
    "/order-chat": "AI Chat",
    "/order-analysis": "AI Analysis",
    "/inbox/facebook": "Facebook",
    "/inbox/instagram": "Instagram",
    "/inbox/whatsapp": "WhatsApp",
    "/inbox/orders": "Inbox Orders",
    "/studio": "Studio",
    "/online-store": "Online Store",
    "/billing": "Billing",
    "/settings": "System Settings",
};

function getBreadcrumbLabel(pathname: string) {
    return routeBreadcrumbLabels[pathname] ?? "Overview";
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
            <div className="flex min-h-screen w-full bg-[#dedede] text-[#202020]">
                <AppSidebar />
                <SidebarInset className="flex min-w-0 flex-col bg-transparent">
                    <header className="flex h-[52px] shrink-0 items-center justify-between px-5 text-[#202020]">
                        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center">
                            <div className="flex min-w-0 items-center gap-2 text-[13px] leading-none">
                                <span className="truncate text-[#8a8a88]">Dashboard</span>
                                <CaretRight className="shrink-0 text-[#ababaa]" size={14} weight="light" />
                                <span aria-current="page" className="truncate font-semibold text-[#202020]">
                                    {getBreadcrumbLabel(location.pathname)}
                                </span>
                            </div>
                        </nav>
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
                                    <div className={`${accountMenuInnerClass} px-4 pb-3 pt-2`}>
                                        <p className="truncate text-[10px] font-medium uppercase leading-tight tracking-[0.18em] text-[#7F7F7D]">Account</p>
                                        <p className="mt-1 truncate text-[13px] font-light leading-tight text-[#202020]">{displayName}</p>
                                        <p className="mt-0.5 truncate text-[10px] font-normal leading-tight text-black/45">{user?.email ?? ""}</p>
                                    </div>
                                    <div className="space-y-0.5 px-1 pb-1 pt-1">
                                        <DropdownMenuItem asChild>
                                            <Link to="/settings" className={accountMenuItemClass}>
                                                <Gear weight="light" size={15} className="shrink-0 text-[#202020]/70" />
                                                System Settings
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => signOut()}
                                            className={`${accountMenuItemClass} text-[#9B3D3D] hover:bg-[#9B3D3D]/[0.06] focus:bg-[#9B3D3D]/[0.06] hover:text-[#8E2F2F] focus:text-[#8E2F2F]`}
                                        >
                                            <SignOut weight="light" size={15} className="shrink-0" />
                                            Sign Out
                                        </DropdownMenuItem>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>
                    <main className="mx-3 mb-3 min-w-0 flex-1 overflow-auto rounded-[18px] border border-black/10 bg-[#f3f3f3] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        <Outlet />
                    </main>
                </SidebarInset>
            </div>
        </SidebarProvider>
    );
}
