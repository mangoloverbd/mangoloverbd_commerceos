import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import Dashboard from "./pages/Dashboard";
// All other routes are code-split so the dashboard's initial bundle stays
// small (fast first load in production). Dashboard itself stays eager.
// Auth is split too — unauthenticated visitors only download it on demand.
const Auth = lazy(() => import("./pages/Auth"));
const Settings = lazy(() => import("./pages/Settings"));
const OrderAnalysis = lazy(() => import("./pages/OrderAnalysis"));
const OrderChat = lazy(() => import("./pages/OrderChat"));
const Products = lazy(() => import("./pages/Products"));
const Warehouses = lazy(() => import("./pages/Warehouses"));
const WarehouseDetail = lazy(() => import("./pages/WarehouseDetail"));
const ProductNew = lazy(() => import("./pages/ProductNew"));
const ProductEdit = lazy(() => import("./pages/ProductEdit"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Customers = lazy(() => import("./pages/Customers"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FacebookInbox = lazy(() => import("./pages/FacebookInbox"));
const InstagramInbox = lazy(() => import("./pages/InstagramInbox"));
const WhatsappInbox = lazy(() => import("./pages/WhatsappInbox"));
const InboxOrders = lazy(() => import("./pages/InboxOrders"));
const Studio = lazy(() => import("./pages/Studio"));
const Billing = lazy(() => import("./pages/Billing"));
const Returns = lazy(() => import("./pages/Returns"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const OnlineStore = lazy(() => import("./pages/OnlineStore"));
const Overview = lazy(() => import("./pages/Overview"));
import { Spinner } from "@/components/ui/ios-spinner";

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" className="text-muted-foreground" />
    </div>
  );
}

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" className="text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useUserRole();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" className="text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" className="text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

import { DashboardLayout } from "@/components/DashboardLayout";

const AppRoutes = () => (
  <Routes>
    <Route
      element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<Dashboard />} />
      <Route path="/overview" element={<Overview />} />
      <Route path="/order-analysis" element={<AdminRoute><OrderAnalysis /></AdminRoute>} />
      <Route path="/order-chat" element={<OrderChat />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/online-store" element={<AdminRoute><OnlineStore /></AdminRoute>} />
      <Route path="/products" element={<Products />} />
      <Route path="/products/new" element={<ProductNew />} />
      <Route path="/products/:id/edit" element={<ProductEdit />} />
      <Route path="/warehouses" element={<Warehouses />} />
      <Route path="/warehouses/:id" element={<WarehouseDetail />} />
      <Route path="/orders/:id" element={<OrderDetail />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/inbox/facebook" element={<FacebookInbox />} />
      <Route path="/inbox/instagram" element={<InstagramInbox />} />
      <Route path="/inbox/whatsapp" element={<WhatsappInbox />} />
      <Route path="/inbox/orders" element={<InboxOrders />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/billing" element={<AdminRoute><Billing /></AdminRoute>} />
      <Route path="/returns" element={<Returns />} />
    </Route>
    <Route
      path="/onboarding"
      element={
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      }
    />
    <Route
      path="/auth"
      element={
        <PublicRoute>
          <Auth />
        </PublicRoute>
      }
    />
    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
    <Route path="*" element={<NotFound />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <AppRoutes />
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
