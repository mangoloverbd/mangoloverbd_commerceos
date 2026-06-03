import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import OrderAnalysis from "./pages/OrderAnalysis";
import OrderExtraction from "./pages/OrderExtraction";
import OrderChat from "./pages/OrderChat";
import Products from "./pages/Products";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import FacebookInbox from "./pages/FacebookInbox";
import InstagramInbox from "./pages/InstagramInbox";
import WhatsappInbox from "./pages/WhatsappInbox";
import InboxOrders from "./pages/InboxOrders";
import Studio from "./pages/Studio";
import Billing from "./pages/Billing";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import { Spinner } from "@/components/ui/ios-spinner";

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
      <Route path="/order-analysis" element={<AdminRoute><OrderAnalysis /></AdminRoute>} />
      <Route path="/order-extraction" element={<OrderExtraction />} />
      <Route path="/order-chat" element={<OrderChat />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/products" element={<Products />} />
      <Route path="/inbox/facebook" element={<FacebookInbox />} />
      <Route path="/inbox/instagram" element={<InstagramInbox />} />
      <Route path="/inbox/whatsapp" element={<WhatsappInbox />} />
      <Route path="/inbox/orders" element={<InboxOrders />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/billing" element={<AdminRoute><Billing /></AdminRoute>} />
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
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
