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
    /** Count shown as a pill beside the label (dot when collapsed); hidden at 0. */
    badge?: number;
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

const activeNavLabelClass = "font-medium text-black/90";
const inactiveNavLabelClass =
    "font-normal text-black/80 group-hover/nav-link:text-black/85 group-hover/nav-button:text-black/85";

function SidebarLabel({ text, active }: { text: string; active?: boolean }) {
    return (
        <span className={cn(
            "block truncate font-sans text-[13px] normal-case tracking-normal min-w-0",
            active ? activeNavLabelClass : inactiveNavLabelClass
        )}>
            {text}
        </span>
    );
}

const navIconFrame =
    "flex h-[17px] w-[17px] shrink-0 items-center justify-center [&>img]:h-[17px] [&>img]:w-[17px] [&>img]:object-contain [&>svg]:h-[17px] [&>svg]:w-[17px]";

const activeIconStyle = { "--fillg": "#000000" } as React.CSSProperties;
const inactiveIconStyle = { "--fillg": "#000000" } as React.CSSProperties;

const navIconMotion =
    "transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/nav-link:-translate-y-px group-hover/nav-link:scale-110 group-hover/nav-link:text-black group-hover/nav-button:-translate-y-px group-hover/nav-button:scale-110 group-hover/nav-button:text-black";

const activeNavItemClass =
    "rounded-[8px] text-black";

function NavBadge({ count }: { count?: number }) {
    if (!count || count <= 0) return null;
    return (
        <span
            data-testid="nav-badge"
            className="ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-status-yellow-background px-1.5 font-sans text-[10.5px] font-semibold tabular-nums leading-none text-status-yellow-text"
        >
            {count > 99 ? "99+" : count}
        </span>
    );
}

function NavBadgeDot({ count }: { count?: number }) {
    if (!count || count <= 0) return null;
    return (
        <>
            <span
                data-testid="nav-badge-dot"
                aria-hidden="true"
                className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-[#dedede]"
            />
            <span className="sr-only">{count} pending</span>
        </>
    );
}

function ActiveBar() {
    return (
        <span
            data-testid="nav-active-bar"
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1/2 z-10 h-3.5 w-[3px] -translate-y-1/2 rounded-r-full bg-black"
        />
    );
}

const groupStorageKey = (label: string) => `ml:sidebar-group:${label}`;

function readGroupOpen(label: string) {
    try {
        return window.localStorage.getItem(groupStorageKey(label)) !== "closed";
    } catch {
        return true;
    }
}

function writeGroupOpen(label: string, open: boolean) {
    try {
        window.localStorage.setItem(groupStorageKey(label), open ? "open" : "closed");
    } catch {
        // Private mode or blocked storage: the group still toggles for this visit.
    }
}

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
    const hasActiveRoute = routes.some((route) => location.pathname === route.link);
    const [open, setOpen] = useState(() => hasActiveRoute || readGroupOpen(section.label));

    useEffect(() => {
        if (hasActiveRoute) setOpen(true);
    }, [hasActiveRoute]);

    useLayoutEffect(() => {
        if (open) updateOffsets();
    }, [open, updateOffsets]);

    const toggle = () => {
        setOpen((current) => {
            writeGroupOpen(section.label, !current);
            return !current;
        });
    };

    return (
        <SidebarGroup className="px-1.5 py-0.5">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="group/section mb-0 flex h-6 w-full items-center gap-1 rounded-md px-2 font-sans text-[11px] font-medium normal-case tracking-normal text-black transition-colors hover:bg-black/5"
            >
                <span className="truncate">{section.label}</span>
                <ChevronRight
                    aria-hidden="true"
                    className={cn("ml-auto h-3 w-3 opacity-40 transition-transform duration-200 group-hover/section:opacity-70", open && "rotate-90")}
                />
            </button>

            {open && (
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
                                        <span className="flex-1 truncate font-sans text-[13px] font-medium normal-case tracking-normal">
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
                                                "gap-2 font-sans text-[13px] tracking-normal transition-all w-full",
                                                cn(activeNavItemClass, "h-[28px] !p-0 !justify-start")
                                            )}
                                        >
                                            <Link
                                                to={route.link}
                                                className="group/nav-link relative flex items-center gap-2 w-full"
                                            >
                                                <ActiveBar />
                                                <button className="glass-button flex items-center gap-2 !h-[28px] w-full !p-0 !justify-start">
                                                    <div className="flex items-center gap-2 w-full px-2 pl-8">
                                                        <span className={cn(
                                                            navIconFrame,
                                                        )} style={activeIconStyle}>
                                                            {route.icon}
                                                        </span>
                                                        <span className={cn("truncate font-sans text-[13px]", activeNavLabelClass)}>
                                                            {route.title}
                                                        </span>
                                                        <NavBadge count={route.badge} />
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
                                            "h-7 rounded-lg px-2 pl-8 gap-2 font-sans text-[13px] tracking-normal transition-all",
                                            "text-black hover:bg-black/5 hover:text-black"
                                        )}
                                    >
                                        <Link
                                            to={route.link}
                                            className="group/nav-link flex items-center gap-2"
                                        >
                                            <span className={cn(
                                                navIconFrame,
                                                navIconMotion,
                                                "text-black"
                                            )} style={inactiveIconStyle}>
                                                {route.icon}
                                            </span>
                                            <SidebarLabel text={route.title} active={false} />
                                            <NavBadge count={route.badge} />
                                        </Link>
                                    </SidebarMenuButton>
                                )}
                            </SidebarMenuItem>
                        );
                    })}
                </div>
            </SidebarGroupContent>
            )}
        </SidebarGroup>
    );
}

export default function DashboardNavigation({ sections }: { sections: NavSection[] }) {
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";
    const location = useLocation();

    return (
        <>
            {sections.map((section, sectionIndex) => {
                const sectionKey = section.label || section.routes[0]?.id;
                const sectionBoundaryClass = sectionIndex > 0
                    ? "mt-2 border-t border-black/[0.08] pt-2"
                    : undefined;

                if (section.collapsible && !isCollapsed) {
                    return (
                        <div key={sectionKey} className={sectionBoundaryClass}>
                            <CollapsibleSection section={section} />
                        </div>
                    );
                }

                return (
                <div key={sectionKey} className={sectionBoundaryClass}>
                 <SidebarGroup className="px-1.5 py-0.5">
                    {/* Section label */}
                    {!isCollapsed && section.label && (
                        <SidebarGroupLabel className="mb-0 h-auto px-2 py-0.5 font-sans text-[11px] font-medium normal-case tracking-normal text-black">
                            {section.label}
                        </SidebarGroupLabel>
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
                                                    isActive ? activeNavItemClass : "text-black hover:bg-black/5 hover:text-black"
                                                )}
                                            >
                                                <Link to={route.link} aria-label={route.title} className="group/nav-link relative flex h-full w-full items-center justify-center">
                                                    <span className={cn(
                                                        navIconFrame,
                                                        "transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover/nav-link:-translate-y-px group-hover/nav-link:scale-110 group-hover/nav-link:text-black"
                                                    )} style={isActive ? activeIconStyle : inactiveIconStyle}>
                                                        {route.icon}
                                                    </span>
                                                    <NavBadgeDot count={route.badge} />
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
                                                <span className="flex-1 truncate font-sans text-[13px] font-medium normal-case tracking-normal">
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
                                                                    className="glass-button h-7 gap-2 font-sans text-[13px] tracking-normal w-full !p-0 !justify-start"
                                                                >
                                                                    <span className={cn(navIconFrame)} style={activeIconStyle}>
                                                                        {route.icon}
                                                                    </span>
                                                                    <span className={cn("truncate font-sans text-[13px]", activeNavLabelClass)}>
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
                                                                     "group/nav-button h-7 rounded-lg px-2 gap-2 font-sans text-[13px] tracking-normal transition-all",
                                                                    "text-black hover:bg-black/5 hover:text-black"
                                                                )}
                                                            >
                                                                <span className={cn(
                                                                    navIconFrame,
                                                                    navIconMotion,
                                                                    "text-black"
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
                                                                                 "font-sans text-[11.5px] font-medium tracking-normal transition-all",
                                                                                subActive
                                                                                    ? cn(activeNavItemClass, "h-7 w-full !p-0 !justify-start")
                                                                                    : "h-6 rounded-md px-2 text-black hover:bg-black/5 hover:text-black"
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
                                                                                                 <span className={cn("truncate font-sans text-[11.5px]", activeNavLabelClass)}>
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
                                                                                                "text-black"
                                                                                            )} style={inactiveIconStyle}>{sub.icon}</span>
                                                                                        )}
                                                                                        <span className={cn(
                                                                                             "block truncate font-sans text-[11.5px] normal-case tracking-normal min-w-0",
                                                                                            inactiveNavLabelClass
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
                                                         "gap-2 font-sans text-[13px] tracking-normal transition-all",
                                                        isActive
                                                            ? cn(activeNavItemClass, "h-[28px] w-full !p-0 !justify-start")
                                                            : "h-7 rounded-lg px-2 text-black hover:bg-black/5 hover:text-black"
                                                    )}
                                                >
                                                    <Link
                                                        to={route.link}
                                                        className={cn("group/nav-link flex items-center gap-2", isActive && "relative w-full")}
                                                    >
                                                        {isActive ? (
                                                            <>
                                                                <ActiveBar />
                                                                <div className="glass-button-wrap w-full">
                                                                    <button className="glass-button flex items-center gap-2 !h-[28px] w-full !p-0 !justify-start">
                                                                        <div className="flex items-center gap-2 w-full px-2">
                                                                            <span className={cn(navIconFrame)} style={activeIconStyle}>
                                                                                {route.icon}
                                                                            </span>
                                                                              <span className={cn("truncate font-sans text-[13px]", activeNavLabelClass)}>
                                                                                {route.title}
                                                                            </span>
                                                                            <NavBadge count={route.badge} />
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
                                                                    "text-black"
                                                                )} style={inactiveIconStyle}>
                                                                    {route.icon}
                                                                </span>
                                                                <SidebarLabel text={route.title} active={false} />
                                                                <NavBadge count={route.badge} />
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
                </div>
                );
            })}
        </>
    );
}
