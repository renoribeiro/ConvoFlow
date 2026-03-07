
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsSuperAdmin } from '@/contexts/TenantContext';
import { useModules } from '@/hooks/useModules';
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
  Smartphone,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const allNavigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3, moduleName: null }, // Dashboard sempre visível
  { name: 'Conversas', href: '/dashboard/conversations', icon: MessageSquare, moduleName: 'conversations' },
  { name: 'Contatos', href: '/dashboard/contacts', icon: Users, moduleName: 'contacts' },
  { name: 'Funil de Vendas', href: '/dashboard/funnel', icon: Target, moduleName: 'funnel' },
  { name: 'Rastreamento', href: '/dashboard/tracking', icon: TrendingUp, moduleName: 'tracking' },
  { name: 'Relatórios', href: '/dashboard/reports', icon: FileText, moduleName: 'reports' },
  { name: 'Chatbots', href: '/dashboard/chatbots', icon: Bot, moduleName: 'chatbots' },
  { name: 'Campanhas', href: '/dashboard/campaigns', icon: Megaphone, moduleName: 'campaigns' },
  { name: 'Follow-ups', href: '/dashboard/followups', icon: UserCheck, moduleName: 'followups' },
  { name: 'Automação', href: '/dashboard/automation', icon: Workflow, moduleName: 'automation' },
  { name: 'Números WhatsApp', href: '/dashboard/whatsapp-numbers', icon: Smartphone, moduleName: 'whatsapp-numbers' },
  { name: 'Configurações', href: '/dashboard/settings', icon: Settings, moduleName: null }, // Configurações sempre visível
];

const adminNavigationItems = [
  {
    name: 'Administração',
    href: '/dashboard/admin',
    icon: Shield
  }
];

export const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  const { logout } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  const { visibleModules, isLoading } = useModules();
  
  // Construir lista de navegação baseada nos módulos visíveis
  const getVisibleNavigationItems = () => {
    if (isLoading) return allNavigationItems; // Mostrar todos enquanto carrega
    
    const visibleItems = allNavigationItems.filter(item => {
      // Itens sem moduleName (Dashboard, Configurações) sempre visíveis
      if (!item.moduleName) return true;
      
      // Super admin vê todos os módulos
      if (isSuperAdmin) return true;
      
      // Usuários normais veem apenas módulos habilitados
      return visibleModules.some(module => 
        module.module_name === item.moduleName && module.is_enabled
      );
    });
    
    // Adicionar itens de administração para super admins
    if (isSuperAdmin) {
      visibleItems.push(...adminNavigationItems);
    }
    
    return visibleItems;
  };
  
  const navigationItems = getVisibleNavigationItems();
  
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
