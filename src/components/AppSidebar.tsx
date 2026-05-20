"use client";

import { useMemo } from "react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
    ArrowSquareIn,
    ChatTeardropDots,
    Package,
    ChartLineUp,
    GearSix,
    Question,
    SignOut,
    CaretUpDown,
    PaperPlaneTilt,
    Lightbulb,
    FacebookLogo,
    InstagramLogo,
    WhatsappLogo,
    ClipboardText,
    House,
} from "@phosphor-icons/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "./logo";
import type { NavSection } from "./nav-main";
import DashboardNavigation from "./nav-main";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useOrgName } from "@/hooks/useOrgName";
import { Link } from "react-router-dom";

export function AppSidebar() {
    const { state, toggleSidebar } = useSidebar();
    const isCollapsed = state === "collapsed";
    const { isAdmin } = useUserRole();
    const { signOut, user } = useAuth();
    const { orgName, isLoading: orgLoading } = useOrgName();

    const iconCls = "shrink-0 transition-colors";

    const navSections = useMemo((): NavSection[] => {
        const product: NavSection = {
            label: "",
            routes: [
                {
                    id: "orders",
                    title: "Home",
                    icon: <House size={17} weight="light" className={iconCls} />,
                    link: "/",
                },
                {
                    id: "order-extraction",
                    title: "Extraction",
                    icon: <ArrowSquareIn size={17} weight="light" className={iconCls} />,
                    link: "/order-extraction",
                },
                {
                    id: "order-chat",
                    title: "AI Chat",
                    icon: <ChatTeardropDots size={17} weight="light" className={iconCls} />,
                    link: "/order-chat",
                },
                {
                    id: "products",
                    title: "Products",
                    icon: <Package size={17} weight="light" className={iconCls} />,
                    link: "/products",
                },
            ],
        };

        const workspace: NavSection = {
            label: "Intelligence",
            routes: [
                {
                    id: "order-analysis",
                    title: "AI Analysis",
                    icon: <ChartLineUp size={17} weight="light" className={iconCls} />,
                    link: "/order-analysis",
                },
            ],
        };

        const socialInbox: NavSection = {
            label: "Social Inbox",
            routes: [
                {
                    id: "inbox-facebook",
                    title: "Facebook",
                    icon: <FacebookLogo size={17} weight="fill" className={cn(iconCls, "text-[#1877F2]/70")} />,
                    link: "/inbox/facebook",
                },
                {
                    id: "inbox-instagram",
                    title: "Instagram",
                    icon: <InstagramLogo size={17} weight="fill" className={cn(iconCls, "text-[#E1306C]/70")} />,
                    link: "/inbox/instagram",
                },
                {
                    id: "inbox-whatsapp",
                    title: "WhatsApp",
                    icon: <WhatsappLogo size={17} weight="fill" className={cn(iconCls, "text-[#25D366]/70")} />,
                    link: "/inbox/whatsapp",
                },
                {
                    id: "inbox-orders",
                    title: "Inbox Orders",
                    icon: <ClipboardText size={17} weight="light" className={iconCls} />,
                    link: "/inbox/orders",
                },
            ],
        };

        const administration: NavSection = {
            label: "System",
            routes: [
                {
                    id: "settings",
                    title: "Settings",
                    icon: <GearSix size={17} weight="light" className={iconCls} />,
                    link: "/settings",
                },
            ],
        };

        const sections = [product];
        if (workspace.routes.length > 0) sections.push(workspace);
        sections.push(socialInbox);
        sections.push(administration);
        return sections;
    }, []);

    // Derive initials for avatar
    const displayName = orgName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account";
    const initials = displayName
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    return (
        <Sidebar collapsible="icon" className="border-r-0 bg-[#dedede]">
            {/* ── Brand header ────────────────────────────── */}
            <SidebarHeader className="h-[58px] justify-center px-3">
                <div className="flex items-center justify-between min-w-0">
                    {!isCollapsed && (
                        <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                        </div>
                    )}
                    {/* Logo + name */}
                    <Link
                        to="/"
                        className={cn(
                            "flex min-w-0 items-center gap-2.5 group",
                            isCollapsed ? "justify-center w-full" : "hidden"
                        )}
                    >
                        <div className="shrink-0 h-7 w-7 rounded-lg bg-black/[0.06] flex items-center justify-center group-hover:bg-black/10 transition-colors">
                            <Logo className="h-4 w-4" />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0 flex-1">
                                {orgLoading ? (
                                    <div className="h-2.5 w-20 rounded bg-sidebar-foreground/10 animate-pulse mb-1" />
                                ) : (
                                    <p className="text-[11px] font-semibold text-sidebar-foreground truncate leading-none">
                                        {orgName || "My Organisation"}
                                    </p>
                                )}
                                <p className="text-[9px] text-sidebar-foreground/40 mt-0.5 leading-none">
                                    Arc Lab Technology
                                </p>
                            </div>
                        )}
                    </Link>

                    {/* Collapse toggle */}
                    {!isCollapsed && (
                        <button
                            onClick={toggleSidebar}
                            className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[#777] hover:text-black hover:bg-black/5 transition-colors"
                            data-testid="button-sidebar-toggle"
                            title="Collapse sidebar"
                        >
                            <PanelLeftClose className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* Expand button when collapsed */}
                {isCollapsed && (
                    <button
                        onClick={toggleSidebar}
                        className="mt-1.5 h-7 w-full rounded-full flex items-center justify-center text-[#777] hover:text-black hover:bg-black/5 transition-colors"
                        data-testid="button-sidebar-toggle-collapsed"
                        title="Expand sidebar"
                    >
                        <PanelLeftOpen className="h-3.5 w-3.5" />
                    </button>
                )}
            </SidebarHeader>

            {/* ── Navigation ──────────────────────────────── */}
            <SidebarContent className="gap-0 overflow-x-hidden px-1 pb-3 pt-2">
                <DashboardNavigation sections={navSections} />
            </SidebarContent>

            {/* ── Footer ──────────────────────────────────── */}
            <SidebarFooter className="border-t-0 p-2">

                {/* Quick links — hidden when collapsed */}
                {!isCollapsed && (
                    <div className="mb-2 rounded-lg bg-black/[0.045] px-3 py-3">
                        <p className="mb-1.5 px-1 text-[13px] font-medium text-[#9a9a9a]">
                            Support
                        </p>
                        {[
                            { icon: PaperPlaneTilt, label: "Feedback" },
                            { icon: Question, label: "Help Center", testid: "link-help-center" },
                            { icon: Lightbulb, label: "Request a Feature" },
                        ].map(({ icon: Icon, label, testid }) => (
                            <Link
                                key={label}
                                to="#"
                                data-testid={testid}
                                className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-[13px] font-medium text-[#666] transition-colors hover:bg-black/5 hover:text-black"
                            >
                                <Icon size={13} weight="regular" className="shrink-0" />
                                {label}
                            </Link>
                        ))}
                    </div>
                )}

                {/* Collapsed quick links */}
                {isCollapsed && (
                    <div className="flex flex-col items-center gap-0.5 py-2">
                        {[
                            { icon: PaperPlaneTilt, label: "Feedback" },
                            { icon: Question, label: "Help Center" },
                            { icon: Lightbulb, label: "Feature Request" },
                        ].map(({ icon: Icon, label }) => (
                            <Link
                                key={label}
                                to="#"
                                title={label}
                                className="h-7 w-7 rounded-full flex items-center justify-center text-[#777] hover:text-black hover:bg-black/5 transition-colors"
                            >
                                <Icon size={14} weight="regular" />
                            </Link>
                        ))}
                    </div>
                )}

                {/* User row */}
                <div className={cn("p-2", isCollapsed && "flex justify-center")}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            {!isCollapsed ? (
                                <button className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-black/5 transition-colors outline-none group">
                                    <Avatar className="h-7 w-7 shrink-0 rounded-lg">
                                        <AvatarFallback className="rounded-lg bg-black/10 text-[#333] text-[10px] font-semibold">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0 text-left">
                                        {orgLoading ? (
                                            <div className="h-2.5 w-20 rounded bg-sidebar-foreground/10 animate-pulse" />
                                        ) : (
                                            <p className="text-[13px] font-medium text-[#333] truncate leading-tight">
                                                {displayName}
                                            </p>
                                        )}
                                        <p className="text-[11px] text-[#8a8a8a] truncate leading-tight mt-0.5">
                                            {user?.email ?? ""}
                                        </p>
                                    </div>
                                    <CaretUpDown size={12} className="shrink-0 text-[#888] group-hover:text-[#444] transition-colors" />
                                </button>
                            ) : (
                                <button
                                    className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors outline-none"
                                    title="Account"
                                >
                                    <Avatar className="h-7 w-7 rounded-lg">
                                        <AvatarFallback className="rounded-lg bg-black/10 text-[#333] text-[10px] font-semibold">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                </button>
                            )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            side="top"
                            align={isCollapsed ? "center" : "start"}
                            sideOffset={8}
                            className="w-56"
                        >
                            <DropdownMenuLabel className="pb-1.5">
                                <div className="flex items-center gap-2.5">
                                    <Avatar className="h-8 w-8 rounded-lg shrink-0">
                                        <AvatarFallback className="rounded-lg bg-muted text-[11px] font-semibold">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold truncate">{displayName}</p>
                                        <p className="text-[10px] text-muted-foreground font-normal truncate">{user?.email ?? ""}</p>
                                    </div>
                                </div>
                            </DropdownMenuLabel>

                            {isAdmin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link to="/settings" className="flex items-center gap-2 cursor-pointer text-[11px]">
                                            <GearSix size={13} weight="regular" className="shrink-0" />
                                            Settings
                                        </Link>
                                    </DropdownMenuItem>
                                </>
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => signOut()}
                                className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive text-[11px]"
                                data-testid="button-sign-out"
                            >
                                <SignOut size={13} weight="regular" className="shrink-0" />
                                Sign Out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Copyright */}
                {!isCollapsed && (
                    <p className="px-4 pb-2 text-[9px] text-sidebar-foreground/25">
                        © 2026 Arc Lab Technology
                    </p>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
