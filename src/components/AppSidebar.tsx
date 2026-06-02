"use client";

import React, { useMemo } from "react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
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
    Send,
    Lightbulb,

} from "lucide-react";
import { Logo } from "./logo";
import { SidebarAlerts } from "./ui/sidebar-alerts";
import type { NavSection } from "./nav-main";
import DashboardNavigation from "./nav-main";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { Link } from "react-router-dom";

export function AppSidebar() {
    const { state, toggleSidebar } = useSidebar();
    const isCollapsed = state === "collapsed";
    const { isAdmin } = useUserRole();
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
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_3111_22255)"><path d="M22.0001 8.5C22.0001 11.76 19.6001 14.45 16.4801 14.92V14.86C16.1701 10.98 13.0201 7.83 9.11008 7.52H9.08008C9.55008 4.4 12.2401 2 15.5001 2C19.0901 2 22.0001 4.91 22.0001 8.5Z" fill="white" style={{fill: 'var(--fillg)'}}/><path d="M14.98 14.98C14.73 11.81 12.19 9.27 9.02 9.02C8.85 9.01 8.67 9 8.5 9C4.91 9 2 11.91 2 15.5C2 19.09 4.91 22 8.5 22C12.09 22 15 19.09 15 15.5C15 15.33 14.99 15.15 14.98 14.98ZM9.38 16.38L8.5 18L7.62 16.38L6 15.5L7.62 14.62L8.5 13L9.38 14.62L11 15.5L9.38 16.38Z" fill="white" style={{fill: 'var(--fillg)'}}/></g><defs><clipPath id="clip0_3111_22255"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
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
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_4418_8364)"><path d="M11.75 7H11H7C4.24 7 2 9.24 2 12V17C2 19.76 4.24 22 7 22H12C14.76 22 17 19.76 17 17V13V12.25C17 9.35 14.65 7 11.75 7Z" fill="white" style={{fill: 'var(--fillg)'}}/><path d="M21.8799 6.33033C22.4045 8.88991 21.1621 11.2123 19.159 12.306C18.8514 12.4739 18.4999 12.2343 18.4999 11.8838V11.7503C18.4999 8.31033 15.6899 5.50033 12.2499 5.50033H12.1164C11.7659 5.50033 11.5263 5.14879 11.6942 4.84119C12.7879 2.8381 15.1103 1.59574 17.6699 2.12033C19.7599 2.55033 21.4499 4.24033 21.8799 6.33033Z" fill="white" style={{fill: 'var(--fillg)'}}/></g><defs><clipPath id="clip0_4418_8364"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
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
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_4418_8922)"><path d="M17.1499 10C17.7022 10 18.1499 9.55228 18.1499 9C18.1499 8.44772 17.7022 8 17.1499 8C16.5976 8 16.1499 8.44772 16.1499 9C16.1499 9.55228 16.5976 10 17.1499 10Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M17.1499 16C17.7022 16 18.1499 15.5523 18.1499 15C18.1499 14.4477 17.7022 14 17.1499 14C16.5976 14 16.1499 14.4477 16.1499 15C16.1499 15.5523 16.5976 16 17.1499 16Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M19.75 13C20.3023 13 20.75 12.5523 20.75 12C20.75 11.4477 20.3023 11 19.75 11C19.1977 11 18.75 11.4477 18.75 12C18.75 12.5523 19.1977 13 19.75 13Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.7998 10C7.35209 10 7.7998 9.55228 7.7998 9C7.7998 8.44772 7.35209 8 6.7998 8C6.24752 8 5.7998 8.44772 5.7998 9C5.7998 9.55228 6.24752 10 6.7998 10Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.7998 16C7.35209 16 7.7998 15.5523 7.7998 15C7.7998 14.4477 7.35209 14 6.7998 14C6.24752 14 5.7998 14.4477 5.7998 15C5.7998 15.5523 6.24752 16 6.7998 16Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M4.19995 13C4.75224 13 5.19995 12.5523 5.19995 12C5.19995 11.4477 4.75224 11 4.19995 11C3.64767 11 3.19995 11.4477 3.19995 12C3.19995 12.5523 3.64767 13 4.19995 13Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M15.8999 6.19922C16.4522 6.19922 16.8999 5.7515 16.8999 5.19922C16.8999 4.64693 16.4522 4.19922 15.8999 4.19922C15.3476 4.19922 14.8999 4.64693 14.8999 5.19922C14.8999 5.7515 15.3476 6.19922 15.8999 6.19922Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M8.09985 6.19922C8.65214 6.19922 9.09985 5.7515 9.09985 5.19922C9.09985 4.64693 8.65214 4.19922 8.09985 4.19922C7.54757 4.19922 7.09985 4.64693 7.09985 5.19922C7.09985 5.7515 7.54757 6.19922 8.09985 6.19922Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0498 7C12.6021 7 13.0498 6.55228 13.0498 6C13.0498 5.44772 12.6021 5 12.0498 5C11.4975 5 11.0498 5.44772 11.0498 6C11.0498 6.55228 11.4975 7 12.0498 7Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M15.8999 20C16.4522 20 16.8999 19.5523 16.8999 19C16.8999 18.4477 16.4522 18 15.8999 18C15.3476 18 14.8999 18.4477 14.8999 19C14.8999 19.5523 15.3476 20 15.8999 20Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M8.09985 20C8.65214 20 9.09985 19.5523 9.09985 19C9.09985 18.4477 8.65214 18 8.09985 18C7.54757 18 7.09985 18.4477 7.09985 19C7.09985 19.5523 7.54757 20 8.09985 20Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0498 19.1992C12.6021 19.1992 13.0498 18.7515 13.0498 18.1992C13.0498 17.6469 12.6021 17.1992 12.0498 17.1992C11.4975 17.1992 11.0498 17.6469 11.0498 18.1992C11.0498 18.7515 11.4975 19.1992 12.0498 19.1992Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M13.75 10.25C14.4404 10.25 15 9.69036 15 9C15 8.30964 14.4404 7.75 13.75 7.75C13.0596 7.75 12.5 8.30964 12.5 9C12.5 9.69036 13.0596 10.25 13.75 10.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M10.25 10.25C10.9404 10.25 11.5 9.69036 11.5 9C11.5 8.30964 10.9404 7.75 10.25 7.75C9.55964 7.75 9 8.30964 9 9C9 9.69036 9.55964 10.25 10.25 10.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M15.5 13.25C16.1904 13.25 16.75 12.6904 16.75 12C16.75 11.3096 16.1904 10.75 15.5 10.75C14.8096 10.75 14.25 11.3096 14.25 12C14.25 12.6904 14.8096 13.25 15.5 13.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M8.5 13.25C9.19036 13.25 9.75 12.6904 9.75 12C9.75 11.3096 9.19036 10.75 8.5 10.75C7.80964 10.75 7.25 11.3096 7.25 12C7.25 12.6904 7.80964 13.25 8.5 13.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M10.25 16.25C10.9404 16.25 11.5 15.6904 11.5 15C11.5 14.3096 10.9404 13.75 10.25 13.75C9.55964 13.75 9 14.3096 9 15C9 15.6904 9.55964 16.25 10.25 16.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M13.75 16.25C14.4404 16.25 15 15.6904 15 15C15 14.3096 14.4404 13.75 13.75 13.75C13.0596 13.75 12.5 14.3096 12.5 15C12.5 15.6904 13.0596 16.25 13.75 16.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0001 3.33031C11.5101 3.33031 11.1201 2.94031 11.1201 2.45031C11.1201 1.96031 11.5101 1.57031 12.0001 1.57031C12.4901 1.57031 12.8801 1.96031 12.8801 2.45031C12.8801 2.94031 12.4901 3.33031 12.0001 3.33031Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M17.25 3.59961C16.83 3.59961 16.49 3.25961 16.49 2.84961C16.49 2.43961 16.83 2.09961 17.24 2.09961C17.65 2.09961 18 2.43961 18 2.84961C18 3.25961 17.67 3.59961 17.25 3.59961Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.75 3.59961C6.34 3.59961 6 3.25961 6 2.84961C6 2.43961 6.33 2.09961 6.75 2.09961H6.76001C7.17001 2.09961 7.51001 2.43961 7.51001 2.84961C7.51001 3.25961 7.17 3.59961 6.75 3.59961Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0001 22.3791C11.5101 22.3791 11.1201 21.9891 11.1201 21.4991C11.1201 21.0091 11.5101 20.6191 12.0001 20.6191C12.4901 20.6191 12.8801 21.0091 12.8801 21.4991C12.8801 21.9891 12.4901 22.3791 12.0001 22.3791Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M17.25 21.8496C16.83 21.8496 16.49 21.5096 16.49 21.0996C16.49 20.6896 16.83 20.3496 17.24 20.3496C17.65 20.3496 18 20.6896 18 21.0996C18 21.5096 17.67 21.8496 17.25 21.8496Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.75 21.8496C6.34 21.8496 6 21.5096 6 21.0996C6 20.6896 6.33 20.3496 6.75 20.3496H6.76001C7.17001 20.3496 7.51001 20.6896 7.51001 21.0996C7.51001 21.5096 7.17 21.8496 6.75 21.8496Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M1.5499 12.8791C1.0699 12.8791 0.669922 12.4891 0.669922 12.0091V11.9991C0.669922 11.5191 1.0599 11.1191 1.5499 11.1191C2.0399 11.1191 2.4299 11.5091 2.4299 11.9991C2.4299 12.4891 2.0299 12.8791 1.5499 12.8791Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M3.75 17.7502C3.34 17.7502 3 17.4202 3 17.0002V16.9902C3 16.5802 3.34 16.2402 3.75 16.2402C4.16 16.2402 4.5 16.5802 4.5 16.9902C4.5 17.4002 4.16 17.7502 3.75 17.7502Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M3.75 7.75977C3.34 7.75977 3 7.41977 3 7.00977C3 6.59977 3.34 6.25977 3.75 6.25977C4.16 6.25977 4.5 6.58977 4.5 6.99977V7.00977C4.5 7.41977 4.16 7.75977 3.75 7.75977Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M22.5001 12.8791C22.0201 12.8791 21.6201 12.4891 21.6201 12.0091V11.9991C21.6201 11.5191 22.0101 11.1191 22.5001 11.1191C22.9901 11.1191 23.3801 11.5091 23.3801 11.9991C23.3801 12.4891 22.9801 12.8791 22.5001 12.8791Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M20.3 17.7502C19.89 17.7502 19.55 17.4202 19.55 17.0002V16.9902C19.55 16.5802 19.89 16.2402 20.3 16.2402C20.71 16.2402 21.05 16.5802 21.05 16.9902C21.05 17.4002 20.71 17.7502 20.3 17.7502Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M20.3 7.75977C19.89 7.75977 19.55 7.41977 19.55 7.00977C19.55 6.59977 19.89 6.25977 20.3 6.25977C20.71 6.25977 21.05 6.58977 21.05 7.00977V7.01977C21.05 7.41977 20.71 7.75977 20.3 7.75977Z" fill="white" style={{fill:'var(--fillg)'}}/></g><defs><clipPath id="clip0_4418_8922"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/order-analysis",
                    disabled: !isAdmin,
                },
                {
                    id: "studio",
                    title: "Studio",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_655_9443)"><path d="M3.54 12.75H2C1.59 12.75 1.25 12.41 1.25 12C1.25 11.59 1.59 11.25 2 11.25H3.54C3.95 11.25 4.29 11.59 4.29 12C4.29 12.41 3.95 12.75 3.54 12.75Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M22 12.75H20.54C20.13 12.75 19.79 12.41 19.79 12C19.79 11.59 20.13 11.25 20.54 11.25H22C22.41 11.25 22.75 11.59 22.75 12C22.75 12.41 22.41 12.75 22 12.75Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M4.93012 19.82C4.74012 19.82 4.55012 19.75 4.40012 19.6C4.11012 19.31 4.11012 18.83 4.40012 18.54L5.49012 17.45C5.78012 17.16 6.26012 17.16 6.55012 17.45C6.84012 17.74 6.84012 18.22 6.55012 18.51L5.46012 19.6C5.31012 19.75 5.12012 19.82 4.93012 19.82Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M18.0405 6.71C17.8505 6.71 17.6605 6.63999 17.5105 6.48999C17.2205 6.19999 17.2205 5.71999 17.5105 5.42999L18.5405 4.4C18.8305 4.11 19.3105 4.11 19.6005 4.4C19.8905 4.69 19.8905 5.17 19.6005 5.46L18.5705 6.48999C18.4205 6.63999 18.2305 6.71 18.0405 6.71Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12 22.75C11.59 22.75 11.25 22.41 11.25 22V20.46C11.25 20.05 11.59 19.71 12 19.71C12.41 19.71 12.75 20.05 12.75 20.46V22C12.75 22.41 12.41 22.75 12 22.75Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12 4.21C11.59 4.21 11.25 3.87 11.25 3.46V2C11.25 1.59 11.59 1.25 12 1.25C12.41 1.25 12.75 1.59 12.75 2V3.46C12.75 3.87 12.41 4.21 12 4.21Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M19.0699 19.82C18.8799 19.82 18.6899 19.75 18.5399 19.6L17.4499 18.51C17.1599 18.22 17.1599 17.74 17.4499 17.45C17.7399 17.16 18.2199 17.16 18.5099 17.45L19.5999 18.54C19.8899 18.83 19.8899 19.31 19.5999 19.6C19.4499 19.75 19.2599 19.82 19.0699 19.82Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M5.96012 6.71C5.77012 6.71 5.58012 6.63999 5.43012 6.48999L4.40012 5.46C4.11012 5.17 4.11012 4.69 4.40012 4.4C4.69012 4.11 5.17012 4.11 5.46012 4.4L6.49012 5.42999C6.78012 5.71999 6.78012 6.19999 6.49012 6.48999C6.34012 6.63999 6.15012 6.71 5.96012 6.71Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.2797 7.53997L13.3597 10.46C13.3897 10.54 13.4597 10.61 13.5397 10.64L16.4597 11.72C16.7197 11.82 16.7197 12.19 16.4597 12.28L13.5397 13.36C13.4597 13.39 13.3897 13.46 13.3597 13.54L12.2797 16.46C12.1797 16.72 11.8097 16.72 11.7197 16.46L10.6397 13.54C10.6097 13.46 10.5397 13.39 10.4597 13.36L7.53973 12.28C7.27973 12.18 7.27973 11.81 7.53973 11.72L10.4597 10.64C10.5397 10.61 10.6097 10.54 10.6397 10.46L11.7197 7.53997C11.8197 7.27997 12.1897 7.27997 12.2797 7.53997Z" fill="white" style={{fill:'var(--fillg)'}}/></g><defs><clipPath id="clip0_655_9443"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/studio",
                },
            ],
        };

        const socialInbox: NavSection = {
            label: "Social Inbox",
            routes: [
                {
                    id: "inbox-facebook",
                    title: "Facebook",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_4418_9011)"><path d="M22 16.19C22 19.83 19.83 22 16.19 22H15C14.45 22 14 21.55 14 21V15.23C14 14.96 14.22 14.73 14.49 14.73L16.25 14.7C16.39 14.69 16.51 14.59 16.54 14.45L16.89 12.54C16.92 12.36 16.78 12.19 16.59 12.19L14.46 12.22C14.18 12.22 13.96 12 13.95 11.73L13.91 9.28C13.91 9.12 14.04 8.98001 14.21 8.98001L16.61 8.94C16.78 8.94 16.91 8.81001 16.91 8.64001L16.87 6.23999C16.87 6.06999 16.74 5.94 16.57 5.94L13.87 5.98001C12.21 6.01001 10.89 7.37 10.92 9.03L10.97 11.78C10.98 12.06 10.76 12.28 10.48 12.29L9.28 12.31C9.11 12.31 8.98001 12.44 8.98001 12.61L9.01001 14.51C9.01001 14.68 9.14 14.81 9.31 14.81L10.51 14.79C10.79 14.79 11.01 15.01 11.02 15.28L11.11 20.98C11.12 21.54 10.67 22 10.11 22H7.81C4.17 22 2 19.83 2 16.18V7.81C2 4.17 4.17 2 7.81 2H16.19C19.83 2 22 4.17 22 7.81V16.19Z" fill="white" style={{fill:'var(--fillg)'}}/></g><defs><clipPath id="clip0_4418_9011"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/inbox/facebook",
                },
                {
                    id: "inbox-instagram",
                    title: "Instagram",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_4418_8635)"><path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.18C2 19.83 4.17 22 7.81 22H16.18C19.82 22 21.99 19.83 21.99 16.19V7.81C22 4.17 19.83 2 16.19 2ZM12 15.88C9.86 15.88 8.12 14.14 8.12 12C8.12 9.86 9.86 8.12 12 8.12C14.14 8.12 15.88 9.86 15.88 12C15.88 14.14 14.14 15.88 12 15.88ZM17.92 6.88C17.87 7 17.8 7.11 17.71 7.21C17.61 7.3 17.5 7.37 17.38 7.42C17.26 7.47 17.13 7.5 17 7.5C16.73 7.5 16.48 7.4 16.29 7.21C16.2 7.11 16.13 7 16.08 6.88C16.03 6.76 16 6.63 16 6.5C16 6.37 16.03 6.24 16.08 6.12C16.13 5.99 16.2 5.89 16.29 5.79C16.52 5.56 16.87 5.45 17.19 5.52C17.26 5.53 17.32 5.55 17.38 5.58C17.44 5.6 17.5 5.63 17.56 5.67C17.61 5.7 17.66 5.75 17.71 5.79C17.8 5.89 17.87 5.99 17.92 6.12C17.97 6.24 18 6.37 18 6.5C18 6.63 17.97 6.76 17.92 6.88Z" fill="white" style={{fill:'var(--fillg)'}}/></g><defs><clipPath id="clip0_4418_8635"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/inbox/instagram",
                },
                {
                    id: "inbox-whatsapp",
                    title: "WhatsApp",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_4418_8964)"><path d="M21.98 11.4104C21.64 5.61044 16.37 1.14045 10.3 2.14045C6.12004 2.83045 2.77005 6.22043 2.12005 10.4004C1.74005 12.8204 2.24007 15.1104 3.33007 17.0004L2.44006 20.3104C2.24006 21.0604 2.93004 21.7404 3.67004 21.5304L6.93005 20.6304C8.41005 21.5004 10.14 22.0004 11.99 22.0004C17.63 22.0004 22.31 17.0304 21.98 11.4104ZM16.8801 15.7204C16.7901 15.9004 16.68 16.0704 16.54 16.2304C16.29 16.5004 16.02 16.7004 15.72 16.8204C15.42 16.9504 15.09 17.0104 14.74 17.0104C14.23 17.0104 13.68 16.8905 13.11 16.6405C12.53 16.3905 11.9601 16.0604 11.3901 15.6504C10.8101 15.2304 10.2701 14.7604 9.75005 14.2504C9.23005 13.7304 8.77003 13.1804 8.35003 12.6104C7.94003 12.0404 7.61005 11.4704 7.37005 10.9004C7.13005 10.3304 7.01006 9.78045 7.01006 9.26045C7.01006 8.92044 7.07006 8.59044 7.19006 8.29044C7.31006 7.98044 7.50007 7.70045 7.77007 7.45045C8.09007 7.13045 8.44005 6.98045 8.81005 6.98045C8.95005 6.98045 9.09002 7.01044 9.22002 7.07044C9.35002 7.13044 9.47005 7.22044 9.56005 7.35044L10.72 8.99043C10.81 9.12043 10.88 9.23043 10.92 9.34043C10.97 9.45043 10.99 9.55043 10.99 9.65043C10.99 9.77043 10.9501 9.89045 10.8801 10.0104C10.8101 10.1304 10.72 10.2504 10.6 10.3704L10.22 10.7704C10.16 10.8304 10.1401 10.8904 10.1401 10.9704C10.1401 11.0104 10.15 11.0504 10.16 11.0904C10.18 11.1304 10.1901 11.1604 10.2001 11.1904C10.2901 11.3604 10.45 11.5704 10.67 11.8304C10.9 12.0904 11.1401 12.3604 11.4001 12.6204C11.6701 12.8904 11.9301 13.1304 12.2001 13.3604C12.4601 13.5804 12.68 13.7304 12.85 13.8204C12.88 13.8304 12.9101 13.8504 12.9401 13.8604C12.9801 13.8804 13.0201 13.8804 13.0701 13.8804C13.1601 13.8804 13.2201 13.8504 13.2801 13.7904L13.66 13.4104C13.79 13.2804 13.9101 13.1904 14.0201 13.1304C14.1401 13.0604 14.2501 13.0204 14.3801 13.0204C14.4801 13.0204 14.5801 13.0404 14.6901 13.0904C14.8001 13.1404 14.92 13.2004 15.04 13.2904L16.7001 14.4704C16.8301 14.5604 16.92 14.6704 16.98 14.7904C17.03 14.9204 17.0601 15.0404 17.0601 15.1804C17.0001 15.3504 16.9601 15.5404 16.8801 15.7204Z" fill="white" style={{fill:'var(--fillg)'}}/></g><defs><clipPath id="clip0_4418_8964"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/inbox/whatsapp",
                },
                {
                    id: "inbox-orders",
                    title: "Inbox Orders",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_4418_8182)"><path d="M19.48 2.82071L19.76 3.39071C19.9 3.67071 20.25 3.93071 20.56 3.99071L20.94 4.05071C22.08 4.24071 22.35 5.08071 21.53 5.91071L21.18 6.26071C20.95 6.50071 20.82 6.96071 20.89 7.28071L20.94 7.49071C21.25 8.87071 20.52 9.40071 19.32 8.68071L19.06 8.53071C18.75 8.35071 18.25 8.35071 17.94 8.53071L17.68 8.68071C16.47 9.41071 15.74 8.87071 16.06 7.49071L16.11 7.28071C16.18 6.96071 16.05 6.50071 15.82 6.26071L15.47 5.90071C14.65 5.07071 14.92 4.23071 16.06 4.04071L16.44 3.98071C16.74 3.93071 17.1 3.66071 17.24 3.38071L17.52 2.81071C18.06 1.73071 18.94 1.73071 19.48 2.82071Z" fill="white" style={{fill: 'var(--fillg)'}}/><path d="M21.57 10.09C21.21 10.35 20.2 10.83 18.76 10.09C18.6 10.01 18.4 10 18.24 10.09C17.67 10.38 17.15 10.5 16.74 10.5C16.1 10.5 15.65 10.25 15.43 10.09C15.06 9.82 14.28 9.05 14.55 7.42C14.58 7.25 14.53 7.08 14.42 6.95C13.73 6.16 13.35 5.1 13.62 4.27C13.72 3.94 13.51 3.5 13.17 3.5H7C4 3.5 2 5 2 8.5V15.5C2 19 4 20.5 7 20.5H17C20 20.5 22 19 22 15.5V10.27C22 10.08 21.73 9.98 21.57 10.09ZM14.34 12.09C13.68 12.62 12.84 12.88 12 12.88C11.16 12.88 10.31 12.62 9.66 12.09L6.53 9.59C6.21 9.33 6.16 8.85 6.41 8.53C6.67 8.21 7.14 8.15 7.46 8.41L10.59 10.91C11.35 11.52 12.64 11.52 13.4 10.91C13.72 10.65 14.19 10.7 14.45 11.03C14.72 11.35 14.67 11.83 14.34 12.09Z" fill="white" style={{fill: 'var(--fillg)'}}/></g><defs><clipPath id="clip0_4418_8182"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/inbox/orders",
                },
            ],
        };

        const sections = [product];
        sections.push(workspace);
        sections.push(socialInbox);
        return sections;
    }, [isAdmin]);


    return (
        <Sidebar collapsible="icon" className="border-r-0 bg-[#dedede]" style={{ fontFamily: "'Suisse Intl', 'Geist Sans', system-ui, sans-serif" }}>
            {/* ── Brand header ────────────────────────────── */}
            <SidebarHeader className="h-[52px] justify-center px-2.5">
                <div className="flex items-center justify-between min-w-0">
                    {!isCollapsed && (
                        <Link
                            to="/"
                            className="flex min-w-0 items-center gap-2 text-[#111] transition-opacity hover:opacity-70"
                            aria-label="Arc Lab Suite"
                        >
                            <Logo className="h-6 w-6 rounded-md shrink-0" />
                            <span className="text-[15px] font-semibold leading-none tracking-normal">
                                Arc Lab
                            </span>
                            <span
                                className="text-[17px] font-semibold leading-none tracking-normal"
                                style={{ fontFamily: "'Pixelify Sans', system-ui, sans-serif" }}
                            >
                                Suite
                            </span>
                        </Link>
                    )}
                    {/* Logo + name */}
                    <Link
                        to="/"
                        className={cn(
                            "flex min-w-0 items-center gap-2.5 group",
                            isCollapsed ? "justify-center w-full" : "hidden"
                        )}
                    >
                        <Logo className="h-7 w-7 rounded-lg" />
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
                {!isCollapsed && <SidebarAlerts />}

                {/* Settings button */}
                <div className={cn("px-2 pb-1", isCollapsed && "flex justify-center px-0")}>
                    <Link
                        to="/settings"
                        className={cn(
                            "flex items-center gap-2.5 rounded-xl transition-colors hover:bg-black/5",
                            isCollapsed ? "h-8 w-8 justify-center" : "w-full px-2.5 py-2"
                        )}
                        title="System Settings"
                    >
                        <img src="https://img.icons8.com/color/50/apple-settings.png" alt="settings" className="h-[17px] w-[17px] shrink-0" />
                        {!isCollapsed && (
                            <span className="text-[12px] font-medium text-[#333]">System Settings</span>
                        )}
                    </Link>
                </div>

                {/* Copyright */}
                {!isCollapsed && (
                    <div className="flex items-center justify-between px-4 pb-2">
                        <p className="text-[9px] text-sidebar-foreground/25">
                            © 2026 Arc Lab Technology
                        </p>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button className="flex items-center justify-center h-5 w-5 rounded-full bg-white shadow-sm hover:shadow-md transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"><g fill="none"><circle cx="12" cy="12" r="9" fill="#0033ff" opacity=".25"/><circle cx="12" cy="12" r="9" stroke="#0033ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"/><path stroke="#0033ff" strokeLinejoin="round" strokeWidth="3.5" d="M12 16h.01v.01H12z"/><path stroke="#0033ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.586 7.586c.39-.39.9-.585 1.41-.586a1.991 1.991 0 0 1 1.418.586c.39.39.586.902.586 1.414a1.99 1.99 0 0 1-.586 1.414a1.993 1.993 0 0 1-1.418.586L12 12"/></g></svg>
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="right" align="end" sideOffset={8} className="w-52 rounded-xl border border-black/[0.08] bg-white p-0 shadow-xl shadow-black/[0.08]">
                                <div className="px-4 pt-3.5 pb-2.5 border-b border-black/[0.06]">
                                    <p className="text-[11px] font-semibold text-foreground">Support</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">How can we help you?</p>
                                </div>
                                <div className="p-1.5">
                                    {[
                                        { icon: Send, label: "Feedback" },
                                        { icon: HelpCircle, label: "Help Center", testid: "link-help-center" },
                                        { icon: Lightbulb, label: "Request a Feature" },
                                    ].map(({ icon: Icon, label, testid }: { icon: React.ElementType; label: string; testid?: string }) => (
                                        <Link
                                            key={label}
                                            to="#"
                                            data-testid={testid}
                                            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-black/[0.04] hover:text-foreground"
                                        >
                                            <Icon size={13} className="shrink-0 text-muted-foreground" />
                                            {label}
                                        </Link>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
