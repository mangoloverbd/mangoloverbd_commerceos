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
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" className={iconCls}><path fill="currentColor" d="M2 12.204c0-2.289 0-3.433.52-4.381c.518-.949 1.467-1.537 3.364-2.715l2-1.241C9.889 2.622 10.892 2 12 2s2.11.622 4.116 1.867l2 1.241c1.897 1.178 2.846 1.766 3.365 2.715S22 9.915 22 12.203v1.522c0 3.9 0 5.851-1.172 7.063S17.771 22 14 22h-4c-3.771 0-5.657 0-6.828-1.212S2 17.626 2 13.725z" style={{fill: 'var(--fillg)'}}/><path fill="currentColor" d="M11.25 18a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-1.5 0z" style={{fill: 'var(--fillg)'}}/></svg>,
                    link: "/",
                },
                {
                    id: "returns",
                    title: "Returns",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" className={iconCls}><g clipPath="url(#clip0_655_9411)"><path d="M13.1204 20.02C13.0904 19.71 13.1204 19.4 13.2104 19.12C13.2504 19.01 13.2904 18.9 13.3504 18.79C13.7104 18.06 14.4604 17.56 15.3304 17.56H6.44043V4.22C6.44043 3 7.44043 2 8.67043 2H19.7804M13.1204 20.02C13.1304 20.1 13.1404 20.18 13.1604 20.26C13.1704 20.29 13.1704 20.32 13.1904 20.35M13.1204 20.02C13.1304 20.13 13.1604 20.24 13.1904 20.35M13.1904 20.35C13.2104 20.45 13.2404 20.54 13.2804 20.63C13.3404 20.77 13.4104 20.9 13.4904 21.02C13.5604 21.11 13.6204 21.19 13.6904 21.26C14.0304 21.63 14.5004 21.88 15.0004 21.97C15.1104 21.99 15.2204 22 15.3304 22C15.4204 22 15.5104 22 15.6004 21.99C16.3604 21.91 16.9404 21.49 17.3304 20.89C17.3304 20.78 17.4404 20.78 17.4404 20.67C17.5604 20.44 17.6704 20.11 17.6704 19.78V5.61C17.6704 4.11 18.4704 2.73 19.7804 2M19.7804 2C21.0004 2 22.0004 3 22.0004 4.22C22.0004 5.44 21.0004 6.44 19.7804 6.44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.0802 22C16.0802 22.41 15.7402 22.75 15.3302 22.75H4.22023C3.23023 22.75 2.31023 22.26 1.76023 21.44C1.20023 20.6 1.09023 19.57 1.48023 18.6C1.92023 17.53 3.05023 16.81 4.28023 16.81H15.3302C15.7402 16.81 16.0802 17.15 16.0802 17.56C16.0802 17.97 15.7402 18.31 15.3302 18.31C14.7702 18.31 14.2702 18.62 14.0202 19.12C13.9602 19.22 13.9502 19.28 13.9302 19.33C13.8702 19.53 13.8502 19.74 13.8702 19.95C13.8702 19.98 13.8702 20.02 13.8802 20.07C13.9002 20.11 13.9202 20.16 13.9302 20.21C13.9302 20.25 13.9502 20.28 13.9602 20.32C14.0102 20.43 14.0602 20.52 14.1102 20.6C14.1302 20.62 14.1702 20.68 14.2202 20.73C14.4802 21.02 14.7702 21.18 15.1002 21.23H15.1402C15.2002 21.24 15.2702 21.25 15.3302 21.25C15.7402 21.25 16.0802 21.59 16.0802 22Z" fill="currentColor" style={{fill: 'var(--fillg)'}}/></g><defs><clipPath id="clip0_655_9411"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/returns",
                },
                {
                    id: "products",
                    title: "Products",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 14 14" className={iconCls}><g fill="none" fillRule="evenodd" clipRule="evenodd"><path fill="currentColor" style={{fill: 'var(--fillg)'}} d="M3.496 10.511q.027.283.057.56a3.005 3.005 0 0 0 2.644 2.652c.777.086 1.601.164 2.45.164s1.674-.078 2.45-.164a3.005 3.005 0 0 0 2.645-2.653c.083-.773.155-1.59.155-2.433s-.072-1.66-.155-2.433a3.005 3.005 0 0 0-2.645-2.653a42 42 0 0 0-.593-.062c.056.604.098 1.232.098 1.874c0 .842-.072 1.66-.155 2.433a3.005 3.005 0 0 1-2.645 2.653c-.776.087-1.6.164-2.45.164c-.635 0-1.257-.043-1.856-.102"/><path fill="currentColor" style={{fill: 'var(--fillg)', opacity: 0.4}} d="M2.903.277c.776-.086 1.6-.164 2.45-.164c.849 0 1.673.078 2.45.164a3.005 3.005 0 0 1 2.644 2.653c.083.773.155 1.59.155 2.433s-.072 1.66-.155 2.433a3.005 3.005 0 0 1-2.644 2.653c-.777.086-1.601.164-2.45.164s-1.674-.078-2.45-.164A3.005 3.005 0 0 1 .258 7.796a23 23 0 0 1-.155-2.433c0-.842.072-1.66.155-2.433A3.005 3.005 0 0 1 2.903.277"/></g></svg>,
                    link: "/products",
                },
                {
                    id: "customers",
                    title: "Customers",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" className={iconCls}><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8" style={{fill: 'var(--fillg)', opacity: 0.4}}/><path fill="currentColor" d="M17 10a3 3 0 1 0 0-6a3 3 0 0 0 0 6M3 19.2C3 15.8 5.686 13 9 13s6 2.8 6 6.2c0 .442-.358.8-.8.8H3.8a.8.8 0 0 1-.8-.8M15.8 19.2c0-1.904-.65-3.66-1.741-5.053A5.4 5.4 0 0 1 17 13.3c2.761 0 5 2.149 5 4.8c0 .497-.403.9-.9.9z" style={{fill: 'var(--fillg)'}}/></svg>,
                    link: "/customers",
                },
                {
                    id: "order-extraction",
                    title: "Extraction",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_3111_22255)"><path d="M22.0001 8.5C22.0001 11.76 19.6001 14.45 16.4801 14.92V14.86C16.1701 10.98 13.0201 7.83 9.11008 7.52H9.08008C9.55008 4.4 12.2401 2 15.5001 2C19.0901 2 22.0001 4.91 22.0001 8.5Z" fill="white" style={{fill: 'var(--fillg)'}}/><path d="M14.98 14.98C14.73 11.81 12.19 9.27 9.02 9.02C8.85 9.01 8.67 9 8.5 9C4.91 9 2 11.91 2 15.5C2 19.09 4.91 22 8.5 22C12.09 22 15 19.09 15 15.5C15 15.33 14.99 15.15 14.98 14.98ZM9.38 16.38L8.5 18L7.62 16.38L6 15.5L7.62 14.62L8.5 13L9.38 14.62L11 15.5L9.38 16.38Z" fill="white" style={{fill: 'var(--fillg)'}}/></g><defs><clipPath id="clip0_3111_22255"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/order-extraction",
                },
            ],
        };

        const workspace: NavSection = {
            label: "Intelligence",
            routes: [
                {
                    id: "order-chat",
                    title: "AI Chat",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" className={iconCls}><path fill="currentColor" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10H4a2 2 0 0 1-2-2v-8C2 6.477 6.477 2 12 2" opacity=".3" style={{fill: 'var(--fillg)'}}/><path fill="currentColor" d="M15 10H9a1 1 0 0 0-.117 1.993L9 12h6a1 1 0 0 0 .117-1.993zm-3 4H9a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2" style={{fill: 'var(--fillg)'}}/></svg>,
                    link: "/order-chat",
                },
                {
                    id: "order-analysis",
                    title: "AI Analysis",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="#000000" className={iconCls}><g clipPath="url(#clip0_4418_8922)"><path d="M17.1499 10C17.7022 10 18.1499 9.55228 18.1499 9C18.1499 8.44772 17.7022 8 17.1499 8C16.5976 8 16.1499 8.44772 16.1499 9C16.1499 9.55228 16.5976 10 17.1499 10Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M17.1499 16C17.7022 16 18.1499 15.5523 18.1499 15C18.1499 14.4477 17.7022 14 17.1499 14C16.5976 14 16.1499 14.4477 16.1499 15C16.1499 15.5523 16.5976 16 17.1499 16Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M19.75 13C20.3023 13 20.75 12.5523 20.75 12C20.75 11.4477 20.3023 11 19.75 11C19.1977 11 18.75 11.4477 18.75 12C18.75 12.5523 19.1977 13 19.75 13Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.7998 10C7.35209 10 7.7998 9.55228 7.7998 9C7.7998 8.44772 7.35209 8 6.7998 8C6.24752 8 5.7998 8.44772 5.7998 9C5.7998 9.55228 6.24752 10 6.7998 10Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.7998 16C7.35209 16 7.7998 15.5523 7.7998 15C7.7998 14.4477 7.35209 14 6.7998 14C6.24752 14 5.7998 14.4477 5.7998 15C5.7998 15.5523 6.24752 16 6.7998 16Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M4.19995 13C4.75224 13 5.19995 12.5523 5.19995 12C5.19995 11.4477 4.75224 11 4.19995 11C3.64767 11 3.19995 11.4477 3.19995 12C3.19995 12.5523 3.64767 13 4.19995 13Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M15.8999 6.19922C16.4522 6.19922 16.8999 5.7515 16.8999 5.19922C16.8999 4.64693 16.4522 4.19922 15.8999 4.19922C15.3476 4.19922 14.8999 4.64693 14.8999 5.19922C14.8999 5.7515 15.3476 6.19922 15.8999 6.19922Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M8.09985 6.19922C8.65214 6.19922 9.09985 5.7515 9.09985 5.19922C9.09985 4.64693 8.65214 4.19922 8.09985 4.19922C7.54757 4.19922 7.09985 4.64693 7.09985 5.19922C7.09985 5.7515 7.54757 6.19922 8.09985 6.19922Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0498 7C12.6021 7 13.0498 6.55228 13.0498 6C13.0498 5.44772 12.6021 5 12.0498 5C11.4975 5 11.0498 5.44772 11.0498 6C11.0498 6.55228 11.4975 7 12.0498 7Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M15.8999 20C16.4522 20 16.8999 19.5523 16.8999 19C16.8999 18.4477 16.4522 18 15.8999 18C15.3476 18 14.8999 18.4477 14.8999 19C14.8999 19.5523 15.3476 20 15.8999 20Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M8.09985 20C8.65214 20 9.09985 19.5523 9.09985 19C9.09985 18.4477 8.65214 18 8.09985 18C7.54757 18 7.09985 18.4477 7.09985 19C7.09985 19.5523 7.54757 20 8.09985 20Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0498 19.1992C12.6021 19.1992 13.0498 18.7515 13.0498 18.1992C13.0498 17.6469 12.6021 17.1992 12.0498 17.1992C11.4975 17.1992 11.0498 17.6469 11.0498 18.1992C11.0498 18.7515 11.4975 19.1992 12.0498 19.1992Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M13.75 10.25C14.4404 10.25 15 9.69036 15 9C15 8.30964 14.4404 7.75 13.75 7.75C13.0596 7.75 12.5 8.30964 12.5 9C12.5 9.69036 13.0596 10.25 13.75 10.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M10.25 10.25C10.9404 10.25 11.5 9.69036 11.5 9C11.5 8.30964 10.9404 7.75 10.25 7.75C9.55964 7.75 9 8.30964 9 9C9 9.69036 9.55964 10.25 10.25 10.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M15.5 13.25C16.1904 13.25 16.75 12.6904 16.75 12C16.75 11.3096 16.1904 10.75 15.5 10.75C14.8096 10.75 14.25 11.3096 14.25 12C14.25 12.6904 14.8096 13.25 15.5 13.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M8.5 13.25C9.19036 13.25 9.75 12.6904 9.75 12C9.75 11.3096 9.19036 10.75 8.5 10.75C7.80964 10.75 7.25 11.3096 7.25 12C7.25 12.6904 7.80964 13.25 8.5 13.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M10.25 16.25C10.9404 16.25 11.5 15.6904 11.5 15C11.5 14.3096 10.9404 13.75 10.25 13.75C9.55964 13.75 9 14.3096 9 15C9 15.6904 9.55964 16.25 10.25 16.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M13.75 16.25C14.4404 16.25 15 15.6904 15 15C15 14.3096 14.4404 13.75 13.75 13.75C13.0596 13.75 12.5 14.3096 12.5 15C12.5 15.6904 13.0596 16.25 13.75 16.25Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0001 3.33031C11.5101 3.33031 11.1201 2.94031 11.1201 2.45031C11.1201 1.96031 11.5101 1.57031 12.0001 1.57031C12.4901 1.57031 12.8801 1.96031 12.8801 2.45031C12.8801 2.94031 12.4901 3.33031 12.0001 3.33031Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M17.25 3.59961C16.83 3.59961 16.49 3.25961 16.49 2.84961C16.49 2.43961 16.83 2.09961 17.24 2.09961C17.65 2.09961 18 2.43961 18 2.84961C18 3.25961 17.67 3.59961 17.25 3.59961Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.75 3.59961C6.34 3.59961 6 3.25961 6 2.84961C6 2.43961 6.33 2.09961 6.75 2.09961H6.76001C7.17001 2.09961 7.51001 2.43961 7.51001 2.84961C7.51001 3.25961 7.17 3.59961 6.75 3.59961Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M12.0001 22.3791C11.5101 22.3791 11.1201 21.9891 11.1201 21.4991C11.1201 21.0091 11.5101 20.6191 12.0001 20.6191C12.4901 20.6191 12.8801 21.0091 12.8801 21.4991C12.8801 21.9891 12.4901 22.3791 12.0001 22.3791Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M17.25 21.8496C16.83 21.8496 16.49 21.5096 16.49 21.0996C16.49 20.6896 16.83 20.3496 17.24 20.3496C17.65 20.3496 18 20.6896 18 21.0996C18 21.5096 17.67 21.8496 17.25 21.8496Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M6.75 21.8496C6.34 21.8496 6 21.5096 6 21.0996C6 20.6896 6.33 20.3496 6.75 20.3496H6.76001C7.17001 20.3496 7.51001 20.6896 7.51001 21.0996C7.51001 21.5096 7.17 21.8496 6.75 21.8496Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M1.5499 12.8791C1.0699 12.8791 0.669922 12.4891 0.669922 12.0091V11.9991C0.669922 11.5191 1.0599 11.1191 1.5499 11.1191C2.0399 11.1191 2.4299 11.5091 2.4299 11.9991C2.4299 12.4891 2.0299 12.8791 1.5499 12.8791Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M3.75 17.7502C3.34 17.7502 3 17.4202 3 17.0002V16.9902C3 16.5802 3.34 16.2402 3.75 16.2402C4.16 16.2402 4.5 16.5802 4.5 16.9902C4.5 17.4002 4.16 17.7502 3.75 17.7502Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M3.75 7.75977C3.34 7.75977 3 7.41977 3 7.00977C3 6.59977 3.34 6.25977 3.75 6.25977C4.16 6.25977 4.5 6.58977 4.5 6.99977V7.00977C4.5 7.41977 4.16 7.75977 3.75 7.75977Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M22.5001 12.8791C22.0201 12.8791 21.6201 12.4891 21.6201 12.0091V11.9991C21.6201 11.5191 22.0101 11.1191 22.5001 11.1191C22.9901 11.1191 23.3801 11.5091 23.3801 11.9991C23.3801 12.4891 22.9801 12.8791 22.5001 12.8791Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M20.3 17.7502C19.89 17.7502 19.55 17.4202 19.55 17.0002V16.9902C19.55 16.5802 19.89 16.2402 20.3 16.2402C20.71 16.2402 21.05 16.5802 21.05 16.9902C21.05 17.4002 20.71 17.7502 20.3 17.7502Z" fill="white" style={{fill:'var(--fillg)'}}/><path d="M20.3 7.75977C19.89 7.75977 19.55 7.41977 19.55 7.00977C19.55 6.59977 19.89 6.25977 20.3 6.25977C20.71 6.25977 21.05 6.58977 21.05 7.00977V7.01977C21.05 7.41977 20.71 7.75977 20.3 7.75977Z" fill="white" style={{fill:'var(--fillg)'}}/></g><defs><clipPath id="clip0_4418_8922"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/order-analysis",
                    disabled: !isAdmin,
                },
            ],
        };

        const socialInbox: NavSection = {
            label: "Social Inbox",
            routes: [
                {
                    id: "inbox-facebook",
                    title: "Facebook",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 14 14" className={iconCls}><g fill="none"><path fill="currentColor" style={{fill: 'var(--fillg)', opacity: 0.4}} d="M0 1.077v11.846A1.077 1.077 0 0 0 1.077 14h11.846A1.077 1.077 0 0 0 14 12.923V1.077A1.077 1.077 0 0 0 12.923 0H1.077A1.077 1.077 0 0 0 0 1.077"/><path fill="currentColor" style={{fill: 'var(--fillg)'}} d="M9.692 8.895V14H7.28V8.895h-.69a.657.657 0 0 1-.667-.657V7.41a.657.657 0 0 1 .668-.657h.689v-1.26a2.498 2.498 0 0 1 2.574-2.8h1.238a.67.67 0 0 1 .646.69v.796a.62.62 0 0 1-.193.464a.59.59 0 0 1-.463.193h-.528c-.41 0-.819 0-.819.905v1.012h.722a.657.657 0 0 1 .657.657v.83a.657.657 0 0 1-.657.656z"/></g></svg>,
                    link: "/inbox/facebook",
                },
                {
                    id: "inbox-instagram",
                    title: "Instagram",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 14 14" className={iconCls}><g fill="none"><path fill="currentColor" style={{fill: 'var(--fillg)', opacity: 0.4}} d="M.786 3.39A2.604 2.604 0 0 1 3.39.787h6.944a2.604 2.604 0 0 1 2.603 2.603v6.944a2.604 2.604 0 0 1-2.603 2.604H3.39a2.604 2.604 0 0 1-2.604-2.604z"/><path fill="currentColor" style={{fill: 'var(--fillg)'}} d="M10.967 3.353a.632.632 0 1 1-1.265 0a.632.632 0 0 1 1.265 0"/><path fill="currentColor" style={{fill: 'var(--fillg)'}} fillRule="evenodd" d="M10.333 4.144a.75.75 0 1 0 0-1.5a.75.75 0 0 0 0 1.5M3.782 6.862a3.08 3.08 0 1 1 6.16 0a3.08 3.08 0 0 1-6.16 0" clipRule="evenodd"/></g></svg>,
                    link: "/inbox/instagram",
                },
                {
                    id: "inbox-whatsapp",
                    title: "WhatsApp",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 14 14" className={iconCls}><g fill="none"><path fill="currentColor" style={{fill: 'var(--fillg)', opacity: 0.4}} fillRule="evenodd" d="M13.627 7.003C13.627 3.396 10.614.377 7 .379C3.39.381.38 3.394.38 7.003c0 1.213.336 2.412.968 3.449L.41 12.95a.5.5 0 0 0 .557.668l3.28-.593A6.6 6.6 0 0 0 7 13.62c3.614.002 6.627-3.008 6.627-6.618Z" clipRule="evenodd"/><path fill="currentColor" style={{fill: 'var(--fillg)'}} d="M7.356 10.314c1.091.7 2.232.098 2.969-.498c.403-.326.39-.92.036-1.298l-.644-.685c-.193-.206-.524-.207-.785-.1c-.312.125-.68.163-.965.076c-.946-.288-1.343-.78-1.664-1.281c-.256-.399-.134-.934.073-1.333c.131-.253.124-.587-.087-.78l-.692-.631c-.329-.3-.827-.352-1.13-.025c-.757.817-1.264 2.16-.726 2.998c.919 1.43 2.185 2.638 3.615 3.557"/></g></svg>,
                    link: "/inbox/whatsapp",
                },
                {
                    id: "inbox-orders",
                    title: "Inbox Orders",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 14 14" className={iconCls}><g fill="none"><path fill="currentColor" style={{fill: 'var(--fillg)', opacity: 0.4}} d="M.735 10.493a3.135 3.135 0 0 0 2.753 2.76c1.142.128 2.315.24 3.512.24s2.37-.112 3.513-.24a3.135 3.135 0 0 0 2.752-2.76c.123-1.136.229-2.303.229-3.493s-.106-2.357-.229-3.493a3.135 3.135 0 0 0-2.752-2.76C9.37.62 8.197.508 7 .508S4.63.62 3.488.748a3.135 3.135 0 0 0-2.753 2.76C.613 4.643.507 5.81.507 7s.106 2.357.228 3.493"/><path fill="currentColor" style={{fill: 'var(--fillg)'}} fillRule="evenodd" d="M3.488 13.252a3.135 3.135 0 0 1-2.753-2.76A40 40 0 0 1 .532 8.04h3.36c.572 0 1.022.487 1.274 1.002c.273.56.822 1.076 1.833 1.076c1.01 0 1.559-.516 1.833-1.076c.252-.515.701-1.002 1.273-1.002h3.364c-.039.832-.117 1.65-.204 2.454a3.135 3.135 0 0 1-2.752 2.76c-1.142.128-2.316.24-3.513.24s-2.37-.112-3.512-.24Z" clipRule="evenodd"/></g></svg>,
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
                            className="flex min-w-0 items-center gap-1.5 text-[#111] transition-opacity hover:opacity-70"
                            aria-label="Merchant-Suite"
                        >
                            <Logo className="h-[16px] w-auto shrink-0 -ml-0.5" />
                            <span className="text-[15.5px] font-bold tracking-tight text-[#111] antialiased">
                                merchant-suite
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
                        <Logo className="h-7 w-7 rounded-lg object-contain" />
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
                                    Merchant-Suite
                                </p>
                            </div>
                        )}
                    </Link>

                    {/* Collapse toggle */}
                    {!isCollapsed && (
                        <button
                            onClick={toggleSidebar}
                            className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-[#666] hover:text-black hover:bg-black/5 transition-colors"
                            data-testid="button-sidebar-toggle"
                            title="Collapse sidebar"
                        >
                            <PanelLeftClose size={17} strokeWidth={1.5} />
                        </button>
                    )}
                </div>

                {/* Expand button when collapsed */}
                {isCollapsed && (
                    <button
                        onClick={toggleSidebar}
                        className="mt-1.5 h-8 w-8 mx-auto rounded-md flex items-center justify-center text-[#666] hover:text-black hover:bg-black/5 transition-colors"
                        data-testid="button-sidebar-toggle-collapsed"
                        title="Expand sidebar"
                    >
                        <PanelLeftOpen size={17} strokeWidth={1.5} />
                    </button>
                )}
            </SidebarHeader>

            {/* ── Navigation ──────────────────────────────── */}
            <SidebarContent className="gap-0 overflow-x-hidden px-1 pb-1.5 pt-4">
                <DashboardNavigation sections={navSections} />
            </SidebarContent>

            {/* ── Footer ──────────────────────────────────── */}
            <SidebarFooter className="border-t-0 p-1.5">
                {/* Billing button */}
                <div className={cn("px-2", isCollapsed && "flex justify-center px-0")}>
                    <Link
                        to="/billing"
                        className={cn(
                            "group/footer-link flex items-center gap-2 rounded-lg transition-all hover:bg-black/5 hover:text-[#111]",
                            isCollapsed ? "h-8 w-8 justify-center" : "w-full h-7 px-2 py-2"
                        )}
                        title="Billing & Plan"
                    >
                        <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center transform-gpu transition-all duration-300 ease-out group-hover/footer-link:-translate-y-0.5 group-hover/footer-link:-rotate-6 group-hover/footer-link:scale-125">
                            <svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0"><g clipPath="url(#clip0_billing)"><path d="M15.012 1.5C14.177 1.5 13.5 3.51472 13.5 6H15.012C15.7407 6 16.105 6 16.3306 5.74841C16.5562 5.49682 16.5169 5.1655 16.4384 4.50286C16.2311 2.75357 15.6707 1.5 15.012 1.5Z" stroke="currentColor" strokeWidth="1.125" className="transition-colors group-hover/footer-link:stroke-[#0c6fff]"/><path d="M13.5 6.0407V13.9843C13.5 15.1181 13.5 15.685 13.1535 15.9081C12.5873 16.2728 11.7121 15.5081 11.2718 15.2305C10.9081 15.0011 10.7263 14.8864 10.5244 14.8798C10.3063 14.8726 10.1212 14.9826 9.72817 15.2305L8.295 16.1343C7.90838 16.378 7.7151 16.5 7.5 16.5C7.28491 16.5 7.09159 16.378 6.705 16.1343L5.27185 15.2305C4.90811 15.0011 4.72624 14.8864 4.5244 14.8798C4.30629 14.8726 4.1212 14.9826 3.72815 15.2305C3.28796 15.5081 2.41265 16.2728 1.84646 15.9081C1.5 15.685 1.5 15.1181 1.5 13.9843V6.0407C1.5 3.90019 1.5 2.82994 2.15901 2.16497C2.81802 1.5 3.87868 1.5 6 1.5H15" stroke="currentColor" strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round" className="transition-colors group-hover/footer-link:stroke-[#0c6fff]"/><path d="M4.5 4.5H10.5" stroke="currentColor" strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round" className="transition-colors group-hover/footer-link:stroke-[#0c6fff]"/><path d="M6 7.5H4.5" stroke="currentColor" strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round" className="transition-colors group-hover/footer-link:stroke-[#0c6fff]"/></g></svg>
                        </span>
                        {!isCollapsed && (
                            <span className="text-[12.5px] font-medium text-[#333] font-sf-text tracking-normal">Billing & Plan</span>
                        )}
                    </Link>
                </div>

                {/* Settings button */}
                <div className={cn("px-2", isCollapsed && "flex justify-center px-0")}>
                    <Link
                        to="/settings"
                        className={cn(
                            "group/footer-link flex items-center gap-2 rounded-lg transition-all hover:bg-black/5 hover:text-[#111]",
                            isCollapsed ? "h-8 w-8 justify-center" : "w-full h-7 px-2 py-2"
                        )}
                        title="System Settings"
                    >
                        <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center transform-gpu transition-all duration-300 ease-out group-hover/footer-link:-translate-y-0.5 group-hover/footer-link:-rotate-6 group-hover/footer-link:scale-125">
                            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" className="text-[#333]"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M12 3v2m0 0a7 7 0 0 0-7 7m7-7a7 7 0 0 1 7 7m0 0h2m-2 0a7 7 0 0 1-7 7m0 0v2m0-2a7 7 0 0 1-7-7m0 0H3m4.5-7.794l1 1.732M18.062 8.5l1.732-1M15.5 18.062l1 1.732M5.938 15.5l-1.732 1m0-9l1.732 1M15.5 5.938l1-1.732M18.062 15.5l1.732 1M8.5 18.062l-1 1.732M12 12L7 7.101M12 12l-1.812 6.762M12 12l6.762-1.812"/></svg>
                        </span>
                        {!isCollapsed && (
                            <span className="text-[12.5px] font-medium text-[#333] font-sf-text tracking-normal">System Settings</span>
                        )}
                    </Link>
                </div>

                {/* Copyright */}
                {!isCollapsed && (
                    <div className="flex items-center justify-between px-4 pb-2">
                        <p className="text-[9px] text-sidebar-foreground/25">
                            © 2026 Merchant-Suite
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
