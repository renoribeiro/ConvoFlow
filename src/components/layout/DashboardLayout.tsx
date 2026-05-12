import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { cn } from '@/lib/utils';
import PageErrorBoundary from '@/components/ErrorBoundaries/PageErrorBoundary';

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  // pageName derivado da rota — só pra mensagem amigável no fallback.
  const pageName = (location.pathname.split('/').filter(Boolean).pop() || 'página')
    .replace(/-/g, ' ');

  return (
    <div className="min-h-screen bg-gradient-background">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className={cn(
        "transition-all duration-300",
        sidebarOpen ? "ml-64" : "ml-16"
      )}>
        <Navbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        <main className="p-6">
          {/* key={pathname} reseta o boundary quando o usuário troca de rota,
              evitando que a tela de erro "trave" o app numa rota diferente. */}
          <PageErrorBoundary key={location.pathname} pageName={pageName}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
};