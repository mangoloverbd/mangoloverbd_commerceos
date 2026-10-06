import { useEffect, useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { HeaderAlerts } from "./HeaderAlerts";
import { SidebarProvider, SidebarInset, readSidebarOpenPreference } from "@/components/ui/sidebar";
import { useOrgName } from "@/hooks/useOrgName";
import { useMe } from "@/hooks/useMe";
import { CaretRight } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileBottomNav } from "./MobileBottomNav";
import { AccountMenuBody, accountMenuPanelClass, useAccountIdentity } from "./AccountMenu";

const routeBreadcrumbLabels: Record<string, string> = {
    "/": "Home",
    "/orders": "Orders",
    "/overview": "Overview",
    "/returns": "Returns",
    "/products": "Products",
    "/customers": "Customers",
    "/order-protection": "Order Protection",
    "/order-extraction": "Extraction",
    "/order-chat": "Ask Edith",
    "/analytics": "Analytics",
    "/reports/staff": "Staff Performance",
    "/reports/business": "Business Report",
    "/campaign-links": "Campaign Links",
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
    if (pathname.startsWith('/campaign-links/')) return 'Campaign Link';
    return routeBreadcrumbLabels[pathname] ?? "Overview";
}

export function DashboardLayout() {
    const { orgName, isLoading, isError, hasData } = useOrgName();
    const { data: me } = useMe();
    const navigate = useNavigate();
    const location = useLocation();

    const { initials } = useAccountIdentity();
    const mainRef = useRef<HTMLElement>(null);

    useLayoutEffect(() => {
        window.scrollTo(0, 0);
        mainRef.current?.scrollTo?.({ top: 0 });
    }, [location.pathname]);

    useEffect(() => {
        if (isLoading) return;
        // Only redirect when we positively know this is an admin whose
        // workspace has no name. Never redirect on auth errors / 401s or
        // before /api/me has resolved — a transient token expiry must not
        // look like "needs onboarding".
        if (isError || !hasData) return;
        if (!me || me.isAdmin !== true) return;
        // Don't redirect if we just completed onboarding (flag set in Onboarding.tsx)
        const justDone = sessionStorage.getItem("onboarding_done");
        const skipped = sessionStorage.getItem("onboarding_skipped");
        if (justDone || skipped) return;
        if (orgName === "") {
            navigate("/onboarding", { replace: true });
        }
    }, [isLoading, isError, hasData, me, orgName, navigate]);

    // Same guard for the render gate: a missing/errored /api/me response
    // renders the dashboard (it will retry) instead of blank-screening or
    // bouncing to onboarding.
    const needsOnboarding =
        !isLoading &&
        !isError &&
        hasData &&
        !!me &&
        me.isAdmin === true &&
        orgName === "" &&
        !sessionStorage.getItem("onboarding_done") &&
        !sessionStorage.getItem("onboarding_skipped");

    if (isLoading || needsOnboarding) {
        return <div className="min-h-screen w-full bg-[#FAFAF8]" />;
    }

    return (
        <SidebarProvider defaultOpen={readSidebarOpenPreference(true)}>
            <div data-dashboard-shell className="flex min-h-screen w-full bg-[#f4f3f1] text-[#202020]">
                <AppSidebar />
                <SidebarInset className="flex min-w-0 flex-col bg-transparent">
                    <header className="flex h-[44px] shrink-0 items-center justify-between px-5 text-[#202020]">
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
                            <HeaderAlerts />

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="ml-1 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 outline-none md:hidden" title="Account">
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
                                    <AccountMenuBody />
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>
                    <main ref={mainRef} className="isolate mx-3 mb-3 min-w-0 flex-1 overflow-auto rounded-[18px] border border-black/10 bg-[#f3f3f3] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] max-md:pb-16">
                        <Outlet />
                    </main>
                </SidebarInset>
                <MobileBottomNav />
            </div>
        </SidebarProvider>
    );
}
