
import { Bell, Search, User, ChevronDown, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { useSupabaseQuery, useSupabaseCount } from '@/hooks/useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface NavbarProps {
  onMenuClick: () => void;
}

export const Navbar = ({ onMenuClick }: NavbarProps) => {
  const { tenant, profile } = useTenant();

  // Buscar número de WhatsApp conectados
  const { data: connectedWhatsApp = 0 } = useSupabaseCount(
    'whatsapp_instances',
    [
      { column: 'tenant_id', operator: 'eq', value: tenant?.id },
      { column: 'status', operator: 'eq', value: 'open' }
    ],
    { enabled: !!tenant?.id }
  );

  // Buscar conversas ativas (mensagens das últimas 24h)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const { data: activeConversations = 0 } = useSupabaseCount(
    'messages',
    [
      { column: 'tenant_id', operator: 'eq', value: tenant?.id },
      { column: 'created_at', operator: 'gte', value: yesterday.toISOString() }
    ],
    { enabled: !!tenant?.id }
  );

  const displayName = (
    `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Usuário'
  );

  const roleLabel = (() => {
    switch (profile?.role) {
      case 'super_admin':
        return 'Super Admin';
      case 'tenant_admin':
        return 'Administrador';
      case 'tenant_user':
        return 'Usuário';
      default:
        return 'Usuário';
    }
  })();

  const initials = (
    `${(profile?.first_name ?? '').charAt(0)}${(profile?.last_name ?? '').charAt(0)}`
      .toUpperCase() || 'U'
  );

  return (
    <header className="h-16 bg-dashboard-navbar border-b border-border flex items-center justify-between px-6">
      {/* Left Side */}
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas, contatos..."
            className="pl-10 w-80 bg-background"
          />
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-4">
        {/* Status Indicators */}
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-status-success/10 text-status-success border-status-success">
            {connectedWhatsApp} WhatsApp conectados
          </Badge>
          <Badge variant="outline" className="bg-status-info/10 text-status-info border-status-info">
            {activeConversations} conversas ativas
          </Badge>
        </div>

        {/* Notifications */}
        <NotificationCenter />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/dashboard/profile" className="flex items-center">
                <User className="mr-2 h-4 w-4" />
                Meu Perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/dashboard/notifications" className="flex items-center">
                <Bell className="mr-2 h-4 w-4" />
                Notificações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
