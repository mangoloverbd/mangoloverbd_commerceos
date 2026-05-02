"use client";

import { Bell } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface Notification {
    id: string;
    avatar: string;
    fallback: string;
    text: string;
    time: string;
    isRead: boolean;
}

export function NotificationsPopover({
    notifications,
    hasUnread,
    onMarkAsRead,
}: {
    notifications: Notification[];
    hasUnread: boolean;
    onMarkAsRead: () => void;
}) {
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
            <PopoverContent className="w-80 p-0 shadow-2xl border border-black/5 rounded-2xl bg-white" align="end" sideOffset={8}>
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
                            <div className="divide-y divide-black/[0.03]">
                                {notifications.map((n, index) => (
                                    <motion.div
                                        key={n.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ delay: index * 0.05 }}
                                        className={cn(
                                            "flex items-start gap-4 px-6 py-4 last:rounded-b-2xl hover:bg-black/[0.01] transition-colors relative",
                                            !n.isRead && "bg-black/[0.02]"
                                        )}
                                    >
                                        {/* Unread indicator */}
                                        {!n.isRead && (
                                            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-black"></div>
                                        )}

                                        {/* Avatar */}
                                        <Avatar className="w-10 h-10 rounded-xl border border-black/5 flex-shrink-0">
                                            <AvatarImage src={n.avatar} />
                                            <AvatarFallback className="text-[10px] font-bold bg-black/5 text-black uppercase">
                                                {n.fallback}
                                            </AvatarFallback>
                                        </Avatar>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <p className={cn(
                                                "text-sm leading-[1.4] tracking-tight",
                                                !n.isRead ? "font-semibold text-black" : "text-black"
                                            )}>
                                                {n.text}
                                            </p>
                                            <p className="text-[10px] text-black font-medium uppercase tracking-wider">
                                                {n.time}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </PopoverContent>
        </Popover>
    );
}
