import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
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
import { CouponManager } from '@/components/admin/billing/CouponManager';

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
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="overview">Transações</TabsTrigger>
          <TabsTrigger value="subscriptions">Assinaturas</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
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
              {/* Cartão no celular: descrição lidera, id do Stripe embaixo,
                  status vira chip, valor e data viram campos. Sem ações. */}
              <ResponsiveTable
                ariaLabel="Transações recentes"
                rows={transactions as any[]}
                rowKey={(tx: any) => tx.id}
                loading={isLoading}
                empty="Nenhuma transação encontrada"
                columns={[
                  { key: 'id', header: 'ID', card: 'subtitle', cellClassName: 'font-mono text-xs', cell: (tx: any) => <span className="font-mono text-xs break-all">{tx.stripe_payment_intent_id?.slice(0, 20)}...</span> },
                  { key: 'descricao', header: 'Descrição', card: 'title', cell: (tx: any) => tx.description || '-' },
                  { key: 'valor', header: 'Valor', cell: (tx: any) => formatCurrency(tx.amount, tx.currency) },
                  { key: 'status', header: 'Status', card: 'badge', cell: (tx: any) => getStatusBadge(tx.status) },
                  { key: 'data', header: 'Data', cell: (tx: any) => (tx.processed_at ? new Date(tx.processed_at).toLocaleDateString('pt-BR') : '-') },
                ]}
              />
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
              {/* Cartão no celular: usuário lidera, plano embaixo, status vira
                  chip, valor, período e criação viram campos. Sem ações. */}
              <ResponsiveTable
                ariaLabel="Assinaturas"
                rows={subscriptions as any[]}
                rowKey={(sub: any) => sub.id}
                loading={isLoading}
                empty="Nenhuma assinatura encontrada"
                columns={[
                  {
                    key: 'usuario',
                    header: 'Usuário',
                    card: 'title',
                    cellClassName: 'font-medium',
                    cell: (sub: any) =>
                      sub.profiles
                        ? `${sub.profiles.first_name || ''} ${sub.profiles.last_name || ''}`.trim() || 'N/A'
                        : 'N/A',
                  },
                  { key: 'plano', header: 'Plano', card: 'subtitle', cell: (sub: any) => sub.plan_name },
                  { key: 'valor', header: 'Valor', cell: (sub: any) => formatCurrency((sub.amount || 0) / 100, sub.currency) },
                  { key: 'status', header: 'Status', card: 'badge', cell: (sub: any) => getStatusBadge(sub.status) },
                  { key: 'periodo', header: 'Período Atual', cell: (sub: any) => (sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('pt-BR') : '-') },
                  { key: 'criado', header: 'Criado em', cell: (sub: any) => new Date(sub.created_at).toLocaleDateString('pt-BR') },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coupons" className="space-y-4">
          <CouponManager />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <StripeConfiguration />
        </TabsContent>
      </Tabs>
    </div>
  );
}
