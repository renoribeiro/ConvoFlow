
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsSuperAdmin } from '@/contexts/TenantContext';
import { 
  MessageSquare, 
  BarChart3, 
  Users, 
  Settings, 
  Bot,
  Megaphone,
  Target,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Menu,
  TrendingUp,
  FileText,
  LogOut,
  Workflow,
  Shield,
  Smartphone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const baseNavigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Conversas', href: '/dashboard/conversations', icon: MessageSquare },
  { name: 'Chat Evolution', href: '/dashboard/chat', icon: MessageSquare },
  { name: 'Contatos', href: '/dashboard/contacts', icon: Users },
  { name: 'Funil de Vendas', href: '/dashboard/funnel', icon: Target },
  { name: 'Rastreamento', href: '/dashboard/tracking', icon: TrendingUp },
  { name: 'Relatórios', href: '/dashboard/reports', icon: FileText },
  { name: 'Chatbots', href: '/dashboard/chatbots', icon: Bot },
  { name: 'Campanhas', href: '/dashboard/campaigns', icon: Megaphone },
  { name: 'Follow-ups', href: '/dashboard/followups', icon: UserCheck },
  { name: 'Automação', href: '/dashboard/automation', icon: Workflow },
  { name: 'Números WhatsApp', href: '/dashboard/whatsapp-numbers', icon: Smartphone },
  { name: 'Configurações', href: '/dashboard/settings', icon: Settings },
];

const adminNavigationItem = {
  name: 'Administração',
  href: '/dashboard/admin',
  icon: Shield
};

export const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  const { logout } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  
  // Construir lista de navegação baseada no role do usuário
  const navigationItems = isSuperAdmin 
    ? [...baseNavigationItems, adminNavigationItem]
    : baseNavigationItems;
  
  return (
    <div className={cn(
      "fixed left-0 top-0 h-full bg-dashboard-sidebar border-r border-border transition-all duration-300 z-40",
      isOpen ? "w-64" : "w-16"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {isOpen && (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">ConvoFlow</span>
          </div>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8"
        >
          {isOpen ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
        {navigationItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.href === '/dashboard'}
            className={({ isActive }) => cn(
              "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              isActive 
                ? "bg-gradient-primary text-white shadow-soft" 
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              !isOpen && "justify-center"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {isOpen && <span>{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Info */}
      {isOpen && (
        <div className="absolute bottom-4 left-4 right-4 space-y-2">
          <div className="bg-whatsapp-light border border-whatsapp-primary/20 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-whatsapp-primary rounded-full flex items-center justify-center">
                <UserCheck className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  Empresa Demo
                </p>
                <p className="text-xs text-muted-foreground">
                  Plano Premium
                </p>
              </div>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => logout()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      )}
    </div>
  );
};
