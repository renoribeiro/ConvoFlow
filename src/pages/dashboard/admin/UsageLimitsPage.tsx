import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { QUERY_KEYS } from '@/lib/queryClient';
import { ROLE_LABELS, UserRole } from '@/types/userHierarchy';

interface UsageLimit {
  id: string;
  role: UserRole;
  limit_name: string;
  limit_value: { limit: number | null };
  description: string | null;
}

export default function UsageLimitsPage() {
  const qc = useQueryClient();
  const [edited, setEdited] = useState<Record<string, string>>({});

  const { data: limits = [], isLoading } = useQuery({
    queryKey: [QUERY_KEYS.USAGE_LIMITS],
    queryFn: async () => {
      // cast `any` enquanto types.ts não inclui usage_limits (regenerar após migration).
      const { data, error } = await (supabase as any)
        .from('usage_limits')
        .select('*')
        .order('role')
        .order('limit_name');
      if (error) throw error;
      return (data ?? []) as unknown as UsageLimit[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, limitValue }: { id: string; limitValue: number | null }) => {
      const { error } = await (supabase as any)
        .from('usage_limits')
        .update({ limit_value: { limit: limitValue } })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Limite atualizado.');
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.USAGE_LIMITS] });
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Limites de uso por nível</h1>
        <p className="text-sm text-muted-foreground">
          Configure os limites aplicados a cada nível da hierarquia. Deixe vazio para "sem limite".
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações de limites</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nível</TableHead>
                  <TableHead>Limite</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[200px]">Valor</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {limits.map((l) => {
                  const editing = edited[l.id];
                  const currentValue =
                    editing !== undefined
                      ? editing
                      : l.limit_value?.limit?.toString() ?? '';
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{ROLE_LABELS[l.role]}</TableCell>
                      <TableCell>{l.limit_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {l.description ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={currentValue}
                          placeholder="Sem limite"
                          onChange={(e) =>
                            setEdited((prev) => ({ ...prev, [l.id]: e.target.value }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={editing === undefined || update.isPending}
                          onClick={() => {
                            const parsed = editing === '' ? null : Number(editing);
                            update.mutate(
                              { id: l.id, limitValue: parsed as number | null },
                              {
                                onSuccess: () =>
                                  setEdited((prev) => {
                                    const { [l.id]: _, ...rest } = prev;
                                    return rest;
                                  }),
                              },
                            );
                          }}
                        >
                          Salvar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
