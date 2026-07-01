import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { cn } from '@/lib/utils';
import PageErrorBoundary from '@/components/ErrorBoundaries/PageErrorBoundary';
import { useTenantAccess } from '@/hooks/useTenantAccess';
import { PaywallScreen } from '@/components/auth/PaywallScreen';
import { LojaOnlyNotice } from '@/components/auth/LojaOnlyNotice';
import { useRole } from '@/contexts/TenantContext';

// Telas operacionais (dados de cliente) que o superadmin NÃO acessa — ele só
// vê estatísticas (Dashboard/Rastreamento/Relatórios) e gerencia (Administração).
const LOJA_ONLY_SEGMENTS = [
  'conversations',
  'contacts',
  'funnel',
  'chatbots',
  'campaigns',
  'followups',
  'automation',
  'whatsapp-numbers',
];

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const role = useRole();
  const pageName = (location.pathname.split('/').filter(Boolean).pop() || 'página')
    .replace(/-/g, ' ');

  // Bloqueio "Exclusivo para lojas" para o superadmin nas telas operacionais.
  const firstSegment = location.pathname.replace(/^\/dashboard\/?/, '').split('/')[0] ?? '';
  const blockedForSuperadmin = role === 'superadmin' && LOJA_ONLY_SEGMENTS.includes(firstSegment);

  // Paywall: Loja sem acesso liberado (pago/manual) vê só a tela de bloqueio.
  // Superadmin e Agência têm bypass (ver useTenantAccess).
  const { loading: accessLoading, locked } = useTenantAccess();

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (locked) {
    return <PaywallScreen />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div
        className={cn(
          'flex flex-col min-h-screen transition-all duration-300',
          sidebarOpen ? 'lg:ml-60' : 'lg:ml-14',
        )}
      >
        <Navbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 p-6">
          <PageErrorBoundary key={location.pathname} pageName={pageName}>
            {blockedForSuperadmin ? <LojaOnlyNotice /> : <Outlet />}
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
};
