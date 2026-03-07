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
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ModuleGuard } from '@/components/auth/ModuleGuard';
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
const ProfileSettings = React.lazy(() => import("@/components/settings/ProfileSettings").then(module => ({ default: module.ProfileSettings })));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const AdminDashboard = React.lazy(() => import("./pages/dashboard/AdminDashboard"));
const WhatsAppNumbers = React.lazy(() => import("./pages/WhatsAppNumbers"));

// Use optimized query client configuration
import { createQueryClient } from '@/lib/queryClient';
const queryClient = createQueryClient();

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
                    <ModuleGuard moduleName="conversations">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Conversations />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="contacts" element={
                    <ModuleGuard moduleName="contacts">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Contacts />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="funnel" element={
                    <ModuleGuard moduleName="funnel">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Funnel />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="tracking" element={
                    <ModuleGuard moduleName="tracking">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Tracking />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="reports" element={
                    <ModuleGuard moduleName="reports">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Reports />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="chatbots" element={
                    <ModuleGuard moduleName="chatbots">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Chatbots />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="campaigns" element={
                    <ModuleGuard moduleName="campaigns">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Campaigns />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="followups" element={
                    <ModuleGuard moduleName="followups">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Followups />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="automation" element={
                    <ModuleGuard moduleName="automation">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Automation />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="whatsapp-numbers" element={
                    <ModuleGuard moduleName="whatsapp-numbers">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <WhatsAppNumbers />
                      </Suspense>
                    </ModuleGuard>
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
