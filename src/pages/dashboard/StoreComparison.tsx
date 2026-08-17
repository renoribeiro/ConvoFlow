import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { useStoreComparison } from '@/hooks/useStoreComparison';

const numberFmt = new Intl.NumberFormat('pt-BR');

/**
 * Comparação de métricas entre as lojas do Gerente. Rota protegida por
 * RoleGuard (gerente; superadmin também acessa por bypass).
 */
const StoreComparison = () => {
  const { metrics, isLoading } = useStoreComparison();

  const totals = metrics.reduce(
    (acc, m) => ({
      contacts: acc.contacts + m.contacts,
      conversations: acc.conversations + m.conversations,
      messages: acc.messages + m.messages,
    }),
    { contacts: 0, conversations: 0, messages: 0 },
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          {/* Esta tela não usa PageHeader, então a ajuda vai ao lado do título. */}
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold">Comparar Lojas</h1>
            <FeatureHelp helpKey="page:store-comparison" />
          </div>
          <p className="text-sm text-muted-foreground">
            Métricas lado a lado das lojas do seu grupo.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visão comparativa</CardTitle>
          <CardDescription>Contatos, conversas e mensagens por loja.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma loja no seu grupo ainda. As lojas aparecem aqui assim que forem criadas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-right">Contatos</TableHead>
                    <TableHead className="text-right">Conversas</TableHead>
                    <TableHead className="text-right">Mensagens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-right">{numberFmt.format(m.contacts)}</TableCell>
                      <TableCell className="text-right">{numberFmt.format(m.conversations)}</TableCell>
                      <TableCell className="text-right">{numberFmt.format(m.messages)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{numberFmt.format(totals.contacts)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(totals.conversations)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(totals.messages)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StoreComparison;
