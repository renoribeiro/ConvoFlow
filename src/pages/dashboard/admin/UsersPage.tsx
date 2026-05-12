import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, UserPlus } from 'lucide-react';
import { useUsers, UsersFilters } from '@/hooks/users/useUsers';
import { UsersTable } from '@/components/users/UsersTable';
import { InviteUserModal } from '@/components/users/InviteUserModal';
import { ROLE_LABELS, STATUS_LABELS, UserRole, UserStatus } from '@/types/userHierarchy';

export default function UsersPage() {
  const [filters, setFilters] = useState<UsersFilters>({});
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users = [], isLoading } = useUsers({ ...filters, search });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Hierarquia completa de Superadmins, Gestores, Enterprises e Usuários.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Convidar usuário
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={filters.role ?? 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, role: v === 'all' ? undefined : (v as UserRole) }))
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as funções</SelectItem>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.status ?? 'all'}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                status: v === 'all' ? undefined : (v as UserStatus),
              }))
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(Object.keys(STATUS_LABELS) as UserStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <InviteUserModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
