"use client";

import { useMemo } from "react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
    PanelLeftClose,
    PanelLeftOpen,
    Home,
    Download,
    Package,
    TrendingUp,

    HelpCircle,
    LogOut,
    ChevronsUpDown,
    Send,
    Lightbulb,

} from "lucide-react";
import { Logo } from "./logo";
import { AppleSettingsIcon } from "./ui/apple-settings-icon";
import type { NavSection } from "./nav-main";
import DashboardNavigation from "./nav-main";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useOrgName } from "@/hooks/useOrgName";
import { Link } from "react-router-dom";

export function AppSidebar() {
    const { state, toggleSidebar } = useSidebar();
    const isCollapsed = state === "collapsed";
    const { isAdmin } = useUserRole();
    const { signOut, user } = useAuth();
    const { orgName, isLoading: orgLoading } = useOrgName();

    const iconCls = "shrink-0 transition-colors";

    const navSections = useMemo((): NavSection[] => {
        const product: NavSection = {
            label: "",
            routes: [
                {
                    id: "orders",
                    title: "Home",
                    icon: <svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={iconCls}><g fill="none"><path fill="#020202" fillRule="evenodd" d="M23.988 12.374a3.9 3.9 0 0 0-.16-1.458A8 8 0 0 0 22.071 8.8c-1.487-1.377-3.513-2.715-4.631-3.793l-3.613-3.483c-.09-.08-.76-.779-1.049-.998a.83.83 0 0 0-.838-.21a4.4 4.4 0 0 0-.998.669c-.6.529-1.178 1.237-1.667 1.677c-1.068.998-2.136 1.916-3.164 2.894S4.045 7.553 3.116 8.621c-.609.589-1.487 1.377-2.086 2.106c-.333.37-.594.8-.769 1.268a32.5 32.5 0 0 0-.23 5.55a33.4 33.4 0 0 0 .46 5.49a.35.35 0 0 0 .26.239a.36.36 0 0 0 .379.26c2.715-.11 5.434-.07 8.145.119c1.846.07 3.723.08 5.49.06a45 45 0 0 0 5.929-.38a.39.39 0 0 0 .195-.69a.4.4 0 0 0-.285-.088a75 75 0 0 1-8.165-.13c-1.088 0-2.196-.07-3.284-.08H6.95a44 44 0 0 0-5.79.47a32 32 0 0 1-.279-5.29a33 33 0 0 1 .33-5.251c.195-.436.473-.829.818-1.158c.6-.619 1.348-1.208 1.837-1.707A78 78 0 0 1 6.31 7.064c1.298-1.158 2.566-2.286 3.843-3.424c.5-.43 1.068-1.128 1.667-1.657q.16-.147.34-.27c.299.29.678.7.738.759l3.674 3.533c1.157.999 3.204 2.346 4.74 3.684a6.9 6.9 0 0 1 1.558 1.766c.122.71.142 1.432.06 2.146c-.06 2.855-.39 7.437-.23 9.743a.41.41 0 0 0 .42.369a.4.4 0 0 0 .379-.42c-.14-2.704.489-8.384.489-10.92" clipRule="evenodd"/><path fill="#0c6fff" d="M13.577 22.146a.51.51 0 0 0 .649 0a33 33 0 0 0 .23-4.592q.043-.778 0-1.557a3.6 3.6 0 0 0-.31-1.118a1.34 1.34 0 0 0-.998-.639a11.6 11.6 0 0 0-1.777 0a8.4 8.4 0 0 0-1.647 0a1.8 1.8 0 0 0-.848.42a1 1 0 0 0-.28.609c-.07.429-.34 5.67-.21 6.158a.43.43 0 0 0 .49.3c.579-.11.638-6.319.808-6.339h1.677c.35 0 .729-.06 1.208-.06q.324.01.639.09q.146.356.24.729q.106.706.129 1.417c.05.998 0 1.787 0 2.665c-.09.3-.19 1.747 0 1.917"/></g></svg>,
                    link: "/",
                },
                {
                    id: "order-extraction",
                    title: "Extraction",
                    icon: <Download size={14} className={iconCls} />,
                    link: "/order-extraction",
                },
                {
                    id: "order-chat",
                    title: "AI Chat",
                    icon: <img src="https://img.icons8.com/material-rounded/24/bard--v2.png" alt="ai-chat" className="h-[14px] w-[14px] shrink-0" />,
                    link: "/order-chat",
                },
                {
                    id: "products",
                    title: "Products",
                    icon: <svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" className={iconCls}><g fill="none" stroke="#00034a"><path fill="#00034a" strokeMiterlimit="10" d="M4.278 15.339c-.205 2.622-.283 4.699.068 5.429c.31.63.757 1.395 1.332 1.816c1.365 1 4.25 1.57 6.37 1.834c2.584.32 6.383.486 7.442-.758c.583-.68 1.05-3.09 1.545-6.073c.917 0 1.804-.33 2.497-.932c.864-.651 1.778-1.866 1.525-2.692c-1.098-3.242-3.431-7.18-6.75-8.508a.855.855 0 0 0-1.077.535a3.76 3.76 0 0 1-6.327 1.154a3.8 3.8 0 0 1-.245-.963c-.038-.427-.674-1.416-.974-1.67a.86.86 0 0 0-.616-.202c-.64.058-1.068.116-1.088.126a13 13 0 0 0-3.692 2.38a13.6 13.6 0 0 0-2.992 3.178c-.697 1.176.752 3.152 1.492 4.106c.384.54.899.964 1.49 1.24Zm29.139-5.084a21.4 21.4 0 0 1 2.176-3.294c.173-.226.429-.374.71-.412c.827-.112 1.645.738 1.95 1.415a1.07 1.07 0 0 1 .025.818a21.4 21.4 0 0 1-1.642 3.595q-.347.614-.616 1.1c-.976 1.752-1.285 2.306-1.843 2.175c-1.916-.505-3.415-1.794-4.89-3.046c-.34-.34-.087-.971.166-1.428c.252-.457.66-1 1.127-.894c.792.25 1.55.6 2.254 1.04zm-4.139-6.413c-.923 0-1.671.749-1.671 1.672c0 1.046 1.438 2.319 2.474 2.319a1.67 1.67 0 0 0 1.67-1.672c0-1.046-1.437-2.319-2.473-2.319ZM24.593.973S23.882.5 23.43.5a1.67 1.67 0 0 0-1.671 1.671c0 .866 1.5 1.663 1.5 1.663s.713.472 1.166.472a1.67 1.67 0 0 0 1.67-1.67c0-.866-1.5-1.663-1.5-1.663z"/><path fill="#fff" strokeMiterlimit="10" d="M24.38 12.868a13.2 13.2 0 0 0-2.098-3.886a13.3 13.3 0 0 0-3.002-3.138l-.972-.389a.855.855 0 0 0-1.078.535a3.76 3.76 0 0 1-7.248-.904a.855.855 0 0 0-.914-.777c-.64.058-1.068.116-1.088.126a13 13 0 0 0-3.692 2.38a13.6 13.6 0 0 0-2.992 3.178c-.438.738.145 2.147.816 3.011a3.8 3.8 0 0 0 2.234 1.497c-.252 3.012-.388 5.46 0 6.267c.72 1.457 4.44 2.234 7.025 2.555c2.585.32 6.383.486 7.443-.758c.583-.68 1.049-3.09 1.544-6.072a3.8 3.8 0 0 0 2.497-.933c.865-.651 1.779-1.866 1.526-2.692z"/><path strokeLinecap="round" strokeMiterlimit="10" d="M5.153 12.441c.12-.836.328-1.657.622-2.448m14.311 4.313c.09-.84.09-1.686 0-2.526"/><path fill="#9bff00" strokeMiterlimit="10" d="M23.429 3.842a1.67 1.67 0 1 0 0-3.342a1.67 1.67 0 0 0 0 3.342Zm5.849 3.343a1.672 1.672 0 1 0 0-3.343a1.672 1.672 0 0 0 0 3.343Zm6.315-.224a21.4 21.4 0 0 0-2.176 3.294l-.583 1.069a9.8 9.8 0 0 0-2.254-1.04c-.467-.107-.875.437-1.127.894c-.253.457-.506 1.088-.165 1.428a10 10 0 0 0 2.079 1.36a7.2 7.2 0 0 0 2.254 1.04c.66.155.97-.65 2.458-3.274a21.4 21.4 0 0 0 1.642-3.595a1.067 1.067 0 0 0-.622-1.38a1.08 1.08 0 0 0-1.506.204Z"/><path fill="#00034a" strokeMiterlimit="10" d="M33.059 21.885a9.5 9.5 0 0 1 2.35-.049c2.605.795 2.338 4.293 2.203 6.416l-.047.756c-.291 5.247-.563 6.092-1.943 7.238c-.816.68-3.46 1.506-7.131 2.245c-3.673.738-6.433 1.04-7.453.738c-2.791-.836-4.234-4.606-5.518-6.84c-1.312-2.333-2.643-5.073-1.263-6.22a10 10 0 0 1 2.42-.97c.154-.759.388-1.662.63-2.469a18.5 18.5 0 0 1 1.507-3.818a1.77 1.77 0 0 1 2-.593c.724.172 1.404.95 1.867 1.5c.24.287.384.644.407 1.018a19 19 0 0 1-.485 2.804a102 102 0 0 1 2.05-.444c1-.204 2.167-.418 3.362-.622a18.3 18.3 0 0 1-2.352-3.372a1.75 1.75 0 0 1 .603-1.991a1.8 1.8 0 0 1 2.089-.234a25.5 25.5 0 0 1 3.847 3.84c.299.339.587.705.857 1.067Z"/><path fill="#9bff00" strokeMiterlimit="10" d="M35.409 21.837a9.5 9.5 0 0 0-2.595.087c-.437-.632-.971-1.38-1.544-2.03a19 19 0 0 0-2.915-2.916a1.8 1.8 0 0 0-2.09.234a1.75 1.75 0 0 0-.602 1.991a18.3 18.3 0 0 0 2.352 3.372c-1.195.204-2.361.418-3.362.622s-2.157.466-3.333.738a19 19 0 0 0 .836-4.022a1.75 1.75 0 0 0-1.34-1.594a1.77 1.77 0 0 0-2.002.593a18.5 18.5 0 0 0-1.506 3.818a30 30 0 0 0-.632 2.468a10 10 0 0 0-2.42.972c-1.38 1.146-.048 3.886 1.264 6.218c2.623 4.567 2.866 5.402 4.586 5.917c1.02.301 3.78 0 7.452-.738c3.673-.739 6.316-1.565 7.132-2.245c1.38-1.146 1.65-1.992 1.943-7.238c.204-3.4.495-5.723-1.224-6.247Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.853 28.735a50 50 0 0 0 1.943 5.567m9.512-7.909c.23 1.958.35 3.927.36 5.898m-6.092-4.722l1.176 5.732"/></g></svg>,
                    link: "/products",
                },
            ],
        };

        const workspace: NavSection = {
            label: "Intelligence",
            routes: [
                {
                    id: "order-analysis",
                    title: "AI Analysis",
                    icon: <svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={iconCls}><g fill="none" fillRule="evenodd" clipRule="evenodd"><path fill="#020202" d="M23.248 9.382a9.95 9.95 0 0 0-1.792-3.82a10.3 10.3 0 0 0-4.209-4.419a10.95 10.95 0 0 0-6.666-.995a13.9 13.9 0 0 0-6.24 2.508a8.3 8.3 0 0 0-2.984 3.98a6 6 0 0 0-.299 1.632a7.6 7.6 0 0 0 .647 6.468a8 8 0 0 0 2.388 2.378a10.2 10.2 0 0 0 3.045 1.333q.533.12 1.074.18q.79.069 1.583.05h.736a.52.52 0 0 0 .478-.38q.102-.521.099-1.054c0-.497-.07-3.254.06-4.229c.219-1.711.497-3.632.666-4.288v-.2l1.095.787l5.97 4.13a3.4 3.4 0 0 0-.169.447q-.015.174 0 .348q-.023.18 0 .358c0 .17.08.329.12.488l-1.652-1.363c-.578-.478-1.145-.995-1.732-1.413c-.995-.766-1.99-1.473-2.985-2.269a.32.32 0 0 0-.458 0a.33.33 0 0 0 0 .468c.737.846 1.473 1.671 2.28 2.438c.347.328.716.636 1.084.935s.766.577 1.144.846c.925.637 1.87 1.194 2.836 1.76c.13.08.08.26 1.612-.875a6.8 6.8 0 0 0 1.303-1.403a6.1 6.1 0 0 0 .995-2.328a6.6 6.6 0 0 0-.03-2.498M10.183 17.82l-.368-.09c-.408 0-.816-.059-1.214-.109a7.5 7.5 0 0 1-1.155-.259a10.4 10.4 0 0 1-2.159-.995A8.4 8.4 0 0 1 2.7 14.06a6.5 6.5 0 0 1-1.105-2.985c.06.15.1.298.17.458a6.7 6.7 0 0 0 2.885 3.094a14.6 14.6 0 0 0 5.642 1.483v.995a4 4 0 0 1-.11.716m2.11-10.527a17 17 0 0 0 1.522-.995q.682-.517 1.303-1.105c.627-.537 1.204-1.184 1.86-1.731a.378.378 0 0 0-.457-.597c-.696.458-1.393.915-2.07 1.403A17 17 0 0 0 12.81 5.6c-2.24 2.08-1.244 1.483-4.09 1.095a11 11 0 0 0-1.194-.11H6.372q-1.355.055-2.697.259a.38.38 0 0 0-.358.398c.01.208.19.365.398.348c.915 0 1.8.13 2.696.19c.607 0 1.204.089 1.801.109h2.468c0 .249-.06.497-.08.607c-.089.497-.198 1.691-.268 2.985c-.1 1.532-.15 3.164-.14 4.03a13.2 13.2 0 0 1-5.104-1.552a5.73 5.73 0 0 1-2.408-2.757a5.74 5.74 0 0 1-.259-4.209A7.2 7.2 0 0 1 5.108 3.65a12.65 12.65 0 0 1 5.662-2.249a9.9 9.9 0 0 1 5.97.727a9.15 9.15 0 0 1 4.368 4.915a5.44 5.44 0 0 1-1.423 5.97c0-.288-.945-.796-5.97-4.746zm9.084 6.348c-.26.482-.596.919-.995 1.294a2 2 0 0 1-.736.437a7 7 0 0 0 .218-.756q.015-.169 0-.338q.077-.151.1-.318a1 1 0 0 0-.05-.17a.45.45 0 0 0 .249-.09a6.34 6.34 0 0 0 1.9-2.845q.022.423 0 .846a5.7 5.7 0 0 1-.686 1.94"/><path fill="#0c6fff" d="M20.014 19.482a.39.39 0 0 0-.05-.547c-.925-.756-1.88-1.493-2.796-2.269c-.607-.508-1.204-.995-1.761-1.572L13.994 13.7l-.568-.528l-.328-.209a.627.627 0 0 0-.895.299a1.4 1.4 0 0 0-.11.537c0 .398.11.995.1 1.244v1.761c0 .876.09 1.752.129 2.627c.04.876.08 1.642.14 2.458q0 .816.149 1.642c0 .07-.299.438 2.796.467a7 7 0 0 0 1.701-.189a5.35 5.35 0 0 0 2.587-1.383a.34.34 0 0 0 .12-.328a.4.4 0 0 0 .149-.279c.08-.308.17-.597.219-.915q.04-.192.05-.388q.021-.196 0-.388a3.3 3.3 0 0 0-.22-.647m-6.617-4.637L14.6 15.95c.626.527 1.273.995 1.93 1.502c.657.508 1.622 1.184 2.438 1.751q-.934.39-1.92.617l-.996.2l-.995.158a7.8 7.8 0 0 1-1.86.07v-.905l.209-4.388zm4.08 7.572c-.578.12-1.175.16-1.762.23c-.866.099-1.692.208-2.478.258v-1.87c.64.225 1.312.343 1.99.348q.557-.015 1.105-.12q.54-.128 1.055-.338a9.6 9.6 0 0 0 1.582-.746a2 2 0 0 0 0 .248q-.015.195 0 .388c0 .319.15.597.209.906a4.7 4.7 0 0 1-1.702.696"/></g></svg>,
                    link: "/order-analysis",
                },
            ],
        };

        const socialInbox: NavSection = {
            label: "Social Inbox",
            routes: [
                {
                    id: "inbox-facebook",
                    title: "Facebook",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" className={iconCls}><path fill="#1877F2" d="M12 2.04c-5.5 0-10 4.49-10 10.02c0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89c1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02Z"/></svg>,
                    link: "/inbox/facebook",
                },
                {
                    id: "inbox-instagram",
                    title: "Instagram",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" className={iconCls}><defs><linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="25%" stopColor="#e6683c"/><stop offset="50%" stopColor="#dc2743"/><stop offset="75%" stopColor="#cc2366"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs><path fill="url(#ig-grad)" d="M8 5.67C6.71 5.67 5.67 6.72 5.67 8S6.72 10.33 8 10.33S10.33 9.28 10.33 8S9.28 5.67 8 5.67ZM15 8c0-.97 0-1.92-.05-2.89c-.05-1.12-.31-2.12-1.13-2.93c-.82-.82-1.81-1.08-2.93-1.13C9.92 1 8.97 1 8 1s-1.92 0-2.89.05c-1.12.05-2.12.31-2.93 1.13C1.36 3 1.1 3.99 1.05 5.11C1 6.08 1 7.03 1 8s0 1.92.05 2.89c.05 1.12.31 2.12 1.13 2.93c.82.82 1.81 1.08 2.93 1.13C6.08 15 7.03 15 8 15s1.92 0 2.89-.05c1.12-.05 2.12-.31 2.93-1.13c.82-.82 1.08-1.81 1.13-2.93c.06-.96.05-1.92.05-2.89Zm-7 3.59c-1.99 0-3.59-1.6-3.59-3.59S6.01 4.41 8 4.41s3.59 1.6 3.59 3.59s-1.6 3.59-3.59 3.59Zm3.74-6.49c-.46 0-.84-.37-.84-.84s.37-.84.84-.84s.84.37.84.84a.8.8 0 0 1-.24.59a.8.8 0 0 1-.59.24Z"/></svg>,
                    link: "/inbox/instagram",
                },
                {
                    id: "inbox-whatsapp",
                    title: "WhatsApp",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 258" className={iconCls}><defs><linearGradient id="wa-grad0" x1="50%" x2="50%" y1="100%" y2="0%"><stop offset="0%" stopColor="#1FAF38"/><stop offset="100%" stopColor="#60D669"/></linearGradient><linearGradient id="wa-grad1" x1="50%" x2="50%" y1="100%" y2="0%"><stop offset="0%" stopColor="#F9F9F9"/><stop offset="100%" stopColor="#FFF"/></linearGradient></defs><path fill="url(#wa-grad0)" d="M5.463 127.456c-.006 21.677 5.658 42.843 16.428 61.499L4.433 252.697l65.232-17.104a122.994 122.994 0 0 0 58.8 14.97h.054c67.815 0 123.018-55.183 123.047-123.01c.013-32.867-12.775-63.773-36.009-87.025c-23.23-23.25-54.125-36.061-87.043-36.076c-67.823 0-123.022 55.18-123.05 123.004"/><path fill="url(#wa-grad1)" d="M1.07 127.416c-.007 22.457 5.86 44.38 17.014 63.704L0 257.147l67.571-17.717c18.618 10.151 39.58 15.503 60.91 15.511h.055c70.248 0 127.434-57.168 127.464-127.423c.012-34.048-13.236-66.065-37.3-90.15C194.633 13.286 162.633.014 128.536 0C58.276 0 1.099 57.16 1.071 127.416Zm40.24 60.376l-2.523-4.005c-10.606-16.864-16.204-36.352-16.196-56.363C22.614 69.029 70.138 21.52 128.576 21.52c28.3.012 54.896 11.044 74.9 31.06c20.003 20.018 31.01 46.628 31.003 74.93c-.026 58.395-47.551 105.91-105.943 105.91h-.042c-19.013-.01-37.66-5.116-53.922-14.765l-3.87-2.295l-40.098 10.513l10.706-39.082Z"/><path fill="#FFF" d="M96.678 74.148c-2.386-5.303-4.897-5.41-7.166-5.503c-1.858-.08-3.982-.074-6.104-.074c-2.124 0-5.575.799-8.492 3.984c-2.92 3.188-11.148 10.892-11.148 26.561c0 15.67 11.413 30.813 13.004 32.94c1.593 2.123 22.033 35.307 54.405 48.073c26.904 10.609 32.379 8.499 38.218 7.967c5.84-.53 18.844-7.702 21.497-15.139c2.655-7.436 2.655-13.81 1.859-15.142c-.796-1.327-2.92-2.124-6.105-3.716c-3.186-1.593-18.844-9.298-21.763-10.361c-2.92-1.062-5.043-1.592-7.167 1.597c-2.124 3.184-8.223 10.356-10.082 12.48c-1.857 2.129-3.716 2.394-6.9.801c-3.187-1.598-13.444-4.957-25.613-15.806c-9.468-8.442-15.86-18.867-17.718-22.056c-1.858-3.184-.199-4.91 1.398-6.497c1.431-1.427 3.186-3.719 4.78-5.578c1.588-1.86 2.118-3.187 3.18-5.311c1.063-2.126.531-3.986-.264-5.579c-.798-1.593-6.987-17.343-9.819-23.64"/></svg>,
                    link: "/inbox/whatsapp",
                },
                {
                    id: "inbox-orders",
                    title: "Inbox Orders",
                    icon: <svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" className={iconCls}><g fill="none"><path fill="#8fbffa" d="M.735 10.493a3.135 3.135 0 0 0 2.753 2.76c1.142.128 2.315.24 3.512.24s2.37-.112 3.513-.24a3.135 3.135 0 0 0 2.752-2.76c.123-1.136.229-2.303.229-3.493s-.106-2.357-.229-3.493a3.135 3.135 0 0 0-2.752-2.76C9.37.62 8.197.508 7 .508S4.63.62 3.488.748a3.135 3.135 0 0 0-2.753 2.76C.613 4.643.507 5.81.507 7s.106 2.357.228 3.493"/><path fill="#2859c5" fillRule="evenodd" d="M3.488 13.252a3.135 3.135 0 0 1-2.753-2.76A40 40 0 0 1 .532 8.04h3.36c.572 0 1.022.487 1.274 1.002c.273.56.822 1.076 1.833 1.076c1.01 0 1.559-.516 1.833-1.076c.252-.515.701-1.002 1.273-1.002h3.364c-.039.832-.117 1.65-.204 2.454a3.135 3.135 0 0 1-2.752 2.76c-1.142.128-2.316.24-3.513.24s-2.37-.112-3.512-.24Z" clipRule="evenodd"/></g></svg>,
                    link: "/inbox/orders",
                },
            ],
        };

        const administration: NavSection = {
            label: "System",
            routes: [
                {
                    id: "settings",
                    title: "Settings",
                    icon: <img src="https://img.icons8.com/color/50/apple-settings.png" alt="settings" className="h-[14px] w-[14px] shrink-0" />,
                    link: "/settings",
                },
            ],
        };

        const sections = [product];
        if (workspace.routes.length > 0) sections.push(workspace);
        sections.push(socialInbox);
        sections.push(administration);
        return sections;
    }, []);

    // Derive initials for avatar
    const displayName = orgName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account";
    const initials = displayName
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    return (
        <Sidebar collapsible="icon" className="border-r-0 bg-[#dedede] font-sans">
            {/* ── Brand header ────────────────────────────── */}
            <SidebarHeader className="h-[52px] justify-center px-2.5">
                <div className="flex items-center justify-between min-w-0">
                    {!isCollapsed && (
                        <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                        </div>
                    )}
                    {/* Logo + name */}
                    <Link
                        to="/"
                        className={cn(
                            "flex min-w-0 items-center gap-2.5 group",
                            isCollapsed ? "justify-center w-full" : "hidden"
                        )}
                    >
                        <div className="shrink-0 h-7 w-7 rounded-lg bg-black/[0.06] flex items-center justify-center group-hover:bg-black/10 transition-colors">
                            <Logo className="h-4 w-4" />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0 flex-1">
                                {orgLoading ? (
                                    <div className="h-2.5 w-20 rounded bg-sidebar-foreground/10 animate-pulse mb-1" />
                                ) : (
                                    <p className="text-[11px] font-semibold text-sidebar-foreground truncate leading-none">
                                        {orgName || "My Organisation"}
                                    </p>
                                )}
                                <p className="text-[9px] text-sidebar-foreground/40 mt-0.5 leading-none">
                                    Arc Lab Technology
                                </p>
                            </div>
                        )}
                    </Link>

                    {/* Collapse toggle */}
                    {!isCollapsed && (
                        <button
                            onClick={toggleSidebar}
                            className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[#777] hover:text-black hover:bg-black/5 transition-colors"
                            data-testid="button-sidebar-toggle"
                            title="Collapse sidebar"
                        >
                            <PanelLeftClose className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* Expand button when collapsed */}
                {isCollapsed && (
                    <button
                        onClick={toggleSidebar}
                        className="mt-1.5 h-7 w-full rounded-full flex items-center justify-center text-[#777] hover:text-black hover:bg-black/5 transition-colors"
                        data-testid="button-sidebar-toggle-collapsed"
                        title="Expand sidebar"
                    >
                        <PanelLeftOpen className="h-3.5 w-3.5" />
                    </button>
                )}
            </SidebarHeader>

            {/* ── Navigation ──────────────────────────────── */}
            <SidebarContent className="gap-0 overflow-x-hidden px-1 pb-1.5 pt-4">
                <DashboardNavigation sections={navSections} />
            </SidebarContent>

            {/* ── Footer ──────────────────────────────────── */}
            <SidebarFooter className="border-t-0 p-1.5">

                {/* Quick links — hidden when collapsed */}
                {!isCollapsed && (
                    <div className="mb-1.5 bg-white px-2 py-1.5 transition-colors hover:border-[#CCCCCC]" style={{borderWidth:1,borderStyle:"solid",borderColor:"#E0E0E0",borderRadius:8,boxShadow:"0 4px 8px rgba(0,0,0,0)"}}>
                        <p className="mb-1 px-1 text-[11px] font-medium tracking-[0.01em] text-[#8a8a8a]">
                            Support
                        </p>
                        {[
                            { icon: Send, label: "Feedback" },
                            { icon: HelpCircle, label: "Help Center", testid: "link-help-center" },
                            { icon: Lightbulb, label: "Request a Feature" },
                        ].map(({ icon: Icon, label, testid }) => (
                            <Link
                                key={label}
                                to="#"
                                data-testid={testid}
                                className="flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-[11.5px] font-normal tracking-[0.01em] text-[#555] transition-colors hover:bg-black/[0.04] hover:text-black"
                            >
                                <Icon size={13} weight="regular" className="shrink-0" />
                                {label}
                            </Link>
                        ))}
                    </div>
                )}

                {/* Collapsed quick links */}
                {isCollapsed && (
                    <div className="flex flex-col items-center gap-0.5 py-2">
                        {[
                            { icon: Send, label: "Feedback" },
                            { icon: HelpCircle, label: "Help Center" },
                            { icon: Lightbulb, label: "Feature Request" },
                        ].map(({ icon: Icon, label }) => (
                            <Link
                                key={label}
                                to="#"
                                title={label}
                                className="h-7 w-7 rounded-full flex items-center justify-center text-[#777] hover:text-black hover:bg-black/5 transition-colors"
                            >
                                <Icon size={14} weight="regular" />
                            </Link>
                        ))}
                    </div>
                )}

                {/* User row */}
                <div className={cn("p-2", isCollapsed && "flex justify-center")}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            {!isCollapsed ? (
                                <button className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-black/5 transition-colors outline-none group">
                                    <Avatar className="h-7 w-7 shrink-0 rounded-lg">
                                        <AvatarFallback className="rounded-lg bg-black/10 text-[#333] text-[10px] font-semibold">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0 text-left">
                                        {orgLoading ? (
                                            <div className="h-2.5 w-20 rounded bg-sidebar-foreground/10 animate-pulse" />
                                        ) : (
                                            <p className="truncate text-[12px] font-medium leading-tight tracking-[0.01em] text-[#333]">
                                                {displayName}
                                            </p>
                                        )}
                                        <p className="mt-0.5 truncate text-[10px] font-normal leading-tight tracking-[0.01em] text-[#8a8a8a]">
                                            {user?.email ?? ""}
                                        </p>
                                    </div>
                                    <ChevronsUpDown size={12} className="shrink-0 text-[#888] group-hover:text-[#444] transition-colors" />
                                </button>
                            ) : (
                                <button
                                    className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors outline-none"
                                    title="Account"
                                >
                                    <Avatar className="h-7 w-7 rounded-lg">
                                        <AvatarFallback className="rounded-lg bg-black/10 text-[#333] text-[10px] font-semibold">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                </button>
                            )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            side="top"
                            align={isCollapsed ? "center" : "start"}
                            sideOffset={8}
                            className="w-56"
                        >
                            <DropdownMenuLabel className="pb-1.5">
                                <div className="flex items-center gap-2.5">
                                    <Avatar className="h-8 w-8 rounded-lg shrink-0">
                                        <AvatarFallback className="rounded-lg bg-muted text-[11px] font-semibold">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold truncate">{displayName}</p>
                                        <p className="text-[10px] text-muted-foreground font-normal truncate">{user?.email ?? ""}</p>
                                    </div>
                                </div>
                            </DropdownMenuLabel>

                            {isAdmin && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link to="/settings" className="flex items-center gap-2 cursor-pointer text-[11px]">
                                            <img src="https://img.icons8.com/color/50/apple-settings.png" alt="settings" className="h-[13px] w-[13px] shrink-0" />
                                            Settings
                                        </Link>
                                    </DropdownMenuItem>
                                </>
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => signOut()}
                                className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive text-[11px]"
                                data-testid="button-sign-out"
                            >
                                <LogOut size={13} className="shrink-0" />
                                Sign Out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Copyright */}
                {!isCollapsed && (
                    <p className="px-4 pb-2 text-[9px] text-sidebar-foreground/25">
                        © 2026 Arc Lab Technology
                    </p>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
