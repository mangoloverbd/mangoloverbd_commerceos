"use client";

import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from "@/components/ui/sidebar";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface Route {
    id: string;
    title: string;
    icon: ReactNode;
    link: string;
    subs?: {
        title: string;
        link: string;
        icon?: ReactNode;
    }[];
}

export interface NavSection {
    label: string;
    routes: Route[];
}

export default function DashboardNavigation({ sections }: { sections: NavSection[] }) {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";
    const location = useLocation();

    return (
        <>
            {sections.map((section) => (
                <SidebarGroup
                    key={section.label || section.routes[0]?.id}
                    className="py-1 px-2"
                >
                    {/* Section label */}
                    {!isCollapsed && section.label && (
                        <SidebarGroupLabel className="text-[9px] font-semibold tracking-widest text-sidebar-foreground/35 uppercase px-2 py-1 h-auto mb-0.5">
                            {section.label}
                        </SidebarGroupLabel>
                    )}

                    {isCollapsed && section.label && (
                        <div className="flex justify-center py-1 mb-0.5">
                            <div className="h-px w-4 bg-sidebar-border rounded-full" />
                        </div>
                    )}

                    <SidebarGroupContent>
                        <SidebarMenu className="gap-0.5">
                            {section.routes.map((route) => {
                                const isActive = location.pathname === route.link;
                                const hasSubs = route.subs && route.subs.length > 0;

                                // ── Collapsed view ───────────────────────
                                if (isCollapsed) {
                                    return (
                                        <SidebarMenuItem key={route.id}>
                                            <SidebarMenuButton
                                                asChild
                                                tooltip={route.title}
                                                className={cn(
                                                    "h-8 w-8 rounded-lg flex items-center justify-center mx-auto transition-all",
                                                    isActive
                                                        ? "bg-sidebar-accent text-sidebar-foreground shadow-sm"
                                                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                                                )}
                                            >
                                                <Link to={route.link} className="flex items-center justify-center w-full h-full">
                                                    {route.icon}
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                }

                                // ── Expanded view ────────────────────────
                                return (
                                    <Collapsible
                                        key={route.id}
                                        asChild
                                        className="group/collapsible"
                                        defaultOpen={false}
                                    >
                                        <SidebarMenuItem>
                                            {hasSubs ? (
                                                <>
                                                    <CollapsibleTrigger asChild>
                                                        <SidebarMenuButton
                                                            tooltip={route.title}
                                                            className={cn(
                                                                "h-8 rounded-lg px-2.5 gap-2.5 transition-all text-[12px]",
                                                                isActive
                                                                    ? "bg-sidebar-accent text-sidebar-foreground font-medium shadow-sm"
                                                                    : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                                                            )}
                                                        >
                                                            <span className={cn(
                                                                "shrink-0 transition-colors",
                                                                isActive ? "text-sidebar-foreground" : "text-sidebar-foreground/50"
                                                            )}>
                                                                {route.icon}
                                                            </span>
                                                            <span className="font-medium">{route.title}</span>
                                                            <ChevronRight className="ml-auto h-3 w-3 opacity-40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                        </SidebarMenuButton>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <SidebarMenuSub className="ml-6 mt-0.5 border-l border-sidebar-border pl-2 gap-0.5">
                                                            {route.subs?.map((sub) => {
                                                                const subActive = location.pathname === sub.link;
                                                                return (
                                                                    <SidebarMenuSubItem key={sub.title}>
                                                                        <SidebarMenuSubButton
                                                                            asChild
                                                                            className={cn(
                                                                                "h-7 rounded-md text-[11px] transition-all",
                                                                                subActive
                                                                                    ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                                                                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                                                                            )}
                                                                        >
                                                                            <Link to={sub.link} className="flex items-center gap-2">
                                                                                {sub.icon && (
                                                                                    <span className="shrink-0">{sub.icon}</span>
                                                                                )}
                                                                                {sub.title}
                                                                            </Link>
                                                                        </SidebarMenuSubButton>
                                                                    </SidebarMenuSubItem>
                                                                );
                                                            })}
                                                        </SidebarMenuSub>
                                                    </CollapsibleContent>
                                                </>
                                            ) : (
                                                <SidebarMenuButton
                                                    asChild
                                                    tooltip={route.title}
                                                    className={cn(
                                                        "h-8 rounded-lg px-2.5 gap-2.5 transition-all text-[12px]",
                                                        isActive
                                                            ? "bg-sidebar-accent text-sidebar-foreground font-medium shadow-sm"
                                                            : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                                                    )}
                                                >
                                                    <Link to={route.link} className="flex items-center gap-2.5">
                                                        <span className={cn(
                                                            "shrink-0 transition-colors",
                                                            isActive ? "text-sidebar-foreground" : "text-sidebar-foreground/50"
                                                        )}>
                                                            {route.icon}
                                                        </span>
                                                        <span className="font-medium">{route.title}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            )}
                                        </SidebarMenuItem>
                                    </Collapsible>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            ))}
        </>
    );
}
