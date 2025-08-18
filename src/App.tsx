import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChatbotProvider } from "@/contexts/ChatbotContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { DashboardCardSkeleton } from "@/components/shared/Skeleton";

// Landing Page (carregamento imediato)
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { Auth } from "./pages/Auth";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import NotFound from "./pages/NotFound";

// Dashboard Pages (lazy loading)
const Index = React.lazy(() => import("./pages/Index"));
const Conversations = React.lazy(() => import("./pages/Conversations"));
const Contacts = React.lazy(() => import("./pages/Contacts"));
const Funnel = React.lazy(() => import("./pages/Funnel"));
const Tracking = React.lazy(() => import("./pages/Tracking"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Chatbots = React.lazy(() => import("./pages/Chatbots"));
const Campaigns = React.lazy(() => import("./pages/Campaigns"));
const Followups = React.lazy(() => import("./pages/Followups"));
const Automation = React.lazy(() => import("./pages/Automation"));
const Settings = React.lazy(() => import("./pages/Settings"));
const ProfileSettings = React.lazy(() => import("@/components/settings/profilesettings").then(module => ({ default: module.ProfileSettings })));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const AdminDashboard = React.lazy(() => import("./pages/dashboard/AdminDashboard"));
const WhatsAppNumbers = React.lazy(() => import("./pages/WhatsAppNumbers"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache por 5 minutos por padrão
      staleTime: 5 * 60 * 1000,
      // Manter dados em cache por 10 minutos
      gcTime: 10 * 60 * 1000,
      // Retry automático em caso de erro
      retry: (failureCount, error: any) => {
        // Não retry em erros 4xx
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Máximo 3 tentativas
        return failureCount < 3;
      },
      // Refetch quando a janela ganha foco
      refetchOnWindowFocus: true,
      // Refetch quando reconecta à internet
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry automático para mutations
      retry: 1,
    },
  },
});

// Componente de loading para páginas
const PageLoadingSkeleton = () => (
  <div className="space-y-6 p-6">
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <DashboardCardSkeleton key={i} />
      ))}
    </div>
    <div className="grid gap-6 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="p-6 border rounded-lg space-y-4">
          <DashboardCardSkeleton />
        </div>
      ))}
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <TenantProvider>
          <ChatbotProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              
              {/* Protected Dashboard Routes */}
              <Route path="/dashboard" element={
                <AuthGuard>
                  <DashboardLayout />
                </AuthGuard>
              }>
                <Route index element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Index />
                  </Suspense>
                } />
                <Route path="conversations" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Conversations />
                  </Suspense>
                } />
                <Route path="contacts" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Contacts />
                  </Suspense>
                } />
                <Route path="funnel" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Funnel />
                  </Suspense>
                } />
                <Route path="tracking" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Tracking />
                  </Suspense>
                } />
                <Route path="reports" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Reports />
                  </Suspense>
                } />
                <Route path="chatbots" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Chatbots />
                  </Suspense>
                } />
                <Route path="campaigns" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Campaigns />
                  </Suspense>
                } />
                <Route path="followups" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Followups />
                  </Suspense>
                } />
                <Route path="automation" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Automation />
                  </Suspense>
                } />
                <Route path="whatsapp-numbers" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <WhatsAppNumbers />
                  </Suspense>
                } />
                <Route path="settings" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Settings />
                  </Suspense>
                } />
                <Route path="admin" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <AdminDashboard />
                  </Suspense>
                } />
                <Route path="profile" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <ProfileSettings />
                  </Suspense>
                } />
                <Route path="notifications" element={
                  <Suspense fallback={<PageLoadingSkeleton />}>
                    <Notifications />
                  </Suspense>
                } />
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
            </BrowserRouter>
          </ChatbotProvider>
        </TenantProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
