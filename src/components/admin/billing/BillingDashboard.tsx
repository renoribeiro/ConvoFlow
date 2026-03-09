import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Activity,
  Search,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import StripeConfiguration from '@/components/StripeConfiguration';

const CONVOFLOW_PRO_PRODUCT_ID = 'prod_Tmg5IInlTr4hi3';

export function BillingDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch real subscriptions
  const { data: subscriptions = [], isLoading: subsLoading } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, profiles(first_name, last_name, user_id)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch real transactions
  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['admin-stripe-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stripe_transactions')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate real stats
  const stats = {
    activeSubscriptions: subscriptions.filter((s: any) => s.status === 'active').length,
    mrr: subscriptions
      .filter((s: any) => s.status === 'active')
      .reduce((sum: number, s: any) => sum + (s.amount || 0) / 100, 0),
    totalRevenue: transactions
      .filter((t: any) => t.status === 'succeeded')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0),
    totalTransactions: transactions.length,
  };

  const formatCurrency = (amount: number, currency: string = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
      active: { label: 'Ativo', variant: 'default' },
      trialing: { label: 'Trial', variant: 'secondary' },
      past_due: { label: 'Atrasado', variant: 'destructive' },
      canceled: { label: 'Cancelado', variant: 'secondary' },
      succeeded: { label: 'Pago', variant: 'default' },
      failed: { label: 'Falhou', variant: 'destructive' },
      pending: { label: 'Pendente', variant: 'secondary' },
    };
    const config = map[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const isLoading = subsLoading || txLoading;
  const hasData = subscriptions.length > 0 || transactions.length > 0;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : stats.activeSubscriptions}
            </div>
            <p className="text-xs text-muted-foreground">
              Total de {subscriptions.length} assinatura(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal (MRR)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : formatCurrency(stats.mrr)}
            </div>
            <p className="text-xs text-muted-foreground">
              Receita recorrente mensal
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Faturado</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <RefreshCw className="h-5 w-5 animate-spin" /> : formatCurrency(stats.totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">
              De {stats.totalTransactions} transação(ões)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produto Stripe</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold text-primary">Convoflow Pro</div>
            <p className="text-xs text-muted-foreground font-mono">
              {CONVOFLOW_PRO_PRODUCT_ID}
            </p>
          </CardContent>
        </Card>
      </div>

      {!hasData && !isLoading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nenhuma assinatura ou transação encontrada. Configure o Stripe e crie preços para o produto <strong>Convoflow Pro</strong> ({CONVOFLOW_PRO_PRODUCT_ID}) no{' '}
            <a
              href="https://dashboard.stripe.com/products"
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Dashboard do Stripe <ExternalLink className="h-3 w-3" />
            </a>.
            Depois configure a <strong>STRIPE_SECRET_KEY</strong> nas variáveis de ambiente do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Transações</TabsTrigger>
          <TabsTrigger value="subscriptions">Assinaturas</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Transações Recentes</CardTitle>
                <CardDescription>
                  Histórico de pagamentos do Stripe.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma transação encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs">
                          {tx.stripe_payment_intent_id?.slice(0, 20)}...
                        </TableCell>
                        <TableCell>{tx.description || '-'}</TableCell>
                        <TableCell>{formatCurrency(tx.amount, tx.currency)}</TableCell>
                        <TableCell>{getStatusBadge(tx.status)}</TableCell>
                        <TableCell>
                          {tx.processed_at
                            ? new Date(tx.processed_at).toLocaleDateString('pt-BR')
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assinaturas</CardTitle>
              <CardDescription>Todas as assinaturas ativas e históricas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Período Atual</TableHead>
                    <TableHead>Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma assinatura encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscriptions.map((sub: any) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">
                          {sub.profiles
                            ? `${sub.profiles.first_name || ''} ${sub.profiles.last_name || ''}`.trim() || 'N/A'
                            : 'N/A'}
                        </TableCell>
                        <TableCell>{sub.plan_name}</TableCell>
                        <TableCell>{formatCurrency((sub.amount || 0) / 100, sub.currency)}</TableCell>
                        <TableCell>{getStatusBadge(sub.status)}</TableCell>
                        <TableCell>
                          {sub.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString('pt-BR')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {new Date(sub.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <StripeConfiguration />
        </TabsContent>
      </Tabs>
    </div>
  );
}
