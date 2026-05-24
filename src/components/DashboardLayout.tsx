import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useOrgName } from "@/hooks/useOrgName";
import { DotsThree, Plus, Sparkle } from "@phosphor-icons/react";

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
    "/settings": "Settings",
};

function getRouteTitle(pathname: string) {
    return routeTitles[pathname] ?? "Seraphine";
}

export function DashboardLayout() {
    const { orgName, isLoading } = useOrgName();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (!isLoading && orgName === "" && !sessionStorage.getItem("onboarding_skipped")) {
            navigate("/onboarding", { replace: true });
        }
    }, [isLoading, orgName, navigate]);

    return (
        <SidebarProvider defaultOpen={true}>
            <div className="flex min-h-screen w-full bg-[#dedede] text-[#202020]">
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
                                <Plus size={20} weight="light" />
                            </button>
                            <button
                                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 hover:text-black"
                                title="Assistant"
                                type="button"
                            >
                                <Sparkle size={19} weight="light" />
                            </button>
                            <button
                                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 hover:text-black"
                                title="More"
                                type="button"
                            >
                                <DotsThree size={23} weight="bold" />
                            </button>
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
