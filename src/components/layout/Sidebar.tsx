import { NavLink } from 'react-router-dom';
import { useIsSuperAdmin, useRole } from '@/contexts/TenantContext';
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
  TrendingUp,
  FileText,
  Workflow,
  Shield,
  Smartphone,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import logoHorizontal from '@/assets/logos/logo-horizontal.svg';
import logoHorizontalDark from '@/assets/logos/logo-horizontal-dark.svg';
import iconGreen from '@/assets/logos/icon-green.svg';
import iconWhite from '@/assets/logos/icon-white.svg';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  moduleName: string | null;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const operationItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3, moduleName: null },
  { name: 'Conversas', href: '/dashboard/conversations', icon: MessageSquare, moduleName: 'conversations' },
  { name: 'Contatos', href: '/dashboard/contacts', icon: Users, moduleName: 'contacts' },
  { name: 'Funil de Vendas', href: '/dashboard/funnel', icon: Target, moduleName: 'funnel' },
];

const marketingItems: NavItem[] = [
  { name: 'Rastreamento', href: '/dashboard/tracking', icon: TrendingUp, moduleName: 'tracking' },
  { name: 'Relatórios', href: '/dashboard/reports', icon: FileText, moduleName: 'reports' },
  { name: 'Chatbots', href: '/dashboard/chatbots', icon: Bot, moduleName: 'chatbots' },
  { name: 'Campanhas', href: '/dashboard/campaigns', icon: Megaphone, moduleName: 'campaigns' },
  { name: 'Follow-ups', href: '/dashboard/followups', icon: UserCheck, moduleName: 'followups' },
  { name: 'Automação', href: '/dashboard/automation', icon: Workflow, moduleName: 'automation' },
];

const configItems: NavItem[] = [
  { name: 'Instâncias e APIs', href: '/dashboard/whatsapp-numbers', icon: Smartphone, moduleName: 'whatsapp-numbers' },
  { name: 'Configurações', href: '/dashboard/settings', icon: Settings, moduleName: null },
];

const teamItems: NavItem[] = [
  { name: 'Equipe', href: '/dashboard/team', icon: UsersRound, moduleName: null },
];

const adminItems: NavItem[] = [
  { name: 'Administração', href: '/dashboard/admin', icon: Shield, moduleName: null },
];

const NavItemLink = ({
  item,
  isOpen,
}: {
  item: NavItem;
  isOpen: boolean;
}) => {
  const inner = (
    <NavLink
      to={item.href}
      end={item.href === '/dashboard'}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 group',
          isActive
            ? 'bg-primary/10 text-primary before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-primary before:rounded-r'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          !isOpen && 'justify-center px-2',
        )
      }
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      {isOpen && <span className="truncate">{item.name}</span>}
    </NavLink>
  );

  if (!isOpen) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {item.name}
        </TooltipContent>
      </Tooltip>
    );
  }

  return inner;
};

const SectionLabel = ({ label, isOpen }: { label: string; isOpen: boolean }) => {
  if (!isOpen) return <div className="my-1" />;
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
      {label}
    </p>
  );
};

export const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  const isSuperAdmin = useIsSuperAdmin();
  const role = useRole();
  const { visibleModules, isLoading: modulesLoading } = useModules();

  const isItemVisible = (item: NavItem): boolean => {
    if (!item.moduleName) return true;
    if (isSuperAdmin) return true;
    if (modulesLoading) return true;
    return visibleModules.some(
      (m) => m.module_name === item.moduleName && m.is_enabled,
    );
  };

  const visibleOperation = operationItems.filter(isItemVisible);
  const visibleMarketing = marketingItems.filter(isItemVisible);
  const visibleConfig = configItems.filter(isItemVisible);

  const showTeam = role === 'agencia' || isSuperAdmin;
  const showAdmin = isSuperAdmin;

  return (
    <>
      {/* Mobile backdrop — only visible on small screens when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
          onClick={onToggle}
        />
      )}
    <div
      className={cn(
        'fixed left-0 top-0 h-full bg-card border-r border-border transition-all duration-300 z-40 flex flex-col',
        isOpen ? 'w-60' : 'w-14',
      )}
    >
      {/* Logo + toggle */}
      <div className="flex items-center h-12 px-3 border-b border-border flex-shrink-0">
        {isOpen ? (
          <>
            <NavLink to="/dashboard" className="flex items-center flex-1 min-w-0" aria-label="ConvoFlow">
              <img src={logoHorizontal} alt="ConvoFlow" className="h-7 w-auto dark:hidden" />
              <img src={logoHorizontalDark} alt="ConvoFlow" className="h-7 w-auto hidden dark:block" />
            </NavLink>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 flex-shrink-0"
              aria-label="Recolher menu lateral"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="mx-auto flex items-center justify-center"
            aria-label="Expandir menu lateral"
          >
            <img src={iconGreen} alt="ConvoFlow" className="h-7 w-7 dark:hidden" />
            <img src={iconWhite} alt="ConvoFlow" className="h-7 w-7 hidden dark:block" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {visibleOperation.length > 0 && (
          <>
            <SectionLabel label="Operação" isOpen={isOpen} />
            <div className="space-y-0.5">
              {visibleOperation.map((item) => (
                <NavItemLink key={item.href} item={item} isOpen={isOpen} />
              ))}
            </div>
          </>
        )}

        {visibleMarketing.length > 0 && (
          <>
            <SectionLabel label="Marketing" isOpen={isOpen} />
            <div className="space-y-0.5">
              {visibleMarketing.map((item) => (
                <NavItemLink key={item.href} item={item} isOpen={isOpen} />
              ))}
            </div>
          </>
        )}

        <SectionLabel label="Configuração" isOpen={isOpen} />
        <div className="space-y-0.5">
          {visibleConfig.map((item) => (
            <NavItemLink key={item.href} item={item} isOpen={isOpen} />
          ))}
        </div>

        {showTeam && (
          <>
            <SectionLabel label="Equipe" isOpen={isOpen} />
            <div className="space-y-0.5">
              {teamItems.map((item) => (
                <NavItemLink key={item.href} item={item} isOpen={isOpen} />
              ))}
            </div>
          </>
        )}

        {showAdmin && (
          <>
            <SectionLabel label="Admin" isOpen={isOpen} />
            <div className="space-y-0.5">
              {adminItems.map((item) => (
                <NavItemLink key={item.href} item={item} isOpen={isOpen} />
              ))}
            </div>
          </>
        )}
      </nav>

    </div>
    </>
  );
};
