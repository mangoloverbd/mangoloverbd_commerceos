"use client";

import React, { useMemo } from "react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import type { NavSection } from "./nav-main";
import DashboardNavigation from "./nav-main";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { useNavCounts } from "@/hooks/useNavCounts";
import { Link } from "react-router-dom";
import { CaretUpDown } from "@phosphor-icons/react";

export function AppSidebar() {
    const { state, toggleSidebar } = useSidebar();
    const isCollapsed = state === "collapsed";
    const { isAdmin, role } = useUserRole();
    const { data: navCounts } = useNavCounts();
    const returnsPending = navCounts?.returns_pending ?? 0;
    const protectionHeld = navCounts?.order_protection_held ?? 0;
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
                    id: "overview",
                    title: "Overview",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" className={iconCls}><path d="M18 8C18 11.3137 15.3137 14 12 14C8.68629 14 6 11.3137 6 8C6 4.68629 8.68629 2 12 2C15.3137 2 18 4.68629 18 8Z" style={{fill: 'var(--fillg)'}}></path><path d="M5.03349 10.7834C3.22163 11.816 2 13.7653 2 16C2 19.3137 4.68629 22 8 22C11.3137 22 14 19.3137 14 16C14 15.7437 13.9839 15.4911 13.9527 15.2432C13.3301 15.4107 12.6755 15.5 12 15.5C8.84139 15.5 6.13882 13.5474 5.03349 10.7834Z" style={{fill: 'var(--fillg)', opacity: 0.4}}></path><path d="M15.3866 14.6936C15.4611 15.1179 15.5 15.5544 15.5 16C15.5 18.0906 14.6446 19.9815 13.2646 21.3416C14.0849 21.7625 15.0147 22 16 22C19.3137 22 22 19.3137 22 16C22 13.7653 20.7783 11.816 18.9665 10.7834C18.2876 12.4811 17.0062 13.8726 15.3866 14.6936Z" style={{fill: 'var(--fillg)', opacity: 0.4}}></path></svg>,
                    link: "/overview",
                },
                {
                    id: "returns",
                    title: "Returns",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" className={iconCls}><g clipPath="url(#clip0_655_9411)"><path d="M13.1204 20.02C13.0904 19.71 13.1204 19.4 13.2104 19.12C13.2504 19.01 13.2904 18.9 13.3504 18.79C13.7104 18.06 14.4604 17.56 15.3304 17.56H6.44043V4.22C6.44043 3 7.44043 2 8.67043 2H19.7804M13.1204 20.02C13.1304 20.1 13.1404 20.18 13.1604 20.26C13.1704 20.29 13.1704 20.32 13.1904 20.35M13.1204 20.02C13.1304 20.13 13.1604 20.24 13.1904 20.35M13.1904 20.35C13.2104 20.45 13.2404 20.54 13.2804 20.63C13.3404 20.77 13.4104 20.9 13.4904 21.02C13.5604 21.11 13.6204 21.19 13.6904 21.26C14.0304 21.63 14.5004 21.88 15.0004 21.97C15.1104 21.99 15.2204 22 15.3304 22C15.4204 22 15.5104 22 15.6004 21.99C16.3604 21.91 16.9404 21.49 17.3304 20.89C17.3304 20.78 17.4404 20.78 17.4404 20.67C17.5604 20.44 17.6704 20.11 17.6704 19.78V5.61C17.6704 4.11 18.4704 2.73 19.7804 2M19.7804 2C21.0004 2 22.0004 3 22.0004 4.22C22.0004 5.44 21.0004 6.44 19.7804 6.44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.0802 22C16.0802 22.41 15.7402 22.75 15.3302 22.75H4.22023C3.23023 22.75 2.31023 22.26 1.76023 21.44C1.20023 20.6 1.09023 19.57 1.48023 18.6C1.92023 17.53 3.05023 16.81 4.28023 16.81H15.3302C15.7402 16.81 16.0802 17.15 16.0802 17.56C16.0802 17.97 15.7402 18.31 15.3302 18.31C14.7702 18.31 14.2702 18.62 14.0202 19.12C13.9602 19.22 13.9502 19.28 13.9302 19.33C13.8702 19.53 13.8502 19.74 13.8702 19.95C13.8702 19.98 13.8702 20.02 13.8802 20.07C13.9002 20.11 13.9202 20.16 13.9302 20.21C13.9302 20.25 13.9502 20.28 13.9602 20.32C14.0102 20.43 14.0602 20.52 14.1102 20.6C14.1302 20.62 14.1702 20.68 14.2202 20.73C14.4802 21.02 14.7702 21.18 15.1002 21.23H15.1402C15.2002 21.24 15.2702 21.25 15.3302 21.25C15.7402 21.25 16.0802 21.59 16.0802 22Z" fill="currentColor" style={{fill: 'var(--fillg)'}}/></g><defs><clipPath id="clip0_655_9411"><rect width="24" height="24" fill="white"/></clipPath></defs></svg>,
                    link: "/returns",
                    badge: returnsPending,
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
                    id: "online-store",
                    title: "Online Store",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" className={iconCls}><path fill-rule="evenodd" clip-rule="evenodd" d="M8.25012 7.01346C8.25004 7.00898 8.25 7.00449 8.25 7V6C8.25 3.92893 9.92893 2.25 12 2.25C14.0711 2.25 15.75 3.92893 15.75 6V7C15.75 7.0045 15.75 7.00898 15.7499 7.01346C17.0472 7.04975 17.8375 7.18393 18.4425 7.67997C19.272 8.35995 19.5029 9.5144 19.9646 11.8233L20.5646 14.8233C21.2287 18.1437 21.5608 19.8039 20.6606 20.902C19.7604 22 18.0673 22 14.6812 22H9.3188C5.93262 22 4.23954 22 3.33936 20.902C2.43919 19.8039 2.77123 18.1437 3.43532 14.8233L4.03532 11.8233C4.4971 9.5144 4.72799 8.35995 5.55742 7.67997C6.16251 7.18392 6.95273 7.04975 8.25012 7.01346ZM9.75 6C9.75 4.75736 10.7574 3.75 12 3.75C13.2426 3.75 14.25 4.75736 14.25 6V7C14.25 7 14.25 7 14.25 7C14.1944 6.99999 14.1381 7 14.0812 7H9.9188C9.86185 7 9.80559 7 9.75 7.00001C9.75 7.00001 9.75 7.00001 9.75 7.00001V6ZM12.0004 17.25C11.0219 17.25 10.1874 16.625 9.87821 15.7501C9.74018 15.3595 9.31168 15.1548 8.92115 15.2929C8.53061 15.4309 8.32592 15.8594 8.46395 16.2499C8.97839 17.7054 10.3664 18.75 12.0004 18.75C13.6343 18.75 15.0224 17.7054 15.5368 16.2499C15.6748 15.8594 15.4701 15.4309 15.0796 15.2929C14.6891 15.1548 14.2606 15.3595 14.1225 15.7501C13.8133 16.625 12.9789 17.25 12.0004 17.25Z" style={{fill: 'var(--fillg)'}}></path></svg>,
                    link: "/online-store",
                    disabled: !isAdmin,
                },
                {
                    id: "warehouses",
                    title: "Warehouses",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" className={iconCls}><g transform="translate(12 12) scale(1.12) translate(-12 -12)"><path fill="currentColor" d="M6.72 16.64a1 1 0 1 1 .56 1.92c-.5.146-.86.3-1.091.44c.238.143.614.303 1.136.452C8.48 19.782 10.133 20 12 20s3.52-.218 4.675-.548c.523-.149.898-.309 1.136-.452c-.23-.14-.59-.294-1.09-.44a1 1 0 0 1 .559-1.92c.668.195 1.28.445 1.75.766c.435.299.97.82.97 1.594c0 .783-.548 1.308-.99 1.607c-.478.322-1.103.573-1.786.768C15.846 21.77 14 22 12 22s-3.846-.23-5.224-.625c-.683-.195-1.308-.446-1.786-.768c-.442-.3-.99-.824-.99-1.607c0-.774.535-1.295.97-1.594c.47-.321 1.082-.571 1.75-.766M12 7.5c-1.54 0-2.502 1.667-1.732 3c.357.619 1.017 1 1.732 1c1.54 0 2.502-1.667 1.732-3A2 2 0 0 0 12 7.5" style={{fill: 'var(--fillg)'}}/><path fill="currentColor" d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 2.568-1.4 4.656-2.85 6.14a16.4 16.4 0 0 1-1.853 1.615c-.594.446-1.952 1.282-1.952 1.282a1.71 1.71 0 0 1-1.69 0a21 21 0 0 1-1.952-1.282A16.4 16.4 0 0 1 7.35 15.64C5.9 14.156 4.5 12.068 4.5 9.5A7.5 7.5 0 0 1 12 2" style={{fill: 'var(--fillg)'}} opacity=".4"/></g></svg>,
                    link: "/warehouses",
                },
                {
                    id: "order-protection",
                    title: "Order Protection",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" className={iconCls}><path d="M3 11.9914C3 17.6294 7.23896 20.3655 9.89856 21.5273C10.62 21.8424 10.9807 22 12 22V8L3 11V11.9914Z" style={{fill: 'var(--fillg)'}}/><path d="M14.1014 21.5273C16.761 20.3655 21 17.6294 21 11.9914V11L12 8V22C13.0193 22 13.38 21.8424 14.1014 21.5273Z" style={{fill: 'var(--fillg)', opacity: 0.5}}/><path d="M8.83772 2.80472L8.26491 3.00079C5.25832 4.02996 3.75503 4.54454 3.37752 5.08241C3 5.62028 3 7.21907 3 10.4167V11L12 8V2C11.1886 2 10.405 2.26824 8.83772 2.80472Z" style={{fill: 'var(--fillg)', opacity: 0.5}}/><path d="M15.7351 3.00079L15.1623 2.80472C13.595 2.26824 12.8114 2 12 2V8L21 11V10.4167C21 7.21907 21 5.62028 20.6225 5.08241C20.245 4.54454 18.7417 4.02996 15.7351 3.00079Z" style={{fill: 'var(--fillg)'}}/></svg>,
                    link: "/order-protection",
                    disabled: !isAdmin,
                    badge: isAdmin ? protectionHeld : 0,
                },
            ],
        };

        const workspace: NavSection = {
            label: "Intelligence",
            collapsible: true,
            routes: [
                {
                    id: "order-chat",
                    title: "Ask Edith",
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
            collapsible: true,
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

        const reports: NavSection = {
            label: "Reports",
            collapsible: true,
            routes: [
                {
                    id: "staff-performance",
                    title: "Staff",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" className={iconCls}><path fill="currentColor" style={{fill: 'var(--fillg)'}} d="M16 17v2H2v-2s0-4 7-4s7 4 7 4m-3.5-9.5A3.5 3.5 0 1 0 9 11a3.5 3.5 0 0 0 3.5-3.5m3.44 5.5A5.32 5.32 0 0 1 18 17v2h4v-2s0-3.63-6.06-4M15 4a3.4 3.4 0 0 0-1.93.59a5 5 0 0 1 0 5.82A3.4 3.4 0 0 0 15 11a3.5 3.5 0 0 0 0-7"/></svg>,
                    link: "/reports/staff",
                },
                {
                    id: "activity-log",
                    title: "Activity Log",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" className={iconCls}><path fill="currentColor" style={{fill: 'var(--fillg)'}} d="M20.3116 12.6473L20.8293 10.7154C21.4335 8.46034 21.7356 7.3328 21.5081 6.35703C21.3285 5.58657 20.9244 4.88668 20.347 4.34587C19.6157 3.66095 18.4881 3.35883 16.2331 2.75458C13.978 2.15033 12.8504 1.84821 11.8747 2.07573C11.1042 2.25537 10.4043 2.65945 9.86351 3.23687C9.27709 3.86298 8.97128 4.77957 8.51621 6.44561C8.43979 6.7254 8.35915 7.02633 8.27227 7.35057L8.27222 7.35077L7.75458 9.28263C7.15033 11.5377 6.84821 12.6652 7.07573 13.641C7.25537 14.4115 7.65945 15.1114 8.23687 15.6522C8.96815 16.3371 10.0957 16.6392 12.3508 17.2435L12.3508 17.2435C14.3834 17.7881 15.4999 18.0873 16.415 17.9744C16.5152 17.9621 16.6129 17.9448 16.7092 17.9223C17.4796 17.7427 18.1795 17.3386 18.7203 16.7612C19.4052 16.0299 19.7074 14.9024 20.3116 12.6473Z"/><path opacity="0.5" fill="currentColor" style={{fill: 'var(--fillg)'}} d="M16.4149 17.9745C16.2064 18.6128 15.8398 19.1903 15.347 19.6519C14.6157 20.3368 13.4881 20.6389 11.2331 21.2432C8.97798 21.8474 7.85044 22.1496 6.87466 21.922C6.10421 21.7424 5.40432 21.3383 4.86351 20.7609C4.17859 20.0296 3.87647 18.9021 3.27222 16.647L2.75458 14.7152C2.15033 12.4601 1.84821 11.3325 2.07573 10.3568C2.25537 9.5863 2.65945 8.88641 3.23687 8.3456C3.96815 7.66068 5.09569 7.35856 7.35077 6.75431C7.7774 6.64 8.16369 6.53649 8.51621 6.44534C8.51618 6.44545 8.51624 6.44524 8.51621 6.44534C8.43979 6.72513 8.3591 7.02657 8.27222 7.35081L7.75458 9.28266C7.15033 11.5377 6.84821 12.6653 7.07573 13.6411C7.25537 14.4115 7.65945 15.1114 8.23687 15.6522C8.96815 16.3371 10.0957 16.6393 12.3508 17.2435C14.3833 17.7881 15.4999 18.0873 16.4149 17.9745Z"/></svg>,
                    link: "/reports/activity",
                },
                {
                    id: "business-report",
                    title: "Business Report",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" className={iconCls}><path fillRule="evenodd" clipRule="evenodd" d="M14 20.5V4.25C14 3.52169 13.9984 3.05091 13.9518 2.70403C13.908 2.37872 13.8374 2.27676 13.7803 2.21967C13.7232 2.16258 13.6213 2.09197 13.296 2.04823C12.9491 2.00159 12.4783 2 11.75 2C11.0217 2 10.5509 2.00159 10.204 2.04823C9.87872 2.09197 9.77676 2.16258 9.71967 2.21967C9.66258 2.27676 9.59197 2.37872 9.54823 2.70403C9.50159 3.05091 9.5 3.52169 9.5 4.25V20.5H14Z" fill="currentColor" style={{fill: 'var(--fillg)'}}/><path opacity="0.7" d="M8 8.75C8 8.33579 7.66421 8 7.25 8H4.25C3.83579 8 3.5 8.33579 3.5 8.75V20.5H8V8.75Z" fill="currentColor" style={{fill: 'var(--fillg)'}}/><path opacity="0.7" d="M20 13.75C20 13.3358 19.6642 13 19.25 13H16.25C15.8358 13 15.5 13.3358 15.5 13.75V20.5H20V13.75Z" fill="currentColor" style={{fill: 'var(--fillg)'}}/><path opacity="0.5" d="M1.75 20.5C1.33579 20.5 1 20.8358 1 21.25C1 21.6642 1.33579 22 1.75 22H21.75C22.1642 22 22.5 21.6642 22.5 21.25C22.5 20.8358 22.1642 20.5 21.75 20.5H21.5H20H15.5H14H9.5H8H3.5H2H1.75Z" fill="currentColor" style={{fill: 'var(--fillg)'}}/></svg>,
                    link: "/reports/business",
                    disabled: !isAdmin,
                },
            ],
        };

        const sections = [product];
        sections.push(reports);
        sections.push(workspace);
        sections.push(socialInbox);
        return sections;
    }, [isAdmin, returnsPending, protectionHeld]);


    return (
        <Sidebar collapsible="icon" className="border-r-0 bg-[#dedede]" style={{ fontFamily: "'Suisse Intl', 'Geist Sans', system-ui, sans-serif" }}>
            {/* ── Brand header: logo tile + shop name ─────── */}
            <SidebarHeader className={cn("px-2", isCollapsed ? "items-center py-2" : "py-2.5")}>
                <div data-testid="sidebar-brand" className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-2 px-1")}>
                    {isCollapsed ? (
                        <button
                            type="button"
                            onClick={toggleSidebar}
                            aria-label="Expand sidebar"
                            title="Expand sidebar"
                            className="rounded-[6px] outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-black/20"
                        >
                            <span data-testid="sidebar-brand-logo" className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                                <Logo className="h-[16px] w-auto" />
                            </span>
                        </button>
                    ) : (
                        <>
                            <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-black/20">
                                <span data-testid="sidebar-brand-logo" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                                    <Logo className="h-[16px] w-auto" />
                                </span>
                                <span className="min-w-0">
                                    {orgLoading ? (
                                        <span className="block h-3 w-24 animate-pulse rounded bg-black/10" />
                                    ) : (
                                        <span className="block truncate font-sans text-[13.5px] font-semibold leading-tight tracking-tight text-black">{orgName || "Mango Lover BD"}</span>
                                    )}
                                    <span className="mt-0.5 block truncate font-sans text-[10.5px] leading-tight text-black/45">Merchant Suite</span>
                                </span>
                            </Link>
                            <button
                                type="button"
                                onClick={toggleSidebar}
                                aria-label="Collapse sidebar"
                                title="Collapse sidebar"
                                className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-black/40 transition-colors hover:bg-black/5 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                            >
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none"><path opacity="0.5" d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22Z" fill="currentColor"/><path d="M12.9697 8.46967C13.2626 8.17678 13.7374 8.17678 14.0303 8.46967C14.3232 8.76256 14.3232 9.23744 14.0303 9.53033L11.5607 12L14.0303 14.4697C14.3232 14.7626 14.3232 15.2374 14.0303 15.5303C13.7374 15.8232 13.2626 15.8232 12.9697 15.5303L9.96967 12.5303C9.67678 12.2374 9.67678 11.7626 9.96967 11.4697L12.9697 8.46967Z" fill="currentColor"/></svg>
                            </button>
                        </>
                    )}
                </div>
            </SidebarHeader>

            {/* ── Navigation ──────────────────────────────── */}
            <SidebarContent className="gap-0 overflow-x-hidden px-1 pb-1.5 pt-4">
                <DashboardNavigation sections={navSections} />
            </SidebarContent>

            {/* ── Footer: workspace card (opens settings) ─── */}
            <SidebarFooter className="p-2">
                <Link
                    to="/settings"
                    data-testid="sidebar-workspace-card"
                    title="System Settings"
                    className={cn(
                        "group/workspace flex items-center rounded-[6px] border border-black/[0.06] bg-white/40 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors hover:bg-white/60",
                        isCollapsed ? "justify-center p-1" : "gap-2 px-1.5 py-1"
                    )}
                >
                    <span
                        data-testid="sidebar-workspace-logo"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-black/[0.05] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    >
                        <Logo className="h-[15px] w-auto" />
                    </span>
                    {!isCollapsed && (
                        <>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-sans text-[10.5px] leading-tight text-black/45">
                                    {role === "admin" ? "Admin" : role === "team_member" ? "Staff" : "Workspace"}
                                </p>
                                {orgLoading ? (
                                    <div className="mt-0.5 h-2.5 w-24 animate-pulse rounded bg-black/10" />
                                ) : (
                                    <p className="truncate font-sans text-[12.5px] font-medium leading-tight text-black">{orgName || "My workspace"}</p>
                                )}
                            </div>
                            <CaretUpDown aria-hidden="true" weight="bold" size={12} className="shrink-0 text-black/30 transition-colors group-hover/workspace:text-black/55" />
                        </>
                    )}
                </Link>
            </SidebarFooter>
        </Sidebar>
    );
}
