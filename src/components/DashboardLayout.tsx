import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
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

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="ml-1 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 outline-none" title="Account">
                                        <Avatar className="h-7 w-7 rounded-full">
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
                                    className="w-56 rounded-xl border border-black/[0.08] bg-white p-0 shadow-xl shadow-black/[0.08]"
                                >
                                    <div className="px-4 pt-3.5 pb-3 border-b border-black/[0.06]">
                                        <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{displayName}</p>
                                        <p className="text-[10px] text-muted-foreground font-normal truncate mt-0.5 leading-tight">{user?.email ?? ""}</p>
                                    </div>
                                    <div className="p-1.5">
                                        <DropdownMenuItem asChild>
                                            <Link to="/settings" className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-[12px] font-medium text-foreground/80 hover:bg-black/[0.04] hover:text-foreground transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
                                                Settings
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => signOut()}
                                            className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-[12px] font-medium text-red-500 hover:bg-red-50 hover:text-red-600 focus:bg-red-50 focus:text-red-600 transition-colors mt-0.5"
                                        >
                                            <LogOut size={13} className="shrink-0" />
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
