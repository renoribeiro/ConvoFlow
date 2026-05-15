import { Bell, Search, User, ChevronDown, Menu, LogOut, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useTenant, useIsSuperAdmin } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AnyUserRole, roleLabel as roleLabelHelper } from '@/types/userHierarchy';
import { RoleBadge } from '@/components/users/RoleBadge';

interface NavbarProps {
  onMenuClick: () => void;
}

export const Navbar = ({ onMenuClick }: NavbarProps) => {
  const { tenant, profile, loading: tenantLoading } = useTenant();
  const { logout } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();

  const displayName = tenantLoading
    ? 'Carregando...'
    : (`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Usuário');

  const initials = (
    `${(profile?.first_name ?? '').charAt(0)}${(profile?.last_name ?? '').charAt(0)}`
      .toUpperCase() || 'U'
  );

  return (
    <header className="h-12 bg-card border-b border-border flex items-center justify-between px-4 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden h-8 w-8"
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-8 h-8 w-56 text-sm bg-muted/50 border-0 focus-visible:ring-1 focus-visible:bg-background"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        <NotificationCenter />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 h-8 px-2"
              aria-label="Menu do usuário"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="text-left hidden md:block">
                <p className="text-xs font-medium leading-none">{displayName}</p>
                {!tenantLoading && profile?.role && (
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                    {roleLabelHelper(profile.role as AnyUserRole | undefined)}
                  </p>
                )}
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{displayName}</p>
                {!tenantLoading && profile?.role && (
                  <RoleBadge role={profile.role as AnyUserRole} />
                )}
                {tenant?.name && (
                  <p className="text-xs text-muted-foreground truncate">{tenant.name}</p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Meu Perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/dashboard/notifications" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notificações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/dashboard/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configurações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive gap-2"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
