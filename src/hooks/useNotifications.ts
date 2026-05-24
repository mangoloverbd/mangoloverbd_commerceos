import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";

type Order = Database["public"]["Tables"]["orders"]["Row"];

export interface Notification {
    id: string;
    order_id: string;
    avatar: string;
    fallback: string;
    text: string;
    time: string;
    timestamp: string;
    isRead: boolean;
}

const STORAGE_KEY = "shopangonaloy_read_notifications";

export function useNotifications() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const getReadIds = (): string[] => {
        if (typeof window === "undefined") return [];
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error("Error reading read notifications from localStorage", e);
            return [];
        }
    };

    const markAsRead = () => {
        const currentReadIds = getReadIds();
        const allIds = Array.from(new Set([...currentReadIds, ...notifications.map((n) => n.id)]));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allIds));
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    };

    const formatOrderToNotification = (order: Order, readIds: string[]): Notification => {
        return {
            id: order.id,
            order_id: order.id,
            avatar: "",
            fallback: order.customer_name ? order.customer_name.substring(0, 2).toUpperCase() : "OR",
            text: `New order #${order.order_number} from ${order.customer_name || "Guest"}`,
            time: formatDistanceToNow(new Date(order.created_at), { addSuffix: true }),
            timestamp: order.created_at,
            isRead: readIds.includes(order.id),
        };
    };

    useEffect(() => {
        setNotifications([]);
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);

        const fetchInitialNotifications = async () => {
            try {
                const res = await apiFetch("/api/orders/recent-notifications");
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || "Failed to fetch notifications");

                if (data.orders) {
                    const readIds = getReadIds();
                    const formatted = data.orders.map((order: Order) => formatOrderToNotification(order, readIds));
                    setNotifications(formatted);
                }
            } catch (error) {
                console.error("Error fetching notifications:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialNotifications();
    }, [user?.id]);

    const hasUnread = notifications.some((n) => !n.isRead);

    return {
        notifications,
        loading,
        markAsRead,
        hasUnread,
    };
}
