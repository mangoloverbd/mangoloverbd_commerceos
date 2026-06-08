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
import { ChevronRight, Lock } from "lucide-react";
import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface Route {
    id: string;
    title: string;
    icon: ReactNode;
    link: string;
    disabled?: boolean;
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

function SidebarLabel({ text, active }: { text: string; active?: boolean }) {
    return (
        <span className={cn(
            "block truncate font-sf-text text-[12.5px] normal-case tracking-normal min-w-0",
            active ? "font-semibold text-[#1a1a1a]" : "font-medium text-[#999]"
        )}>
            {text}
        </span>
    );
}

const navIconFrame =
    "flex h-[15px] w-[15px] shrink-0 items-center justify-center [&>img]:h-[15px] [&>img]:w-[15px] [&>img]:object-contain [&>svg]:h-[15px] [&>svg]:w-[15px]";

const activeIconStyle = { "--fillg": "#1a1a1a" } as React.CSSProperties;
const inactiveIconStyle = { "--fillg": "#999999" } as React.CSSProperties;

const navIconMotion =
    "transform-gpu transition-all duration-300 ease-out group-hover/nav-link:-translate-y-0.5 group-hover/nav-link:-rotate-6 group-hover/nav-link:scale-125 group-hover/nav-link:text-[#1a1a1a] group-hover/nav-button:-translate-y-0.5 group-hover/nav-button:-rotate-6 group-hover/nav-button:scale-125 group-hover/nav-button:text-[#1a1a1a]";

export default function DashboardNavigation({ sections }: { sections: NavSection[] }) {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";
    const location = useLocation();

    return (
        <>
            {sections.map((section) => (
                <SidebarGroup
                    key={section.label || section.routes[0]?.id}
                    className="px-1.5 py-0.5"
                >
                    {/* Section label */}
                    {!isCollapsed && section.label && (
                        <SidebarGroupLabel className="mb-0 h-auto px-2 py-0.5 font-sf-text text-[11px] font-medium normal-case tracking-normal text-[#4a4a4a]">
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
                                    if (route.disabled) {
                                        return (
                                            <SidebarMenuItem key={route.id}>
                                                <SidebarMenuButton
                                                    tooltip={`${route.title} (Admin only)`}
                                                    className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg transition-all text-[#bbb] cursor-not-allowed opacity-50 pointer-events-none"
                                                    disabled
                                                >
                                                    <span className={cn(navIconFrame)}>
                                                        {route.icon}
                                                    </span>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        );
                                    }
                                    return (
                                        <SidebarMenuItem key={route.id}>
                                            <SidebarMenuButton
                                                asChild
                                                tooltip={route.title}
                                                className={cn(
                                                    "mx-auto flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                                                    isActive
                                                        ? "bg-white border border-[#C0C0C0] rounded-lg text-[#1a1a1a]"
                                                        : "text-[#999] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                )}
                                            >
                                                <Link to={route.link} className="group/nav-link flex h-full w-full items-center justify-center">
                                                    <span className={cn(
                                                        navIconFrame,
                                                        "transform-gpu transition-all duration-300 ease-out group-hover/nav-link:-translate-y-0.5 group-hover/nav-link:-rotate-6 group-hover/nav-link:scale-125 group-hover/nav-link:text-[#1a1a1a]"
                                                    )} style={isActive ? activeIconStyle : inactiveIconStyle}>
                                                        {route.icon}
                                                    </span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                }

                                // ── Expanded view ────────────────────────
                                if (route.disabled) {
                                    return (
                                        <SidebarMenuItem key={route.id}>
                                            <div
                                                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 text-[#bbb] cursor-not-allowed select-none opacity-50"
                                                title="Admin only"
                                            >
                                                <span className={cn(navIconFrame)}>
                                                    {route.icon}
                                                </span>
                                                <span className="flex-1 truncate font-sf-text text-[12.5px] font-medium normal-case tracking-normal">
                                                    {route.title}
                                                </span>
                                                <Lock size={11} className="shrink-0 ml-auto opacity-60" />
                                            </div>
                                        </SidebarMenuItem>
                                    );
                                }

                                // ── Expandable / plain link ──────────────
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
                                                                "group/nav-button h-7 rounded-lg px-2 gap-2 font-sf-text text-[12.5px] tracking-normal transition-all",
                                                                isActive
                                                                    ? "bg-white border border-[#C0C0C0] text-[#1a1a1a]"
                                                                    : "text-[#999] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                            )}
                                                        >
                                                            <span className={cn(
                                                                navIconFrame,
                                                                navIconMotion,
                                                                isActive ? "text-[#1a1a1a]" : "text-[#999]"
                                                            )} style={isActive ? activeIconStyle : inactiveIconStyle}>
                                                                {route.icon}
                                                            </span>
                                                            <SidebarLabel text={route.title} active={isActive} />
                                                            <ChevronRight className="ml-auto h-3 w-3 opacity-40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                        </SidebarMenuButton>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <SidebarMenuSub className="ml-5 mt-0.5 gap-0.5 border-l border-black/10 pl-1.5">
                                                            {route.subs?.map((sub) => {
                                                                const subActive = location.pathname === sub.link;
                                                                return (
                                                                    <SidebarMenuSubItem key={sub.title}>
                                                                        <SidebarMenuSubButton
                                                                            asChild
                                                                            className={cn(
                                                                                "h-6 rounded-md font-sf-text text-[11.5px] font-medium tracking-normal transition-all",
                                                                                subActive
                                                                                    ? "bg-white border border-[#C0C0C0] text-[#1a1a1a]"
                                                                                    : "text-[#999] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                                            )}
                                                                        >
                                                                            <Link
                                                                                to={sub.link}
                                                                                className="group/nav-link flex items-center gap-2"
                                                                            >
                                                                                {sub.icon && (
                                                                                    <span className={cn(
                                                                                        navIconFrame,
                                                                                        navIconMotion,
                                                                                        subActive ? "text-[#1a1a1a]" : "text-current"
                                                                                    )} style={subActive ? activeIconStyle : inactiveIconStyle}>{sub.icon}</span>
                                                                                )}
                                                                                <span className={cn(
                                                                                    "block truncate font-sf-text text-[11.5px] font-medium normal-case tracking-normal min-w-0",
                                                                                    subActive ? "text-[#1a1a1a]" : "text-current"
                                                                                )}>
                                                                                    {sub.title}
                                                                                </span>
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
                                                        "h-7 rounded-lg px-2 gap-2 font-sf-text text-[12.5px] tracking-normal transition-all",
                                                       isActive
                                                           ? "bg-white border border-[#C0C0C0] rounded-lg text-[#1a1a1a]"
                                                           : "text-[#999] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                    )}
                                                >
                                                    <Link
                                                        to={route.link}
                                                        className="group/nav-link flex items-center gap-2"
                                                    >
                                                        <span className={cn(
                                                            navIconFrame,
                                                            navIconMotion,
                                                            isActive ? "text-[#1a1a1a]" : "text-[#999]"
                                                        )} style={isActive ? activeIconStyle : inactiveIconStyle}>
                                                            {route.icon}
                                                        </span>
                                                        <SidebarLabel text={route.title} active={isActive} />
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
