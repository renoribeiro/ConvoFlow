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

// Landing Page
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { Auth } from "./pages/Auth";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";

// Dashboard Pages
import Index from "./pages/Index";
import Conversations from "./pages/Conversations";
import Contacts from "./pages/Contacts";
import Funnel from "./pages/Funnel";
import Tracking from "./pages/Tracking";
import Reports from "./pages/Reports";
import Chatbots from "./pages/Chatbots";
import Campaigns from "./pages/Campaigns";
import Followups from "./pages/Followups";
import Automation from "./pages/Automation";
import Settings from "./pages/Settings";
import { ProfileSettings } from "@/components/settings/profilesettings";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/dashboard/AdminDashboard";
import WhatsAppNumbers from "./pages/WhatsAppNumbers";

const queryClient = new QueryClient();

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
                <Route index element={<Index />} />
                <Route path="conversations" element={<Conversations />} />
                <Route path="contacts" element={<Contacts />} />
                <Route path="funnel" element={<Funnel />} />
                <Route path="tracking" element={<Tracking />} />
                <Route path="reports" element={<Reports />} />
                <Route path="chatbots" element={<Chatbots />} />
                <Route path="campaigns" element={<Campaigns />} />
                <Route path="followups" element={<Followups />} />
                <Route path="automation" element={<Automation />} />
                <Route path="whatsapp-numbers" element={<WhatsAppNumbers />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="profile" element={<ProfileSettings />} />
                <Route path="notifications" element={<Notifications />} />
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
