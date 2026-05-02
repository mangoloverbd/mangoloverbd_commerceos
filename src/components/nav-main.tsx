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
import { ChevronRight } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
                <SidebarGroup key={section.label || section.routes[0]?.id} className="py-0 px-0">
                    {!isCollapsed && section.label && (
                        <SidebarGroupLabel className="text-[8px] font-medium tracking-[0.3em] text-foreground/65 uppercase px-4 py-2 h-auto">
                            {section.label}
                        </SidebarGroupLabel>
                    )}
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-0">
                            {section.routes.map((route) => {
                                const isActive = location.pathname === route.link;
                                const hasSubs = route.subs && route.subs.length > 0;

                                if (isCollapsed) {
                                    return (
                                        <SidebarMenuItem key={route.id}>
                                            <SidebarMenuButton
                                                asChild
                                                tooltip={route.title}
                                                className={cn(
                                                    "rounded-none h-9 flex items-center justify-center border-l-[1.5px] transition-colors",
                                                    isActive
                                                        ? "border-foreground text-foreground bg-foreground/[0.07]"
                                                        : "border-transparent text-foreground/80 hover:text-foreground hover:bg-foreground/[0.05]"
                                                )}
                                            >
                                                <Link to={route.link} className="flex w-full items-center justify-center">
                                                    {route.icon}
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                }

                                return (
                                    <Collapsible key={route.id} asChild className="group/collapsible" defaultOpen={false}>
                                        <SidebarMenuItem>
                                            {hasSubs ? (
                                                <>
                                                    <CollapsibleTrigger asChild>
                                                        <SidebarMenuButton
                                                            tooltip={route.title}
                                                            className={cn(
                                                                "rounded-none h-8 px-4 border-l-[1.5px] transition-colors gap-2.5",
                                                                isActive
                                                                    ? "border-foreground text-foreground font-medium bg-foreground/[0.07]"
                                                                    : "border-transparent text-foreground/80 hover:text-foreground hover:border-foreground/20 hover:bg-foreground/[0.05]"
                                                            )}
                                                        >
                                                            {route.icon}
                                                            <span className="text-[11px] tracking-[0.08em]">{route.title}</span>
                                                            <ChevronRight className="ml-auto size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 opacity-40" />
                                                        </SidebarMenuButton>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent>
                                                        <SidebarMenuSub>
                                                            {route.subs?.map((sub) => {
                                                                const subActive = location.pathname === sub.link;
                                                                return (
                                                                    <SidebarMenuSubItem key={sub.title}>
                                                                        <SidebarMenuSubButton
                                                                            asChild
                                                                            className={cn(
                                                                                "transition-colors",
                                                                                subActive
                                                                                    ? "bg-foreground/[0.07] text-foreground font-medium"
                                                                                    : "hover:bg-foreground/[0.05]"
                                                                            )}
                                                                        >
                                                                            <Link to={sub.link}>
                                                                                {sub.icon}
                                                                                <span className="text-[11px] tracking-[0.06em]">{sub.title}</span>
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
                                                        "rounded-none h-8 px-4 border-l-[1.5px] transition-colors gap-2.5",
                                                        isActive
                                                            ? "border-foreground text-foreground font-medium bg-foreground/[0.07] hover:bg-foreground/[0.07]"
                                                            : "border-transparent text-foreground/80 hover:text-foreground hover:border-foreground/20 hover:bg-foreground/[0.05]"
                                                    )}
                                                >
                                                    <Link to={route.link}>
                                                        {route.icon}
                                                        <span className="text-[11px] tracking-[0.08em]">{route.title}</span>
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
