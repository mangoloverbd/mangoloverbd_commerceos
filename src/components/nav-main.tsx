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
import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TextScramble } from "@/components/ui/text-scramble";

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

function SidebarScrambleLabel({ text, active, animateSignal }: { text: string; active?: boolean; animateSignal?: number }) {
    return (
        <TextScramble
            text={text}
            passive
            animateSignal={animateSignal}
            underline={false}
            glow={false}
            className="min-w-0"
            textClassName={cn(
                "block truncate font-sf-text text-[12.5px] font-medium normal-case tracking-normal",
                active && "font-medium"
            )}
            charClassName={active ? "text-[#0c6fff]" : "text-current"}
            scrambledClassName="scale-105 text-[#222]"
        />
    );
}

const navIconFrame =
    "flex h-[17px] w-[17px] shrink-0 items-center justify-center [&>img]:h-[17px] [&>img]:w-[17px] [&>img]:object-contain [&>svg]:h-[17px] [&>svg]:w-[17px]";

const activeIconStyle = { "--fillg": "#0c6fff" } as React.CSSProperties;
const inactiveIconStyle = { "--fillg": "#000000" } as React.CSSProperties;

const navIconMotion =
    "transform-gpu transition-all duration-300 ease-out group-hover/nav-link:-translate-y-0.5 group-hover/nav-link:-rotate-6 group-hover/nav-link:scale-125 group-hover/nav-link:text-[#0c6fff] group-hover/nav-button:-translate-y-0.5 group-hover/nav-button:-rotate-6 group-hover/nav-button:scale-125 group-hover/nav-button:text-[#0c6fff]";

export default function DashboardNavigation({ sections }: { sections: NavSection[] }) {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";
    const location = useLocation();
    const [scrambleSignals, setScrambleSignals] = useState<Record<string, number>>({});
    const triggerScramble = (key: string) => {
        setScrambleSignals((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    };

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
                                                        ? "bg-white border border-black/[0.1] shadow-sm text-blue-600"
                                                        : "text-[#6f6f6f] hover:bg-black/5 hover:text-blue-600"
                                                )}
                                            >
                                                <Link to={route.link} className="group/nav-link flex h-full w-full items-center justify-center">
                                                    <span className={cn(
                                                        navIconFrame,
                                                        "transform-gpu transition-all duration-300 ease-out group-hover/nav-link:-translate-y-0.5 group-hover/nav-link:-rotate-6 group-hover/nav-link:scale-125 group-hover/nav-link:text-[#0c6fff]"
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
                                                                    ? "bg-white border border-black/[0.1] shadow-sm text-[#222]"
                                                                    : "text-[#333] hover:bg-black/5 hover:text-[#111]"
                                                            )}
                                                        >
                                                            <span className={cn(
                                                                navIconFrame,
                                                                navIconMotion,
                                                                isActive ? "text-[#0c6fff]" : "text-[#333]"
                                                            )} style={isActive ? activeIconStyle : inactiveIconStyle}>
                                                                {route.icon}
                                                            </span>
                                                            <SidebarScrambleLabel text={route.title} active={isActive} animateSignal={scrambleSignals[route.id]} />
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
                                                                                    ? "bg-white border border-black/[0.1] shadow-sm text-[#222]"
                                                                                    : "text-[#333] hover:bg-black/5 hover:text-[#111]"
                                                                            )}
                                                                        >
                                                                            <Link
                                                                                to={sub.link}
                                                                                className="group/nav-link flex items-center gap-2"
                                                                                onMouseEnter={() => triggerScramble(`${route.id}:${sub.link}`)}
                                                                            >
                                                                                {sub.icon && (
                                                                                    <span className={cn(
                                                                                        navIconFrame,
                                                                                        navIconMotion,
                                                                                        subActive ? "text-[#0c6fff]" : "text-current"
                                                                                    )} style={subActive ? activeIconStyle : inactiveIconStyle}>{sub.icon}</span>
                                                                                )}
                                                                                <TextScramble
                                                                                    text={sub.title}
                                                                                    passive
                                                                                    animateSignal={scrambleSignals[`${route.id}:${sub.link}`]}
                                                                                    underline={false}
                                                                                    glow={false}
                                                                                    className="min-w-0"
                                                                                    textClassName="block truncate font-sf-text text-[11.5px] font-medium normal-case tracking-normal"
                                                                                    charClassName={subActive ? "text-[#0c6fff]" : "text-current"}
                                                                                    scrambledClassName="scale-105 text-[#222]"
                                                                                />
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
                                                           ? "bg-white border border-black/[0.1] shadow-sm text-[#222]"
                                                           : "text-[#333] hover:bg-black/5 hover:text-[#111]"
                                                    )}
                                                >
                                                    <Link
                                                        to={route.link}
                                                        className="group/nav-link flex items-center gap-2"
                                                        onMouseEnter={() => triggerScramble(route.id)}
                                                    >
                                                        <span className={cn(
                                                            navIconFrame,
                                                            navIconMotion,
                                                            isActive ? "text-[#0c6fff]" : "text-[#333]"
                                                        )} style={isActive ? activeIconStyle : inactiveIconStyle}>
                                                            {route.icon}
                                                        </span>
                                                        <SidebarScrambleLabel text={route.title} active={isActive} animateSignal={scrambleSignals[route.id]} />
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
