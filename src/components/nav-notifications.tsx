"use client";

import { useMemo, type ElementType } from "react";
import { Bell, AtSign, Package, MessageCircle, Settings, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface NotificationAction {
    id: string;
    label: string;
    variant?: "primary" | "secondary";
}

export interface Notification {
    id: string;
    avatar?: string;
    fallback: string;
    text?: string;
    title?: string;
    description?: string;
    time: string;
    isRead: boolean;
    group?: string;
    category?: "mentions" | "system" | "orders" | "social" | string;
    status?: "success" | "warning" | "error" | "info";
    actions?: NotificationAction[];
}

const CATEGORY_META: Record<string, { Icon: ElementType; tint: string }> = {
    mentions: { Icon: AtSign, tint: "text-[#3b5bdb] bg-[#3b5bdb]/[0.08]" },
    system: { Icon: Settings, tint: "text-[#5b5b5b] bg-black/[0.05]" },
    orders: { Icon: Package, tint: "text-[#2f6b3a] bg-[#2f6b3a]/[0.08]" },
    social: { Icon: MessageCircle, tint: "text-[#8a4fbe] bg-[#8a4fbe]/[0.08]" },
};

function getCategoryMeta(n: Notification) {
    if (n.status === "success") return { Icon: CheckCircle2, tint: "text-[#2f6b3a] bg-[#2f6b3a]/[0.08]" };
    if (n.status === "warning") return { Icon: AlertTriangle, tint: "text-[#8A6A28] bg-[#8A6A28]/[0.08]" };
    if (n.status === "error") return { Icon: AlertTriangle, tint: "text-[#b42318] bg-[#b42318]/[0.08]" };
    if (n.status === "info") return { Icon: Info, tint: "text-[#3b5bdb] bg-[#3b5bdb]/[0.08]" };
    return CATEGORY_META[n.category ?? "system"] ?? CATEGORY_META.system;
}

export function NotificationsPopover({
    notifications,
    hasUnread,
    onMarkAsRead,
    onAction,
}: {
    notifications: Notification[];
    hasUnread: boolean;
    onMarkAsRead: () => void;
    onAction?: (notificationId: string, actionId: string) => void;
}) {
    const groups = useMemo(() => {
        const map = new Map<string, Notification[]>();
        for (const n of notifications) {
            const g = n.group ?? "";
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(n);
        }
        return Array.from(map.entries());
    }, [notifications]);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative group hover:bg-black/[0.03] transition-colors">
                    <Bell className="size-4 text-black group-hover:text-black transition-colors" />
                    {hasUnread && (
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-black ring-2 ring-white" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0 shadow-2xl border border-black/5 rounded-2xl bg-white" align="end" sideOffset={8}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-black/5 px-6 py-4 bg-white">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-black"></div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-black">Notifications</span>
                    </div>
                    {hasUnread && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-[9px] font-bold uppercase tracking-wider text-black hover:text-black hover:bg-black/[0.03] px-3 rounded-xl transition-all"
                            onClick={onMarkAsRead}
                        >
                            Mark all read
                        </Button>
                    )}
                </div>

                {/* Notifications List */}
                <div className="max-h-[400px] overflow-y-auto">
                    <AnimatePresence mode="popLayout">
                        {notifications.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="px-6 py-12 text-center"
                            >
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-black/[0.02] mb-4">
                                    <Bell className="w-5 h-5 text-black" />
                                </div>
                                <p className="text-[10px] text-black tracking-[0.15em] font-bold uppercase">No notifications</p>
                            </motion.div>
                        ) : (
                            <div>
                                {groups.map(([group, items]) => (
                                    <div key={group || "ungrouped"}>
                                        {group && (
                                            <p className="px-6 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-black/35">
                                                {group}
                                            </p>
                                        )}
                                        <div className={cn(!group && "divide-y divide-black/[0.03]")}>
                                            {items.map((n, index) => {
                                                const meta = getCategoryMeta(n);
                                                const Icon = meta.Icon;
                                                return (
                                                    <motion.div
                                                        key={n.id}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        transition={{ delay: index * 0.05 }}
                                                        className={cn(
                                                            "flex items-start gap-3 px-6 py-4 last:rounded-b-2xl hover:bg-black/[0.01] transition-colors relative",
                                                            !n.isRead && "bg-black/[0.02]"
                                                        )}
                                                    >
                                                        {/* Notification icon — LEFT of the profile icon */}
                                                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", meta.tint)}>
                                                            <Icon className="h-4 w-4" />
                                                        </div>

                                                        {/* Profile avatar */}
                                                        {n.avatar ? (
                                                            <Avatar className="h-9 w-9 rounded-xl border border-black/5 flex-shrink-0">
                                                                <AvatarImage src={n.avatar} />
                                                                <AvatarFallback className="text-[10px] font-bold bg-black/5 text-black uppercase">
                                                                    {n.fallback}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        ) : null}

                                                        {/* Content */}
                                                        <div className="flex-1 min-w-0 space-y-1">
                                                            <p className={cn(
                                                                "text-[13px] leading-snug tracking-tight",
                                                                !n.isRead ? "font-semibold text-black" : "font-medium text-black"
                                                            )}>
                                                                {n.title ?? n.text}
                                                            </p>
                                                            {n.description && (
                                                                <p className="text-[12px] leading-snug text-black/50">
                                                                    {n.description}
                                                                </p>
                                                            )}
                                                            <p className="text-[10px] text-black/40 font-medium uppercase tracking-wider">
                                                                {n.time}
                                                            </p>
                                                            {n.actions?.length ? (
                                                                <div className="mt-2 flex flex-wrap gap-2">
                                                                    {n.actions.map((a) => (
                                                                        <Button
                                                                            key={a.id}
                                                                            size="sm"
                                                                            variant={a.variant === "primary" ? "default" : "outline"}
                                                                            className="h-7 rounded-lg px-3 text-[11px]"
                                                                            onClick={() => onAction?.(n.id, a.id)}
                                                                        >
                                                                            {a.label}
                                                                        </Button>
                                                                    ))}
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        {/* Unread indicator */}
                                                        {!n.isRead && (
                                                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-black" />
                                                        )}
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </PopoverContent>
        </Popover>
    );
}
