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
import { ReactNode, useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

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
    collapsible?: boolean;
}

function SidebarLabel({ text, active }: { text: string; active?: boolean }) {
    return (
        <span className={cn(
            "block truncate font-sf-text text-[12.5px] normal-case tracking-normal min-w-0",
            active ? "!font-bold text-[#1a1a1a]" : "font-medium text-[#666]"
        )}>
            {text}
        </span>
    );
}

const navIconFrame =
    "flex h-[17px] w-[17px] shrink-0 items-center justify-center [&>img]:h-[17px] [&>img]:w-[17px] [&>img]:object-contain [&>svg]:h-[17px] [&>svg]:w-[17px]";

const activeIconStyle = { "--fillg": "#1a1a1a" } as React.CSSProperties;
const inactiveIconStyle = { "--fillg": "#666666" } as React.CSSProperties;

const navIconMotion =
    "transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/nav-link:-translate-y-px group-hover/nav-link:scale-110 group-hover/nav-link:text-[#1a1a1a] group-hover/nav-button:-translate-y-px group-hover/nav-button:scale-110 group-hover/nav-button:text-[#1a1a1a]";

const activeNavItemClass =
    "rounded-[8px] text-[#1a1a1a]";

function TreeSvgLines({ offsets, className }: { offsets: number[]; className?: string }) {
    if (offsets.length === 0) return null;

    const lastOffset = offsets[offsets.length - 1];
    const totalHeight = lastOffset + 1;
    const lastV = lastOffset - 5;

    return (
        <svg
            aria-hidden="true"
            width="12"
            height={totalHeight}
            viewBox={`0 0 12 ${totalHeight}`}
            fill="none"
            className={cn(
                "pointer-events-none absolute top-0 left-[12.5px] z-10 select-none text-black/20",
                className
            )}
        >
            <path
                d={`M0.5 0 V${lastV}`}
                stroke="currentColor"
                strokeWidth="1"
            />
            {offsets.map((y, index) => {
                const v = y - 5;
                return (
                    <path
                        key={index}
                        d={`M0.5 ${v} V${y} H11.5`}
                        stroke="currentColor"
                        strokeWidth="1"
                    />
                );
            })}
        </svg>
    );
}

function CollapsibleSection({ section }: { section: NavSection }) {
    const location = useLocation();
    const [offsets, setOffsets] = useState<number[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    const updateOffsets = useCallback(() => {
        if (!containerRef.current) return;
        const directChildren = Array.from(containerRef.current.children).filter(
            (el) => el.tagName !== "svg"
        ) as HTMLElement[];
        const newOffsets = directChildren.map((child) => child.offsetTop + 16);
        setOffsets(newOffsets);
    }, []);

    useLayoutEffect(() => {
        updateOffsets();
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(() => updateOffsets());
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [updateOffsets]);

    const routes = section.routes;

    return (
        <SidebarGroup className="px-1.5 py-0.5">
            <div className="mb-0 flex h-auto w-full items-center gap-1 px-2 py-0.5 font-sf-text text-[11px] font-medium normal-case tracking-normal text-[#4a4a4a]">
                <span className="truncate">{section.label}</span>
            </div>

            <SidebarGroupContent>
                <div ref={containerRef} className="relative flex flex-col gap-0.5 list-none">
                    <TreeSvgLines offsets={offsets} />
                    {routes.map((route, i) => {
                        const isActive = location.pathname === route.link;

                        if (route.disabled) {
                            return (
                                <SidebarMenuItem key={route.id}>
                                    <div
                                        className="flex h-7 w-full items-center gap-2 rounded-lg px-2 pl-8 text-[#bbb] cursor-not-allowed select-none opacity-50"
                                        title="Admin only"
                                    >
                                        <span className={cn(navIconFrame)}>{route.icon}</span>
                                        <span className="flex-1 truncate font-sf-text text-[12.5px] font-medium normal-case tracking-normal">
                                            {route.title}
                                        </span>
                                        <Lock size={11} className="shrink-0 ml-auto opacity-60" />
                                    </div>
                                </SidebarMenuItem>
                            );
                        }

                        return (
                            <SidebarMenuItem key={route.id}>
                                {isActive ? (
                                    <div className="glass-button-wrap w-full">
                                        <SidebarMenuButton
                                            asChild
                                            tooltip={route.title}
                                            className={cn(
                                                "gap-2 font-sf-text text-[12.5px] tracking-normal transition-all w-full",
                                                cn(activeNavItemClass, "h-[28px] !p-0 !justify-start")
                                            )}
                                        >
                                            <Link
                                                to={route.link}
                                                className="group/nav-link flex items-center gap-2 w-full"
                                            >
                                                <button className="glass-button flex items-center gap-2 !h-[28px] w-full !p-0 !justify-start">
                                                    <div className="flex items-center gap-2 w-full px-2 pl-8">
                                                        <span className={cn(
                                                            navIconFrame,
                                                        )} style={activeIconStyle}>
                                                            {route.icon}
                                                        </span>
                                                        <span className="truncate font-sf-text text-[12.5px] !font-bold text-[#1a1a1a]">
                                                            {route.title}
                                                        </span>
                                                    </div>
                                                </button>
                                            </Link>
                                        </SidebarMenuButton>
                                        <div className="glass-button-shadow"></div>
                                    </div>
                                ) : (
                                    <SidebarMenuButton
                                        asChild
                                        tooltip={route.title}
                                        className={cn(
                                            "h-7 rounded-lg px-2 pl-8 gap-2 font-sf-text text-[12.5px] tracking-normal transition-all",
                                            "text-[#666] hover:bg-black/5 hover:text-[#1a1a1a]"
                                        )}
                                    >
                                        <Link
                                            to={route.link}
                                            className="group/nav-link flex items-center gap-2"
                                        >
                                            <span className={cn(
                                                navIconFrame,
                                                navIconMotion,
                                                "text-[#666]"
                                            )} style={inactiveIconStyle}>
                                                {route.icon}
                                            </span>
                                            <SidebarLabel text={route.title} active={false} />
                                        </Link>
                                    </SidebarMenuButton>
                                )}
                            </SidebarMenuItem>
                        );
                    })}
                </div>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}

export default function DashboardNavigation({ sections }: { sections: NavSection[] }) {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";
    const location = useLocation();

    return (
        <>
            {sections.map((section) => {
                const sectionKey = section.label || section.routes[0]?.id;

                if (section.collapsible && !isCollapsed) {
                    return <CollapsibleSection key={sectionKey} section={section} />;
                }

                return (
                <SidebarGroup
                    key={sectionKey}
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
                                                    isActive ? activeNavItemClass : "text-[#666] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                )}
                                            >
                                                <Link to={route.link} className="group/nav-link flex h-full w-full items-center justify-center">
                                                    <span className={cn(
                                                        navIconFrame,
                                                        "transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/nav-link:-translate-y-px group-hover/nav-link:scale-110 group-hover/nav-link:text-[#1a1a1a]"
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
                                                        {isActive ? (
                                                            <div className="glass-button-wrap w-full">
                                                                <SidebarMenuButton
                                                                    tooltip={route.title}
                                                                    className="glass-button h-7 gap-2 font-sf-text text-[12.5px] tracking-normal w-full !p-0 !justify-start"
                                                                >
                                                                    <span className={cn(navIconFrame)} style={activeIconStyle}>
                                                                        {route.icon}
                                                                    </span>
                                                                    <span className="truncate font-sf-text text-[12.5px] !font-bold text-[#1a1a1a]">
                                                                        {route.title}
                                                                    </span>
                                                                    <ChevronRight className="ml-auto h-3 w-3 opacity-40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                                </SidebarMenuButton>
                                                                <div className="glass-button-shadow"></div>
                                                            </div>
                                                        ) : (
                                                            <SidebarMenuButton
                                                                tooltip={route.title}
                                                                className={cn(
                                                                    "group/nav-button h-7 rounded-lg px-2 gap-2 font-sf-text text-[12.5px] tracking-normal transition-all",
                                                                    "text-[#666] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                                )}
                                                            >
                                                                <span className={cn(
                                                                    navIconFrame,
                                                                    navIconMotion,
                                                                    "text-[#666]"
                                                                )} style={inactiveIconStyle}>
                                                                    {route.icon}
                                                                </span>
                                                                <SidebarLabel text={route.title} active={false} />
                                                                <ChevronRight className="ml-auto h-3 w-3 opacity-40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                            </SidebarMenuButton>
                                                        )}
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
                                                                                "font-sf-text text-[11.5px] font-medium tracking-normal transition-all",
                                                                                subActive
                                                                                    ? cn(activeNavItemClass, "h-7 w-full !p-0 !justify-start")
                                                                                    : "h-6 rounded-md px-2 text-[#666] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                                            )}
                                                                        >
                                                                            <Link
                                                                                to={sub.link}
                                                                                className={cn("group/nav-link flex items-center gap-2", subActive && "w-full")}
                                                                            >
                                                                                {subActive ? (
                                                                                    <div className="glass-button-wrap w-full">
                                                                                        <button className="glass-button flex items-center gap-2 !h-7 w-full !p-0 !justify-start">
                                                                                            <div className="flex items-center gap-2 w-full px-2">
                                                                                                {sub.icon && (
                                                                                                    <span className={cn(navIconFrame)} style={activeIconStyle}>{sub.icon}</span>
                                                                                                )}
                                                                                                <span className="truncate font-sf-text text-[11.5px] !font-bold text-[#1a1a1a]">
                                                                                                    {sub.title}
                                                                                                </span>
                                                                                            </div>
                                                                                        </button>
                                                                                        <div className="glass-button-shadow"></div>
                                                                                    </div>
                                                                                ) : (
                                                                                    <>
                                                                                        {sub.icon && (
                                                                                            <span className={cn(
                                                                                                navIconFrame,
                                                                                                navIconMotion,
                                                                                                "text-[#666]"
                                                                                            )} style={inactiveIconStyle}>{sub.icon}</span>
                                                                                        )}
                                                                                        <span className={cn(
                                                                                            "block truncate font-sf-text text-[11.5px] font-medium normal-case tracking-normal min-w-0",
                                                                                            "text-[#666]"
                                                                                        )}>
                                                                                            {sub.title}
                                                                                        </span>
                                                                                    </>
                                                                                )}
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
                                                        "gap-2 font-sf-text text-[12.5px] tracking-normal transition-all",
                                                        isActive
                                                            ? cn(activeNavItemClass, "h-[28px] w-full !p-0 !justify-start")
                                                            : "h-7 rounded-lg px-2 text-[#666] hover:bg-black/5 hover:text-[#1a1a1a]"
                                                    )}
                                                >
                                                    <Link
                                                        to={route.link}
                                                        className={cn("group/nav-link flex items-center gap-2", isActive && "w-full")}
                                                    >
                                                        {isActive ? (
                                                            <>
                                                                <div className="glass-button-wrap w-full">
                                                                    <button className="glass-button flex items-center gap-2 !h-[28px] w-full !p-0 !justify-start">
                                                                        <div className="flex items-center gap-2 w-full px-2">
                                                                            <span className={cn(navIconFrame)} style={activeIconStyle}>
                                                                                {route.icon}
                                                                            </span>
                                                                            <span className="truncate font-sf-text text-[12.5px] !font-bold text-[#1a1a1a]">
                                                                                {route.title}
                                                                            </span>
                                                                        </div>
                                                                    </button>
                                                                    <div className="glass-button-shadow"></div>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className={cn(
                                                                    navIconFrame,
                                                                    navIconMotion,
                                                                    "text-[#666]"
                                                                )} style={inactiveIconStyle}>
                                                                    {route.icon}
                                                                </span>
                                                                <SidebarLabel text={route.title} active={false} />
                                                            </>
                                                        )}
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
                );
            })}
        </>
    );
}
