import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, UserPlus } from 'lucide-react';
import { useUsers } from '@/hooks/users/useUsers';
import { UsersTable } from '@/components/users/UsersTable';
import { InviteUserModal } from '@/components/users/InviteUserModal';
import { useRole, useTenant } from '@/contexts/TenantContext';

/**
 * Visão hierárquica de equipe para account_manager e enterprise.
 *  - Account Manager vê seus Enterprises (e via RLS, os Users dos Enterprises).
 *  - Enterprise vê seus Users do mesmo tenant.
 */
export default function TeamPage() {
  const role = useRole();
  const { profile, tenant } = useTenant();
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users = [], isLoading } = useUsers({ search });

  const heading =
    role === 'account_manager' ? 'Meus Enterprises' : 'Minha Equipe';

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{heading}</h1>
          <p className="text-sm text-muted-foreground">
            {role === 'account_manager'
              ? 'Enterprises e usuários abaixo da sua conta.'
              : `Usuários do tenant ${tenant?.name ?? ''}.`}
          </p>
        </div>
        {profile && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Convidar
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtrar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Carregando...</div>
          ) : (
            <UsersTable rows={users} />
          )}
        </CardContent>
      </Card>

      <InviteUserModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        defaultTenantId={tenant?.id ?? null}
      />
    </div>
  );
}
