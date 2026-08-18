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
import { UserDetailsDialog } from './UserDetailsDialog';
import { useState } from 'react';
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
  /**
   * Nome da Loja/Conta por id, para a coluna "Loja". Sem isto a coluna mostra
   * um traco -- a tabela nao busca tenant sozinha de proposito, quem monta a
   * tela ja tem essa lista em maos.
   */
  tenantNames?: Record<string, string>;
}

/**
 * Tabela de pessoas.
 *
 * O "Ver detalhes" abre o dialogo DAQUI. Antes era uma prop opcional
 * (`onView?`) que NENHUMA das duas telas passava, entao o item existia no menu,
 * era clicavel, e nao fazia nada -- em Equipe e em Administracao.
 */
export function UsersTable({ rows, tenantNames }: UsersTableProps) {
  const [detalhe, setDetalhe] = useState<UserRow | null>(null);
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
            <TableHead>Loja</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead>Acessos</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                <TableCell className="text-muted-foreground">
                  {(u.tenant_id && tenantNames?.[u.tenant_id]) || '—'}
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
                      <DropdownMenuItem onClick={() => setDetalhe(u)}>
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

      <UserDetailsDialog
        row={detalhe}
        tenantName={detalhe?.tenant_id ? tenantNames?.[detalhe.tenant_id] : undefined}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}
