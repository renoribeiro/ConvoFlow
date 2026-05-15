import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { cn } from '@/lib/utils';
import PageErrorBoundary from '@/components/ErrorBoundaries/PageErrorBoundary';

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const pageName = (location.pathname.split('/').filter(Boolean).pop() || 'página')
    .replace(/-/g, ' ');

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
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
};
