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
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
    Receipt,
    ArrowSquareIn,
    ChatTeardropDots,
    Package,
    ChartLineUp,
    GearSix,
    Question,
    SignOut,
    UserCircle,
    CaretUpDown,
    PaperPlaneTilt,
    Lightbulb,
    FacebookLogo,
    InstagramLogo,
    WhatsappLogo,
    ClipboardText,
} from "@phosphor-icons/react";
import { Logo } from "./logo";
import type { NavSection } from "./nav-main";
import DashboardNavigation from "./nav-main";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useOrgName } from "@/hooks/useOrgName";
import { Link } from "react-router-dom";

export function AppSidebar() {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";
    const { isAdmin, loading: roleLoading } = useUserRole();
    const { signOut, user } = useAuth();
    const { orgName, isLoading: orgLoading } = useOrgName();

    const navSections = useMemo((): NavSection[] => {
        const iconCls = "shrink-0 text-foreground group-hover:text-foreground transition-colors";

        const product: NavSection = {
            label: "",
            routes: [
                {
                    id: "orders",
                    title: "All Orders",
                    icon: <Receipt size={15} weight="light" className={iconCls} />,
                    link: "/",
                },
                {
                    id: "order-extraction",
                    title: "Extraction",
                    icon: <ArrowSquareIn size={15} weight="light" className={iconCls} />,
                    link: "/order-extraction",
                },
                {
                    id: "order-chat",
                    title: "AI Chat",
                    icon: <ChatTeardropDots size={15} weight="light" className={iconCls} />,
                    link: "/order-chat",
                },
                {
                    id: "products",
                    title: "Products",
                    icon: <Package size={15} weight="light" className={iconCls} />,
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
                    icon: <ChartLineUp size={15} weight="light" className={iconCls} />,
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
                    icon: <FacebookLogo size={15} weight="fill" className={cn(iconCls, "text-[#1877F2]/70 group-hover:text-[#1877F2]")} />,
                    link: "/inbox/facebook",
                },
                {
                    id: "inbox-instagram",
                    title: "Instagram",
                    icon: <InstagramLogo size={15} weight="fill" className={cn(iconCls, "text-[#E1306C]/70 group-hover:text-[#E1306C]")} />,
                    link: "/inbox/instagram",
                },
                {
                    id: "inbox-whatsapp",
                    title: "WhatsApp",
                    icon: <WhatsappLogo size={15} weight="fill" className={cn(iconCls, "text-[#25D366]/70 group-hover:text-[#25D366]")} />,
                    link: "/inbox/whatsapp",
                },
                {
                    id: "inbox-orders",
                    title: "Inbox Orders",
                    icon: <ClipboardText size={15} weight="light" className={iconCls} />,
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
                    icon: <GearSix size={15} weight="light" className={iconCls} />,
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

    return (
        <Sidebar collapsible="icon" className="border-r border-sidebar-border">
            {/* Brand header */}
            <SidebarHeader className={cn(
                "border-b border-sidebar-border",
                isCollapsed ? "px-0 py-3 items-center justify-center" : "px-4 py-4"
            )}>
                <div className={cn("flex items-center min-w-0", isCollapsed ? "justify-center" : "justify-between")}>
                    <motion.a
                        href="#"
                        className={cn("flex items-center gap-3 min-w-0 group", isCollapsed && "justify-center")}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <Logo className={cn("shrink-0 transition-opacity group-hover:opacity-80", isCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                        {!isCollapsed && (
                            <div className="min-w-0">
                                {orgLoading ? (
                                    <div className="h-2.5 w-20 bg-foreground/10 animate-pulse mb-1.5" />
                                ) : (
                                    <span className="block text-[10px] font-medium tracking-[0.3em] text-foreground uppercase truncate">
                                        {orgName || "My Organisation"}
                                    </span>
                                )}
                                <span className="block text-[7px] tracking-[0.08em] text-foreground uppercase whitespace-nowrap">
                                    Arc Lab Technology
                                </span>
                            </div>
                        )}
                    </motion.a>
                    {!isCollapsed && (
                        <SidebarTrigger
                            className="text-foreground hover:text-foreground transition-colors shrink-0"
                            data-testid="button-sidebar-toggle"
                        />
                    )}
                </div>
                {isCollapsed && (
                    <SidebarTrigger
                        className="text-foreground hover:text-foreground transition-colors mt-2"
                        data-testid="button-sidebar-toggle-collapsed"
                    />
                )}
            </SidebarHeader>

            {/* Navigation */}
            <SidebarContent className="py-3 px-0 gap-0">
                <DashboardNavigation sections={navSections} />
            </SidebarContent>

            {/* Footer */}
            <SidebarFooter className={cn(
                "border-t border-sidebar-border gap-0 p-0",
            )}>
                {/* Quick links */}
                {!isCollapsed ? (
                    <div className="px-4 py-2 border-b border-sidebar-border space-y-0">
                        <Link
                            to="#"
                            className="flex items-center gap-3 py-1.5 text-[11px] text-foreground/60 hover:text-foreground transition-colors"
                        >
                            <PaperPlaneTilt size={13} weight="regular" className="shrink-0" />
                            Feedback
                        </Link>
                        <Link
                            to="#"
                            className="flex items-center gap-3 py-1.5 text-[11px] text-foreground/60 hover:text-foreground transition-colors"
                            data-testid="link-help-center"
                        >
                            <Question size={13} weight="regular" className="shrink-0" />
                            Help Center
                        </Link>
                        <Link
                            to="#"
                            className="flex items-center gap-3 py-1.5 text-[11px] text-foreground/60 hover:text-foreground transition-colors"
                        >
                            <Lightbulb size={13} weight="regular" className="shrink-0" />
                            Request a Feature
                        </Link>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-1 py-2 border-b border-sidebar-border">
                        <a href="#" className="p-1.5 text-foreground/60 hover:text-foreground transition-colors" title="Feedback">
                            <PaperPlaneTilt size={14} weight="regular" />
                        </a>
                        <a href="#" className="p-1.5 text-foreground/60 hover:text-foreground transition-colors" title="Help Center">
                            <Question size={14} weight="regular" />
                        </a>
                        <a href="#" className="p-1.5 text-foreground/60 hover:text-foreground transition-colors" title="Request a Feature">
                            <Lightbulb size={14} weight="regular" />
                        </a>
                    </div>
                )}

                {/* User row — opens Sign Out dropdown */}
                <div className={cn(isCollapsed ? "flex justify-center py-2 border-b border-sidebar-border" : "px-3 py-2 border-b border-sidebar-border")}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            {!isCollapsed ? (
                                <button className="flex w-full items-center gap-2.5 rounded-sm px-1 py-1.5 hover:bg-sidebar-accent transition-colors outline-none group">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
                                        <UserCircle size={16} weight="fill" />
                                    </div>
                                    {orgLoading ? (
                                        <div className="flex-1 h-2.5 w-24 bg-foreground/10 animate-pulse rounded-sm" />
                                    ) : (
                                        <span className="flex-1 text-left text-[11px] font-medium text-foreground truncate">
                                            {orgName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account"}
                                        </span>
                                    )}
                                    <CaretUpDown size={11} className="shrink-0 text-foreground/40 group-hover:text-foreground/70 transition-colors" />
                                </button>
                            ) : (
                                <button
                                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-sidebar-accent transition-colors outline-none text-foreground"
                                    title="Account"
                                >
                                    <UserCircle size={16} weight="fill" />
                                </button>
                            )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            side="top"
                            align={isCollapsed ? "center" : "start"}
                            sideOffset={8}
                            className="w-52"
                        >
                            <DropdownMenuLabel className="pb-1">
                                <p className="text-[10px] font-medium truncate text-foreground">{user?.email ?? "Account"}</p>
                                <p className="text-[9px] text-muted-foreground font-normal tracking-wide">{orgName || "Arc Lab Technology"}</p>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => signOut()}
                                className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                                data-testid="button-sign-out"
                            >
                                <SignOut size={13} weight="regular" className="shrink-0" />
                                <span className="text-[11px] tracking-wide">Sign Out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Copyright */}
                {!isCollapsed && (
                    <p className="px-4 py-2 text-[8px] tracking-[0.12em] text-foreground/40 uppercase">
                        © 2026 Arc Lab Technology
                    </p>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
