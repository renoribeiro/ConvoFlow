import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, UserPlus } from 'lucide-react';
import { useUsers } from '@/hooks/users/useUsers';
import { UsersTable } from '@/components/users/UsersTable';
import { InviteUserModal } from '@/components/users/InviteUserModal';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { PageHeader } from '@/components/shared/PageHeader';

export default function TeamPage() {
  const role = useRole();
  const { profile, tenant } = useTenant();
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users = [], isLoading } = useUsers({ search });

  const heading = role === 'agencia' ? 'Minhas Lojas' : 'Minha Equipe';
  const description =
    role === 'agencia'
      ? 'Lojas afiliadas à sua Agência.'
      : tenant?.name
        ? `Usuários da Conta ${tenant.name}.`
        : 'Selecione uma Conta para gerenciar a equipe.';

  return (
    <div className="space-y-6">
      <PageHeader
        title={heading}
        description={description}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: heading },
        ]}
        actions={
          profile ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Convidar
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filtrar</CardTitle>
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
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
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
