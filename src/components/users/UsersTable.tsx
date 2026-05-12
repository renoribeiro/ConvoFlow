import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Eye, MoreHorizontal, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RoleBadge } from './RoleBadge';
import { UserStatusBadge } from './UserStatusBadge';
import { UserRow } from '@/hooks/users/useUsers';
import {
  useSuspendUser,
  useReactivateUser,
  useResetUserPassword,
  useSoftDeleteUser,
} from '@/hooks/users/useManageUser';

interface UsersTableProps {
  rows: UserRow[];
  onView?: (row: UserRow) => void;
}

export function UsersTable({ rows, onView }: UsersTableProps) {
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const resetPwd = useResetUserPassword();
  const softDelete = useSoftDeleteUser();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Função</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead>Acessos</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                Nenhum usuário encontrado.
              </TableCell>
            </TableRow>
          )}
          {rows.map((u) => {
            const name =
              [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
            const lastLogin = u.last_login_at
              ? format(new Date(u.last_login_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
              : 'Nunca';
            return (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell>
                  <RoleBadge role={u.role} />
                </TableCell>
                <TableCell>
                  <UserStatusBadge status={u.status} />
                </TableCell>
                <TableCell>{lastLogin}</TableCell>
                <TableCell>{u.login_count}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onView?.(u)}>
                        <Eye className="mr-2 h-4 w-4" /> Ver detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => resetPwd.mutate(u.id)}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Redefinir senha
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {u.status === 'active' ? (
                        <DropdownMenuItem onClick={() => suspend.mutate(u.id)}>
                          <Pause className="mr-2 h-4 w-4" /> Suspender
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => reactivate.mutate(u.id)}>
                          <Play className="mr-2 h-4 w-4" /> Reativar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Excluir este usuário? Descendentes serão suspensos.',
                            )
                          ) {
                            softDelete.mutate(u.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
