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
                    className="px-2 py-1"
                >
                    {/* Section label */}
                    {!isCollapsed && section.label && (
                        <SidebarGroupLabel className="mb-1 h-auto px-2 py-1 text-[14px] font-medium tracking-normal text-[#9a9a9a]">
                            {section.label}
                        </SidebarGroupLabel>
                    )}

                    {isCollapsed && section.label && (
                        <div className="flex justify-center py-1 mb-0.5">
                            <div className="h-px w-4 rounded-full bg-black/10" />
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
                                                    "mx-auto flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                                                    isActive
                                                        ? "bg-black/8 text-[#222]"
                                                        : "text-[#6f6f6f] hover:bg-black/5 hover:text-[#222]"
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
                                                                "h-10 rounded-lg px-3 gap-3 text-[16px] transition-all",
                                                                isActive
                                                                    ? "bg-black/7 text-[#222] font-semibold"
                                                                    : "text-[#5f5f5f] hover:bg-black/5 hover:text-[#222]"
                                                            )}
                                                        >
                                                            <span className={cn(
                                                                "shrink-0 transition-colors",
                                                                isActive ? "text-[#222]" : "text-[#777]"
                                                            )}>
                                                                {route.icon}
                                                            </span>
                                                            <span className="font-medium">{route.title}</span>
                                                            <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                        </SidebarMenuButton>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <SidebarMenuSub className="ml-7 mt-1 gap-0.5 border-l border-black/10 pl-2">
                                                            {route.subs?.map((sub) => {
                                                                const subActive = location.pathname === sub.link;
                                                                return (
                                                                    <SidebarMenuSubItem key={sub.title}>
                                                                        <SidebarMenuSubButton
                                                                            asChild
                                                                            className={cn(
                                                                                "h-8 rounded-md text-[13px] transition-all",
                                                                                subActive
                                                                                    ? "bg-black/7 text-[#222] font-medium"
                                                                                    : "text-[#666] hover:bg-black/5 hover:text-[#222]"
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
                                                        "h-10 rounded-lg px-3 gap-3 text-[16px] transition-all",
                                                        isActive
                                                            ? "bg-black/7 text-[#222] font-semibold"
                                                            : "text-[#5f5f5f] hover:bg-black/5 hover:text-[#222]"
                                                    )}
                                                >
                                                    <Link to={route.link} className="flex items-center gap-2.5">
                                                        <span className={cn(
                                                            "shrink-0 transition-colors",
                                                            isActive ? "text-[#222]" : "text-[#777]"
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
