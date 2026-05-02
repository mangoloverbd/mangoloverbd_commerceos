import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useOrgName } from "@/hooks/useOrgName";

export function DashboardLayout() {
    const { orgName, isLoading } = useOrgName();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && orgName === "" && !sessionStorage.getItem("onboarding_skipped")) {
            navigate("/onboarding", { replace: true });
        }
    }, [isLoading, orgName, navigate]);

    return (
        <SidebarProvider defaultOpen={true}>
            <div className="flex min-h-screen w-full bg-background">
                <AppSidebar />
                <SidebarInset className="flex flex-col min-w-0">
                    <main className="flex-1 min-w-0">
                        <Outlet />
                    </main>
                </SidebarInset>
            </div>
        </SidebarProvider>
    );
}
